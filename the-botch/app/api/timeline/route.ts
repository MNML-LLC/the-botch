import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { MEMBER_SELECT } from '@/lib/prisma-selects'

// タイムライン1投稿の統一フォーマット
export type TimelineItem = {
  id: string
  type: 'otokogi' | 'warikan_settlement' | 'event_created' | 'warikan_closed'
  occurredAt: string // ISO
  actor: {
    id: string
    name: string
    initial: string
    colorBg: string
    colorText: string
  } | null
  payload: Record<string, unknown>
  href: string
}

const PAGE_SIZE = 20
const WINDOW_FACTOR = 4 // 1ページ分を取得するために十分な余裕を持った窓
const DEFAULT_WINDOW_DAYS = 90

// GET /api/timeline — Twitter 風フィード（男気 / 割り勘精算 / 割り勘クローズ / イベント追加 を UNION）
// クエリ:
//   - before=<ISO 日時>: この時刻より前（排他）の投稿を取得（カーソル）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const beforeParam = searchParams.get('before')

    const now = new Date()
    const before = beforeParam ? new Date(beforeParam) : now
    if (Number.isNaN(before.getTime())) {
      return NextResponse.json({ error: 'before の形式が正しくありません' }, { status: 400 })
    }

    // 窓: 直近 DEFAULT_WINDOW_DAYS 日を見て足りない場合は窓を広げながら少なくとも PAGE_SIZE 件集める
    // 1ページ (20 件) をおおむね生成するため、各ソースから PAGE_SIZE * WINDOW_FACTOR 件まで取得
    const limitPerSource = PAGE_SIZE * WINDOW_FACTOR
    const windowStart = new Date(before)
    windowStart.setDate(windowStart.getDate() - DEFAULT_WINDOW_DAYS)

    // 男気: createdAt を発生時刻として扱う
    const otokogi = await prisma.otokogiEvent.findMany({
      where: { createdAt: { lt: before, gte: windowStart } },
      select: {
        id: true,
        eventName: true,
        amount: true,
        place: true,
        eventDate: true,
        createdAt: true,
        payer: { select: MEMBER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      take: limitPerSource,
    })

    // 割り勘 settlement: paidAt or receivedAt を発生時刻とする
    const settlements = await prisma.warikanSettlement.findMany({
      where: {
        OR: [
          { paidAt: { lt: before, gte: windowStart } },
          { receivedAt: { lt: before, gte: windowStart } },
        ],
      },
      select: {
        id: true,
        amount: true,
        isPaid: true,
        isReceived: true,
        paidAt: true,
        receivedAt: true,
        warikanEventId: true,
        warikanEvent: { select: { eventName: true, manager: { select: MEMBER_SELECT } } },
        fromMember: { select: MEMBER_SELECT },
        toMember: { select: MEMBER_SELECT },
      },
      orderBy: [{ paidAt: 'desc' }, { receivedAt: 'desc' }],
      take: limitPerSource,
    })

    // 割り勘クローズ (updatedAt が近い CLOSED イベント)
    const warikanClosed = await prisma.warikanEvent.findMany({
      where: {
        status: 'CLOSED',
        updatedAt: { lt: before, gte: windowStart },
      },
      select: {
        id: true,
        eventName: true,
        updatedAt: true,
        manager: { select: MEMBER_SELECT },
      },
      orderBy: { updatedAt: 'desc' },
      take: limitPerSource,
    })

    // カレンダーイベント追加
    const events = await prisma.event.findMany({
      where: { createdAt: { lt: before, gte: windowStart } },
      select: {
        id: true,
        title: true,
        date: true,
        eventType: true,
        createdAt: true,
        createdBy: { select: MEMBER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      take: limitPerSource,
    })

    const items: TimelineItem[] = []

    for (const o of otokogi) {
      items.push({
        id: `otokogi:${o.id}`,
        type: 'otokogi',
        occurredAt: o.createdAt.toISOString(),
        actor: o.payer,
        payload: {
          eventName: o.eventName,
          amount: o.amount,
          place: o.place,
          eventDate: o.eventDate.toISOString(),
        },
        href: `/otokogi`,
      })
    }

    for (const s of settlements) {
      // paid と received 両方起きた場合は後方を採用して 1 件に集約（二重投稿防止）
      const ts =
        s.receivedAt && (!s.paidAt || s.receivedAt > s.paidAt) ? s.receivedAt : s.paidAt
      if (!ts) continue
      items.push({
        id: `settlement:${s.id}:${ts.getTime()}`,
        type: 'warikan_settlement',
        occurredAt: ts.toISOString(),
        actor: s.fromMember,
        payload: {
          amount: s.amount,
          toMember: s.toMember,
          warikanEventId: s.warikanEventId,
          warikanEventName: s.warikanEvent?.eventName,
          phase: s.isReceived ? 'received' : 'paid',
        },
        href: `/warikan/${s.warikanEventId}`,
      })
    }

    for (const w of warikanClosed) {
      items.push({
        id: `warikan-closed:${w.id}`,
        type: 'warikan_closed',
        occurredAt: w.updatedAt.toISOString(),
        actor: w.manager,
        payload: {
          warikanEventId: w.id,
          eventName: w.eventName,
        },
        href: `/warikan/${w.id}`,
      })
    }

    for (const ev of events) {
      items.push({
        id: `event:${ev.id}`,
        type: 'event_created',
        occurredAt: ev.createdAt.toISOString(),
        actor: ev.createdBy,
        payload: {
          eventId: ev.id,
          title: ev.title,
          date: ev.date.toISOString(),
          eventType: ev.eventType,
        },
        href: `/events/${ev.id}`,
      })
    }

    // 時系列降順ソート
    items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))

    // ページサイズまでトリム
    const page = items.slice(0, PAGE_SIZE)
    const hasMore = items.length > PAGE_SIZE
    const nextCursor = hasMore && page.length > 0
      ? page[page.length - 1].occurredAt
      : null

    return NextResponse.json({ data: page, nextCursor }, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  } catch (error) {
    return handleApiError(error, {
      logLabel: 'タイムライン取得エラー',
      fallbackMessage: 'タイムラインの取得に失敗しました',
    })
  }
}
