import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { invalidateStatsCache } from '@/lib/stats-cache'

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

    const memberSelect = { id: true, name: true, initial: true, colorBg: true, colorText: true } as const

    const events = await prisma.otokogiEvent.findMany({
      where,
      include: {
        payer: { select: memberSelect },
        participants: {
          include: { member: { select: memberSelect } },
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

    return NextResponse.json({ data: events, nextCursor })
  } catch (error) {
    console.error('男気イベント一覧取得エラー:', error)
    return NextResponse.json(
      { error: '男気イベント一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// POST /api/otokogi — 男気イベント作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { eventDate, eventName, payerId, amount, place, hasAlbum, memo, eventId, participantIds } = body

    if (!eventDate || !eventName || !payerId || amount === undefined || amount === null) {
      return NextResponse.json(
        { error: 'eventDate, eventName, payerId, amount は必須です' },
        { status: 400 }
      )
    }

    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'amount は1以上の整数を指定してください' },
        { status: 400 }
      )
    }

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { error: 'participantIds（参加者配列）は必須です' },
        { status: 400 }
      )
    }

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
          create: (participantIds as string[]).map((memberId) => ({
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
    console.error('男気イベント作成エラー:', error)
    return NextResponse.json(
      { error: '男気イベントの作成に失敗しました' },
      { status: 500 }
    )
  }
}
