import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { computeDisplayDate } from '@/lib/date-utils'
import { MEMBER_SELECT, MEMBER_SELECT_FULL } from '@/lib/prisma-selects'
import {
  readJsonBody,
  validationErrorResponse,
  idString,
  limitedString,
  dateString,
  memberIdArray,
} from '@/lib/api-validation'

type Params = { params: Promise<{ id: string }> }

// リクエストボディ検証スキーマ（部分更新のため全フィールド optional）
// status は専用エンドポイント経由のみ変更可能なため、存在チェック用に unknown で受ける
const updateWarikanSchema = z.object({
  eventName: limitedString('eventName', 200).min(1, { error: 'eventName は必須です' }).optional(),
  status: z.unknown().optional(),
  managerId: idString('managerId').nullable().optional(),
  detailDeadline: dateString('detailDeadline').nullable().optional(),
  paymentDeadline: dateString('paymentDeadline').nullable().optional(),
  memo: limitedString('memo', 1000).nullable().optional(),
  walicaUrl: limitedString('walicaUrl', 255).nullable().optional(),
  eventId: idString('eventId').nullable().optional(),
  participantIds: memberIdArray('participantIds')
    .min(1, { error: 'participantIds（参加者配列）は必須です' })
    .optional(),
})

// 割り勘サマリー include 定義（ヘッダー + 参加者のみ。expenses/settlementsは個別API）
const warikanSummaryInclude = {
  manager: { select: MEMBER_SELECT },
  event: { select: { id: true, title: true, date: true } },
  participants: {
    include: {
      member: {
        select: MEMBER_SELECT_FULL,
      },
    },
  },
  _count: {
    select: { expenses: true, settlements: true },
  },
} as const

// キャッシュ無効化（Vercel CDNでのエッジキャッシュ防止）
export const dynamic = 'force-dynamic'

// GET /api/warikan/[id] — 割り勘イベント詳細
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const event = await prisma.warikanEvent.findUnique({
      where: { id },
      include: warikanSummaryInclude,
    })

    if (!event) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    return NextResponse.json(event, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    })
  } catch (error) {
    console.error('割り勘イベント詳細取得エラー:', error)
    return NextResponse.json(
      { error: '割り勘イベント詳細の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// PUT /api/warikan/[id] — 割り勘イベント更新
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = updateWarikanSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { eventName, status, managerId, detailDeadline, paymentDeadline, memo, walicaUrl, eventId, participantIds } = result.data

    // ステータスの直接変更を禁止（専用エンドポイント経由のみ）
    if (status !== undefined) {
      return NextResponse.json(
        { error: 'ステータスは直接変更できません' },
        { status: 400 }
      )
    }

    // 現在のステータスを取得
    const currentEvent = await prisma.warikanEvent.findUnique({
      where: { id },
      select: { status: true },
    })

    if (!currentEvent) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    // CLOSED状態では編集不可
    if (currentEvent.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'クローズ済みのイベントは編集できません' },
        { status: 400 }
      )
    }

    // PAYING/CLOSED状態での参加者変更を禁止
    if (participantIds) {
      if (currentEvent.status !== 'ENTERING') {
        return NextResponse.json(
          { error: '明細入力中のイベントのみ参加者を変更できます' },
          { status: 400 }
        )
      }
    }

    const event = await prisma.$transaction(async (tx) => {
      // 参加者の更新がある場合は差し替え
      if (participantIds) {
        await tx.warikanParticipant.deleteMany({
          where: { warikanEventId: id },
        })
        await tx.warikanParticipant.createMany({
          data: participantIds.map((memberId) => ({
            warikanEventId: id,
            memberId,
          })),
        })
      }

      // displayDate再算出が必要な場合（eventName / deadline が変更されたとき）
      let displayDateUpdate: { displayDate: Date | null } | Record<string, never> = {}
      if (eventName !== undefined || detailDeadline !== undefined || paymentDeadline !== undefined) {
        // 現在のイベントを取得して、変更後の値でdisplayDateを算出
        const current = await tx.warikanEvent.findUnique({
          where: { id },
          select: { eventName: true, detailDeadline: true, paymentDeadline: true },
        })
        if (current) {
          const newEventName = eventName !== undefined ? eventName : current.eventName
          const newDdl = detailDeadline !== undefined
            ? (detailDeadline ? new Date(detailDeadline) : null)
            : current.detailDeadline
          const newPdl = paymentDeadline !== undefined
            ? (paymentDeadline ? new Date(paymentDeadline) : null)
            : current.paymentDeadline
          displayDateUpdate = { displayDate: computeDisplayDate(newEventName, newPdl, newDdl) }
        }
      }

      return tx.warikanEvent.update({
        where: { id },
        data: {
          ...(eventName !== undefined && { eventName }),
          // status は専用エンドポイント経由のみ変更可能
          ...(managerId !== undefined && { managerId }),
          ...(detailDeadline !== undefined && {
            detailDeadline: detailDeadline ? new Date(detailDeadline) : null,
          }),
          ...(paymentDeadline !== undefined && {
            paymentDeadline: paymentDeadline ? new Date(paymentDeadline) : null,
          }),
          ...(memo !== undefined && { memo }),
          ...(walicaUrl !== undefined && { walicaUrl }),
          ...(eventId !== undefined && { eventId: eventId || null }),
          ...displayDateUpdate,
        },
        include: warikanSummaryInclude,
      })
    })

    return NextResponse.json(event)
  } catch (error) {
    console.error('割り勘イベント更新エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: '割り勘イベントの更新に失敗しました' },
      { status: 500 }
    )
  }
}

// DELETE /api/warikan/[id] — 割り勘イベント削除
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    await prisma.warikanEvent.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('割り勘イベント削除エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: '割り勘イベントの削除に失敗しました' },
      { status: 500 }
    )
  }
}
