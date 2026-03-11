import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string; settlementId: string }> }

// PATCH /api/warikan/[id]/settlements/[settlementId] — 精算ステータス更新
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id, settlementId } = await params
    const body = await request.json()
    const { action } = body as { action?: 'pay' | 'receive' }

    if (action !== 'pay' && action !== 'receive') {
      return NextResponse.json(
        { error: "action は 'pay' または 'receive' を指定してください" },
        { status: 400 }
      )
    }

    // 割り勘イベントの存在確認
    const warikanEvent = await prisma.warikanEvent.findUnique({
      where: { id },
    })

    if (!warikanEvent) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    if (warikanEvent.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'クローズ済みのイベントは更新できません' },
        { status: 400 }
      )
    }

    // 精算レコード更新
    const now = new Date()
    const updateData =
      action === 'pay'
        ? { isPaid: true, paidAt: now }
        : { isReceived: true, receivedAt: now }

    // settlementがこのwarikanEventに属するか検証
    const existing = await prisma.warikanSettlement.findFirst({
      where: { id: settlementId, warikanEventId: id },
    })
    if (!existing) {
      return NextResponse.json(
        { error: '精算レコードが見つかりません' },
        { status: 404 }
      )
    }

    const settlement = await prisma.warikanSettlement.update({
      where: { id: settlementId },
      data: updateData,
      include: { fromMember: true, toMember: true },
    })

    // 全ての精算が受領済みかチェック → 自動クローズ
    const allSettlements = await prisma.warikanSettlement.findMany({
      where: { warikanEventId: id },
    })

    const allReceived = allSettlements.length > 0 && allSettlements.every((s) => s.isReceived)

    if (allReceived) {
      await prisma.warikanEvent.update({
        where: { id },
        data: { status: 'CLOSED' },
      })
    }

    return NextResponse.json({
      settlement,
      eventClosed: allReceived,
    })
  } catch (error) {
    console.error('精算ステータス更新エラー:', error)
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: '精算レコードが見つかりません' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: '精算ステータスの更新に失敗しました' },
      { status: 500 }
    )
  }
}
