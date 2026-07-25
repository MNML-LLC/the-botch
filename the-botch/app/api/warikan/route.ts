import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { WarikanStatus } from '@/lib/generated/prisma/client'
import { computeDisplayDate } from '@/lib/date-utils'
import { MEMBER_SELECT } from '@/lib/prisma-selects'
import {
  readJsonBody,
  validationErrorResponse,
  idString,
  limitedString,
  dateString,
  memberIdArray,
} from '@/lib/api-validation'

// GET /api/warikan — 割り勘イベント一覧（フィルタ: status, year、カーソルベースページネーション）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const year = searchParams.get('year')
    const cursor = searchParams.get('cursor')
    const take = 20

    const where: Record<string, unknown> = {}

    if (status && Object.values(WarikanStatus).includes(status as WarikanStatus)) {
      where.status = status as WarikanStatus
    }

    if (year) {
      const startDate = new Date(`${year}-01-01`)
      const endDate = new Date(`${Number(year) + 1}-01-01`)
      where.createdAt = { gte: startDate, lt: endDate }
    }

    const events = await prisma.warikanEvent.findMany({
      where,
      include: {
        manager: { select: MEMBER_SELECT },
        participants: {
          select: { member: { select: { id: true, name: true } } },
        },
        _count: {
          select: { expenses: true, settlements: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1, // 次ページ有無の判定用に1件多く取得
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })

    // 次ページの有無を判定
    let nextCursor: string | null = null
    if (events.length > take) {
      const nextItem = events.pop()!
      nextCursor = nextItem.id
    }

    return NextResponse.json(
      { data: events, nextCursor },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    )
  } catch (error) {
    return handleApiError(error, { logLabel: '割り勘イベント一覧取得エラー', fallbackMessage: '割り勘イベント一覧の取得に失敗しました' })
  }
}

// リクエストボディ検証スキーマ（文字列長は DB カラム定義に対応）
const createWarikanSchema = z.object({
  eventName: limitedString('eventName', 200).min(1, { error: 'eventName は必須です' }),
  managerId: idString('managerId').nullable().optional(),
  detailDeadline: dateString('detailDeadline').nullable().optional(),
  paymentDeadline: dateString('paymentDeadline').nullable().optional(),
  memo: limitedString('memo', 1000).nullable().optional(),
  walicaUrl: limitedString('walicaUrl', 255).nullable().optional(),
  eventId: idString('eventId').nullable().optional(),
  participantIds: memberIdArray('participantIds').min(1, {
    error: 'participantIds（参加者配列）は必須です',
  }),
})

// POST /api/warikan — 割り勘イベント作成
export async function POST(request: NextRequest) {
  try {
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = createWarikanSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { eventName, managerId, detailDeadline, paymentDeadline, memo, walicaUrl, eventId, participantIds } = result.data

    // displayDate を算出（カレンダー表示用）
    const ddl = detailDeadline ? new Date(detailDeadline) : null
    const pdl = paymentDeadline ? new Date(paymentDeadline) : null
    const displayDate = computeDisplayDate(eventName, pdl, ddl)

    const event = await prisma.warikanEvent.create({
      data: {
        eventName,
        managerId: managerId ?? null,
        detailDeadline: ddl,
        paymentDeadline: pdl,
        displayDate,
        memo: memo ?? null,
        walicaUrl: walicaUrl ?? null,
        eventId: eventId ?? null,
        participants: {
          create: participantIds.map((memberId) => ({
            memberId,
          })),
        },
      },
      include: {
        manager: true,
        participants: {
          include: { member: true },
        },
      },
    })

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    return handleApiError(error, { logLabel: '割り勘イベント作成エラー', fallbackMessage: '割り勘イベントの作成に失敗しました' })
  }
}
