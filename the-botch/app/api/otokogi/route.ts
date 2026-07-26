import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { invalidateStatsCache } from '@/lib/stats-cache'
import { MEMBER_SELECT } from '@/lib/prisma-selects'
import { readJsonBody } from '@/lib/api-validation'
import { createOtokogiSchema } from '@/lib/schemas/otokogi'

// GET /api/otokogi — 男気イベント一覧（フィルタ: year, payer、カーソルベースページネーション）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const payerId = searchParams.get('payer')
    const cursor = searchParams.get('cursor')
    const take = 20

    const where: Record<string, unknown> = {}

    if (year) {
      const startDate = new Date(`${year}-01-01`)
      const endDate = new Date(`${Number(year) + 1}-01-01`)
      where.eventDate = { gte: startDate, lt: endDate }
    }

    if (payerId) {
      where.payerId = payerId
    }

    const events = await prisma.otokogiEvent.findMany({
      where,
      include: {
        payer: { select: MEMBER_SELECT },
        participants: {
          include: { member: { select: MEMBER_SELECT } },
        },
      },
      orderBy: { eventDate: 'desc' },
      take: take + 1, // 次ページ有無の判定用に1件多く取得
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    // 次ページの有無を判定
    let nextCursor: string | null = null
    if (events.length > take) {
      const nextItem = events.pop()!
      nextCursor = nextItem.id
    }

    return NextResponse.json({ data: events, nextCursor }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (error) {
    return handleApiError(error, { logLabel: '男気イベント一覧取得エラー', fallbackMessage: '男気イベント一覧の取得に失敗しました' })
  }
}

// POST /api/otokogi — 男気イベント作成
export async function POST(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = createOtokogiSchema.safeParse(parsed.body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation error', details: result.error.issues },
        { status: 400 },
      )
    }

    const { eventDate, eventName, payerId, amount, place, hasAlbum, memo, eventId, participantIds } = result.data

    const event = await prisma.otokogiEvent.create({
      data: {
        eventDate: new Date(eventDate),
        eventName,
        payerId,
        amount,
        place: place ?? null,
        hasAlbum: hasAlbum ?? false,
        memo: memo ?? null,
        eventId: eventId ?? null,
        participants: {
          create: participantIds.map((memberId) => ({
            memberId,
          })),
        },
      },
      include: {
        payer: true,
        participants: {
          include: { member: true },
        },
      },
    })

    // 統計キャッシュ無効化（イベント追加で統計が変わる）
    invalidateStatsCache()

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    return handleApiError(error, { logLabel: '男気イベント作成エラー', fallbackMessage: '男気イベントの作成に失敗しました' })
  }
}
