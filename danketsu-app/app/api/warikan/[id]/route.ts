import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { WarikanStatus } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

// GET /api/warikan/[id] — 割り勘イベント詳細
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const event = await prisma.warikanEvent.findUnique({
      where: { id },
      include: {
        manager: true,
        event: true,
        participants: {
          include: { member: true },
        },
        expenses: {
          include: {
            payer: true,
            debtors: { include: { member: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        settlements: {
          include: {
            fromMember: true,
            toMember: {
              include: { bankAccount: true },
            },
          },
          orderBy: { amount: 'desc' },
        },
      },
    })

    if (!event) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    return NextResponse.json(event)
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
        },
        include: {
          manager: true,
          participants: {
            include: { member: true },
          },
          expenses: {
            include: {
              payer: true,
              debtors: { include: { member: true } },
            },
          },
          settlements: {
            include: {
              fromMember: true,
              toMember: {
                include: { bankAccount: true },
              },
            },
          },
        },
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
