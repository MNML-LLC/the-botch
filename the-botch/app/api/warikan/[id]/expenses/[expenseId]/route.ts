import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { WARIKAN_STATUS_LABELS } from '@/lib/constants'
import { calculateSettlements } from '@/lib/warikan-calc'
import {
  readJsonBody,
  validationErrorResponse,
  idString,
  limitedString,
  positiveInt,
  memberIdArray,
} from '@/lib/api-validation'

type Params = { params: Promise<{ id: string; expenseId: string }> }

// リクエストボディ検証スキーマ（部分更新のため全フィールド optional）
const updateExpenseSchema = z.object({
  payerId: idString('payerId').optional(),
  description: limitedString('description', 200).min(1, { error: 'description は必須です' }).optional(),
  amount: positiveInt('amount').optional(),
  debtorIds: memberIdArray('debtorIds')
    .min(1, { error: '対象者を1人以上指定してください' })
    .optional(),
})

// PUT /api/warikan/[id]/expenses/[expenseId] — 立替明細更新
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id, expenseId } = await params
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = updateExpenseSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { payerId, description, amount, debtorIds } = result.data

    // 割り勘イベントの存在・ステータス確認
    const warikanEvent = await prisma.warikanEvent.findUnique({
      where: { id },
      include: { participants: true },
    })

    if (!warikanEvent) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    if (warikanEvent.status !== 'ENTERING') {
      return NextResponse.json(
        { error: `${WARIKAN_STATUS_LABELS.ENTERING}のイベントのみ編集できます` },
        { status: 400 }
      )
    }

    // debtorIds がイベント参加者に含まれるか検証
    if (debtorIds !== undefined) {
      const participantIds = new Set(warikanEvent.participants.map((p) => p.memberId))
      const invalidIds = debtorIds.filter((did) => !participantIds.has(did))
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: 'イベント参加者でないメンバーが含まれています' },
          { status: 400 }
        )
      }
    }

    // expenseがこのwarikanEventに属するか検証
    const existingExpense = await prisma.warikanExpense.findFirst({
      where: { id: expenseId, warikanEventId: id },
    })
    if (!existingExpense) {
      return NextResponse.json(
        { error: '立替明細が見つかりません' },
        { status: 404 }
      )
    }

    // debtorIdsが指定された場合はトランザクションで更新
    if (debtorIds !== undefined) {
      const expense = await prisma.$transaction(async (tx) => {
        const updated = await tx.warikanExpense.update({
          where: { id: expenseId },
          data: {
            ...(payerId !== undefined && { payerId }),
            ...(description !== undefined && { description }),
            ...(amount !== undefined && { amount }),
          },
        })

        // 既存debtorを全削除して再作成
        await tx.warikanExpenseDebtor.deleteMany({
          where: { expenseId },
        })
        await tx.warikanExpenseDebtor.createMany({
          data: debtorIds.map((memberId) => ({
            expenseId,
            memberId,
          })),
        })

        return tx.warikanExpense.findUnique({
          where: { id: expenseId },
          include: { payer: true, debtors: { include: { member: true } } },
        })
      })

      // 明細更新時は常に精算を自動再計算
      await recalculateSettlementsForEvent(id, warikanEvent.participants.map((p) => p.memberId))

      return NextResponse.json(expense)
    }

    const expense = await prisma.warikanExpense.update({
      where: { id: expenseId },
      data: {
        ...(payerId !== undefined && { payerId }),
        ...(description !== undefined && { description }),
        ...(amount !== undefined && { amount }),
      },
      include: { payer: true, debtors: { include: { member: true } } },
    })

    // 明細更新時は常に精算を自動再計算
    await recalculateSettlementsForEvent(id, warikanEvent.participants.map((p) => p.memberId))

    return NextResponse.json(expense)
  } catch (error) {
    return handleApiError(error, {
      logLabel: '立替明細更新エラー',
      fallbackMessage: '立替明細の更新に失敗しました',
      prismaMessages: { P2025: '立替明細が見つかりません' },
    })
  }
}

// 明細が変更された場合、精算結果を再計算する
async function recalculateSettlementsForEvent(warikanEventId: string, participantIds: string[]) {
  const allExpenses = await prisma.warikanExpense.findMany({
    where: { warikanEventId },
    include: { debtors: true },
  })
  const { settlements } = calculateSettlements(allExpenses, participantIds)

  await prisma.$transaction(async (tx) => {
    await tx.warikanSettlement.deleteMany({ where: { warikanEventId } })
    if (settlements.length > 0) {
      await tx.warikanSettlement.createMany({
        data: settlements.map((s) => ({
          warikanEventId,
          fromMemberId: s.fromMemberId,
          toMemberId: s.toMemberId,
          amount: s.amount,
        })),
      })
    }
  })
}

// DELETE /api/warikan/[id]/expenses/[expenseId] — 立替明細削除
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id, expenseId } = await params

    // 割り勘イベントの存在・ステータス確認
    const warikanEvent = await prisma.warikanEvent.findUnique({
      where: { id },
      include: { participants: true },
    })

    if (!warikanEvent) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    if (warikanEvent.status !== 'ENTERING') {
      return NextResponse.json(
        { error: `${WARIKAN_STATUS_LABELS.ENTERING}のイベントのみ編集できます` },
        { status: 400 }
      )
    }

    // expenseがこのwarikanEventに属するか検証
    const targetExpense = await prisma.warikanExpense.findFirst({
      where: { id: expenseId, warikanEventId: id },
    })
    if (!targetExpense) {
      return NextResponse.json(
        { error: '立替明細が見つかりません' },
        { status: 404 }
      )
    }

    await prisma.warikanExpense.delete({
      where: { id: expenseId },
    })

    // 明細削除時は常に精算を自動再計算
    await recalculateSettlementsForEvent(id, warikanEvent.participants.map((p) => p.memberId))

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleApiError(error, {
      logLabel: '立替明細削除エラー',
      fallbackMessage: '立替明細の削除に失敗しました',
      prismaMessages: { P2025: '立替明細が見つかりません' },
    })
  }
}
