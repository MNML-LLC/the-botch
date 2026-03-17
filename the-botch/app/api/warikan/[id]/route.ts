import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { WarikanStatus } from '@prisma/client'
import { computeDisplayDate } from '@/lib/date-utils'

type Params = { params: Promise<{ id: string }> }

// メンバー表示用の共通フィールド
const memberSelect = { id: true, name: true, initial: true, colorBg: true, colorText: true } as const

// 割り勘詳細の共通 include 定義
const warikanDetailInclude = {
  manager: { select: memberSelect },
  event: { select: { id: true, title: true, date: true } },
  participants: {
    include: {
      member: {
        select: { ...memberSelect, fullName: true },
      },
    },
  },
  expenses: {
    include: {
      payer: { select: memberSelect },
      debtors: {
        include: {
          member: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  settlements: {
    include: {
      fromMember: {
        select: { ...memberSelect, paypayId: true },
      },
      toMember: {
        select: { ...memberSelect, paypayId: true, bankAccount: true },
      },
    },
    orderBy: { amount: 'desc' as const },
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
      include: warikanDetailInclude,
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
    const body = await request.json()
    const { eventName, status, managerId, detailDeadline, paymentDeadline, memo, walicaUrl, eventId, participantIds } = body

    const event = await prisma.$transaction(async (tx) => {
      // 参加者の更新がある場合は差し替え
      if (participantIds && Array.isArray(participantIds)) {
        await tx.warikanParticipant.deleteMany({
          where: { warikanEventId: id },
        })
        await tx.warikanParticipant.createMany({
          data: (participantIds as string[]).map((memberId) => ({
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
          ...(status !== undefined &&
            Object.values(WarikanStatus).includes(status) && { status }),
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
        include: warikanDetailInclude,
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
