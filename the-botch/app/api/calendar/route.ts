import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// メンバー表示用の共通フィールド
const memberSelect = { id: true, name: true, initial: true, colorBg: true, colorText: true } as const

// GET /api/calendar?year=2026&month=3 — 月のカレンダーデータ（イベント + 男気 + 割り勘）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year') ?? String(new Date().getFullYear())
    const month = searchParams.get('month') ?? String(new Date().getMonth() + 1)

    const startDate = new Date(`${year}-${month.padStart(2, '0')}-01`)
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + 1)

    // 3種類のデータを並行取得
    const [events, otokogiEvents, warikanEvents] = await Promise.all([
      // カレンダーイベント（カレンダー表示に必要なフィールドのみ取得）
      prisma.event.findMany({
        where: {
          OR: [
            { date: { gte: startDate, lt: endDate } },
            { endDate: { gte: startDate, lt: endDate } },
            { AND: [{ date: { lt: startDate } }, { endDate: { gte: endDate } }] },
          ],
        },
        select: {
          id: true,
          title: true,
          date: true,
          endDate: true,
          eventType: true,
          createdBy: { select: memberSelect },
          participants: { select: { member: { select: memberSelect } } },
        },
        orderBy: { date: 'asc' },
      }),

      // 男気イベント（カレンダー表示に必要なフィールドのみ取得）
      prisma.otokogiEvent.findMany({
        where: {
          eventDate: { gte: startDate, lt: endDate },
        },
        select: {
          id: true,
          eventName: true,
          eventDate: true,
          amount: true,
          place: true,
          payer: { select: memberSelect },
          participants: { select: { member: { select: memberSelect } } },
        },
        orderBy: { eventDate: 'asc' },
      }),

      // 割り勘イベント（カレンダー表示に必要なフィールドのみ取得）
      prisma.warikanEvent.findMany({
        where: {
          OR: [
            { detailDeadline: { gte: startDate, lt: endDate } },
            { paymentDeadline: { gte: startDate, lt: endDate } },
            { displayDate: { gte: startDate, lt: endDate } },
          ],
        },
        select: {
          id: true,
          eventName: true,
          status: true,
          detailDeadline: true,
          paymentDeadline: true,
          displayDate: true,
          manager: { select: memberSelect },
          participants: { select: { member: { select: memberSelect } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // displayDate を文字列として付与（フロント互換性維持）
    const warikanEventsWithDisplay = warikanEvents.map((w) => {
      const displayDateStr = w.displayDate
        ? w.displayDate.toISOString().slice(0, 10)
        : (w.paymentDeadline ? w.paymentDeadline.toISOString().slice(0, 10) : null)
          ?? (w.detailDeadline ? w.detailDeadline.toISOString().slice(0, 10) : null)
      return { ...w, displayDate: displayDateStr }
    })

    return NextResponse.json({ events, otokogiEvents, warikanEvents: warikanEventsWithDisplay }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error('カレンダーデータ取得エラー:', error)
    return NextResponse.json({ error: 'カレンダーデータの取得に失敗しました' }, { status: 500 })
  }
}
