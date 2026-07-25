import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { readJsonBody, validationErrorResponse } from '@/lib/api-validation'

type Params = { params: Promise<{ id: string; settlementId: string }> }

// リクエストボディ検証スキーマ
const updateSettlementSchema = z.object({
  action: z.enum(['pay', 'receive'], {
    error: "action は 'pay' または 'receive' を指定してください",
  }),
})

// PATCH /api/warikan/[id]/settlements/[settlementId] — 精算ステータス更新
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id, settlementId } = await params
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = updateSettlementSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { action } = result.data

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

    if (warikanEvent.status !== 'PAYING') {
      const msg = action === 'pay'
        ? '送金中のイベントのみ送金済みにできます'
        : '送金中のイベントのみ受領確認できます'
      return NextResponse.json(
        { error: msg },
        { status: 400 }
      )
    }

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

    // 受領確認は送金済みの精算のみ
    if (action === 'receive' && !existing.isPaid) {
      return NextResponse.json(
        { error: '送金済みでない精算は受領確認できません' },
        { status: 400 }
      )
    }

    // 精算レコード更新
    const now = new Date()
    const updateData =
      action === 'pay'
        ? { isPaid: true, paidAt: now }
        : { isReceived: true, receivedAt: now }

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
    return handleApiError(error, {
      logLabel: '精算ステータス更新エラー',
      fallbackMessage: '精算ステータスの更新に失敗しました',
      prismaMessages: { P2025: '精算レコードが見つかりません' },
    })
  }
}
