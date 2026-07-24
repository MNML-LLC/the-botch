import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { calculateSettlements } from '@/lib/warikan-calc'
import { MEMBER_SELECT } from '@/lib/prisma-selects'
import {
  readJsonBody,
  validationErrorResponse,
  idString,
  limitedString,
  positiveInt,
  memberIdArray,
} from '@/lib/api-validation'

type Params = { params: Promise<{ id: string }> }

// リクエストボディ検証スキーマ（description は DB の VarChar(200) に対応）
const createExpenseSchema = z.object({
  payerId: idString('payerId'),
  description: limitedString('description', 200).min(1, { error: 'description は必須です' }),
  amount: positiveInt('amount'),
  // 対象者。省略・空配列時は全参加者
  debtorIds: memberIdArray('debtorIds').optional(),
})

// GET /api/warikan/[id]/expenses — 割り勘立替明細一覧
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const expenses = await prisma.warikanExpense.findMany({
      where: { warikanEventId: id },
      include: {
        payer: {
          select: MEMBER_SELECT,
        },
        debtors: {
          include: {
            member: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(expenses, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (error) {
    console.error('立替明細一覧取得エラー:', error)
    return NextResponse.json(
      { error: '立替明細一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// POST /api/warikan/[id]/expenses — 立替明細追加
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const parsed = await readJsonBody(request)
    if (!parsed.ok) return parsed.response

    const result = createExpenseSchema.safeParse(parsed.body)
    if (!result.success) return validationErrorResponse(result.error)

    const { payerId, description, amount, debtorIds } = result.data

    // 割り勘イベント＋参加者を取得
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
        { error: '明細入力中のイベントのみ編集できます' },
        { status: 400 }
      )
    }

    // 対象者：指定がなければ全参加者
    const targetDebtorIds = debtorIds && debtorIds.length > 0
      ? debtorIds
      : warikanEvent.participants.map((p) => p.memberId)

    const expense = await prisma.warikanExpense.create({
      data: {
        warikanEventId: id,
        payerId,
        description,
        amount,
        debtors: {
          create: targetDebtorIds.map((memberId) => ({ memberId })),
        },
      },
      include: {
        payer: true,
        debtors: { include: { member: true } },
      },
    })

    // 明細追加時は常に精算を自動再計算
    const allExpenses = await prisma.warikanExpense.findMany({
      where: { warikanEventId: id },
      include: { debtors: true },
    })
    const participantIds = warikanEvent.participants.map((p) => p.memberId)
    const { settlements } = calculateSettlements(allExpenses, participantIds)

    await prisma.$transaction(async (tx) => {
      await tx.warikanSettlement.deleteMany({ where: { warikanEventId: id } })
      if (settlements.length > 0) {
        await tx.warikanSettlement.createMany({
          data: settlements.map((s) => ({
            warikanEventId: id,
            fromMemberId: s.fromMemberId,
            toMemberId: s.toMemberId,
            amount: s.amount,
          })),
        })
      }
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('立替明細追加エラー:', error)
    return NextResponse.json(
      { error: '立替明細の追加に失敗しました' },
      { status: 500 }
    )
  }
}
