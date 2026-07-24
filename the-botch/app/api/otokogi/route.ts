import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { invalidateStatsCache } from '@/lib/stats-cache'
import {
  readJsonBody,
  validationErrorResponse,
  idString,
  limitedString,
  dateString,
  positiveInt,
  memberIdArray,
} from '@/lib/api-validation'

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

    return NextResponse.json({ data: events, nextCursor }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (error) {
    console.error('男気イベント一覧取得エラー:', error)
    return NextResponse.json(
      { error: '男気イベント一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// リクエストボディ検証スキーマ（文字列長は DB カラム定義に対応）
const createOtokogiSchema = z.object({
  eventDate: dateString('eventDate'),
  eventName: limitedString('eventName', 100).min(1, { error: 'eventName は必須です' }),
  payerId: idString('payerId'),
  amount: positiveInt('amount'),
  place: limitedString('place', 100).nullable().optional(),
  hasAlbum: z.boolean({ error: 'hasAlbum は真偽値で指定してください' }).optional(),
  memo: limitedString('memo', 1000).nullable().optional(),
  eventId: idString('eventId').nullable().optional(),
  participantIds: memberIdArray('participantIds').min(1, {
    error: 'participantIds（参加者配列）は必須です',
  }),
})

// POST /api/otokogi — 男気イベント作成
export async function POST(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = createOtokogiSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

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
    console.error('男気イベント作成エラー:', error)
    return NextResponse.json(
      { error: '男気イベントの作成に失敗しました' },
      { status: 500 }
    )
  }
}
