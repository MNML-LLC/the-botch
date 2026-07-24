import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
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

type Params = { params: Promise<{ id: string }> }

// リクエストボディ検証スキーマ（部分更新のため全フィールド optional）
const updateOtokogiSchema = z.object({
  eventDate: dateString('eventDate').optional(),
  eventName: limitedString('eventName', 100).min(1, { error: 'eventName は必須です' }).optional(),
  payerId: idString('payerId').optional(),
  amount: positiveInt('amount').optional(),
  place: limitedString('place', 100).nullable().optional(),
  hasAlbum: z.boolean({ error: 'hasAlbum は真偽値で指定してください' }).optional(),
  memo: limitedString('memo', 1000).nullable().optional(),
  participantIds: memberIdArray('participantIds')
    .min(1, { error: 'participantIds（参加者配列）は必須です' })
    .optional(),
})

// GET /api/otokogi/[id] — 男気イベント詳細
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const event = await prisma.otokogiEvent.findUnique({
      where: { id },
      include: {
        payer: true,
        participants: {
          include: { member: true },
        },
      },
    })

    if (!event) {
      return NextResponse.json(
        { error: '男気イベントが見つかりません' },
        { status: 404 }
      )
    }

    return NextResponse.json(event, {
      headers: { 'Cache-Control': 'private, max-age=600' },
    })
  } catch (error) {
    return handleApiError(error, { logLabel: '男気イベント詳細取得エラー', fallbackMessage: '男気イベント詳細の取得に失敗しました' })
  }
}

// PUT /api/otokogi/[id] — 男気イベント更新
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = updateOtokogiSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { eventDate, eventName, payerId, amount, place, hasAlbum, memo, participantIds } = result.data

    const event = await prisma.$transaction(async (tx) => {
      // 参加者の更新がある場合は差し替え
      if (participantIds) {
        await tx.otokogiParticipant.deleteMany({
          where: { otokogiEventId: id },
        })
        await tx.otokogiParticipant.createMany({
          data: participantIds.map((memberId) => ({
            otokogiEventId: id,
            memberId,
          })),
        })
      }

      return tx.otokogiEvent.update({
        where: { id },
        data: {
          ...(eventDate !== undefined && { eventDate: new Date(eventDate) }),
          ...(eventName !== undefined && { eventName }),
          ...(payerId !== undefined && { payerId }),
          ...(amount !== undefined && { amount }),
          ...(place !== undefined && { place }),
          ...(hasAlbum !== undefined && { hasAlbum }),
          ...(memo !== undefined && { memo }),
        },
        include: {
          payer: true,
          participants: {
            include: { member: true },
          },
        },
      })
    })

    // 統計キャッシュ無効化（イベント更新で統計が変わる）
    invalidateStatsCache()

    return NextResponse.json(event)
  } catch (error) {
    return handleApiError(error, {
      logLabel: '男気イベント更新エラー',
      fallbackMessage: '男気イベントの更新に失敗しました',
      prismaMessages: { P2025: '男気イベントが見つかりません' },
    })
  }
}

// DELETE /api/otokogi/[id] — 男気イベント削除
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await prisma.otokogiEvent.delete({
      where: { id },
    })

    // 統計キャッシュ無効化（イベント削除で統計が変わる）
    invalidateStatsCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, {
      logLabel: '男気イベント削除エラー',
      fallbackMessage: '男気イベントの削除に失敗しました',
      prismaMessages: { P2025: '男気イベントが見つかりません' },
    })
  }
}
