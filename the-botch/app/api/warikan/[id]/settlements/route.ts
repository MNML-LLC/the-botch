import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

// キャッシュ無効化（Vercel CDNでのエッジキャッシュ防止）
export const dynamic = 'force-dynamic'

// GET /api/warikan/[id]/settlements — 精算結果一覧
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const settlements = await prisma.warikanSettlement.findMany({
      where: { warikanEventId: id },
      include: {
        fromMember: {
          select: { id: true, name: true, initial: true, colorBg: true, colorText: true, paypayId: true },
        },
        toMember: {
          select: { id: true, name: true, initial: true, colorBg: true, colorText: true, paypayId: true, bankAccount: true },
        },
      },
      orderBy: { amount: 'desc' },
    })

    return NextResponse.json(settlements, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    })
  } catch (error) {
    console.error('精算結果一覧取得エラー:', error)
    return NextResponse.json(
      { error: '精算結果一覧の取得に失敗しました' },
      { status: 500 }
    )
  }
}

// POST /api/warikan/[id]/settlements — 精算計算・Settlement レコード生成
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params

    // 割り勘イベント取得（参加者・立替明細・対象者含む）
    const warikanEvent = await prisma.warikanEvent.findUnique({
      where: { id },
      include: {
        participants: true,
        expenses: {
          include: {
            debtors: true,
          },
        },
      },
    })

    if (!warikanEvent) {
      return NextResponse.json(
        { error: '割り勘イベントが見つかりません' },
        { status: 404 }
      )
    }

    if (warikanEvent.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'クローズ済みのイベントは再精算できません' },
        { status: 400 }
      )
    }

    if (warikanEvent.expenses.length === 0) {
      return NextResponse.json(
        { error: '立替明細がありません' },
        { status: 400 }
      )
    }

    if (warikanEvent.participants.length === 0) {
      return NextResponse.json(
        { error: '参加者がいません' },
        { status: 400 }
      )
    }

    const participantIds = warikanEvent.participants.map((p) => p.memberId)

    // 各メンバーの立替額と負担額を計算
    const paidByMember: Record<string, number> = {}
    const owedByMember: Record<string, number> = {}
    for (const memberId of participantIds) {
      paidByMember[memberId] = 0
      owedByMember[memberId] = 0
    }

    const totalAmount = warikanEvent.expenses.reduce((sum, e) => sum + e.amount, 0)

    for (const expense of warikanEvent.expenses) {
      // 立替者の支払額を加算（参加者でない立替者もバランスに含める）
      if (paidByMember[expense.payerId] === undefined) {
        paidByMember[expense.payerId] = 0
        owedByMember[expense.payerId] = 0
      }
      paidByMember[expense.payerId] += expense.amount

      // 対象者で按分（debtorsが空なら全参加者で均等割り）
      const filteredDebtors = expense.debtors.length > 0
        ? expense.debtors.map((d) => d.memberId).filter((id) => participantIds.includes(id))
        : []
      // debtors指定なし or 全員フィルタで消えた場合は全参加者にフォールバック
      const debtorMemberIds = filteredDebtors.length > 0 ? filteredDebtors : participantIds

      // 整数演算: 端数は先頭のメンバーに割り当て（1円も失わない）
      const baseShare = Math.floor(expense.amount / debtorMemberIds.length)
      const remainder = expense.amount % debtorMemberIds.length
      for (let i = 0; i < debtorMemberIds.length; i++) {
        const share = baseShare + (i < remainder ? 1 : 0)
        owedByMember[debtorMemberIds[i]] = (owedByMember[debtorMemberIds[i]] ?? 0) + share
      }
    }

    // 各メンバーの収支（立替額 - 負担額）
    // プラス = 立替超過（受け取る側）、マイナス = 不足（支払う側）
    const balances: { memberId: string; balance: number }[] = participantIds.map(
      (memberId) => ({
        memberId,
        balance: paidByMember[memberId] - owedByMember[memberId],
      })
    )

    // 貪欲法で最適な送金フローを計算
    // 債権者（balance > 0）と債務者（balance < 0）に分ける
    const creditors = balances
      .filter((b) => b.balance > 0)
      .sort((a, b) => b.balance - a.balance) // 大きい順
    const debtors = balances
      .filter((b) => b.balance < 0)
      .sort((a, b) => a.balance - b.balance) // 小さい順（負債が大きい順）

    const settlements: { fromMemberId: string; toMemberId: string; amount: number }[] = []

    let ci = 0
    let di = 0

    while (ci < creditors.length && di < debtors.length) {
      const credit = creditors[ci].balance
      const debt = -debtors[di].balance // 正の値に変換

      const transferAmount = Math.min(credit, debt)
      // 1円未満は切り捨て
      const roundedAmount = Math.floor(transferAmount)

      if (roundedAmount > 0) {
        settlements.push({
          fromMemberId: debtors[di].memberId,
          toMemberId: creditors[ci].memberId,
          amount: roundedAmount,
        })
      }

      creditors[ci].balance -= transferAmount
      debtors[di].balance += transferAmount

      if (creditors[ci].balance < 1) ci++
      if (debtors[di].balance > -1) di++
    }

    // トランザクションで既存Settlementを削除して新規作成 + ステータス更新
    const result = await prisma.$transaction(async (tx) => {
      // 既存の精算結果を削除
      await tx.warikanSettlement.deleteMany({
        where: { warikanEventId: id },
      })

      // 新規精算結果を一括作成
      await tx.warikanSettlement.createMany({
        data: settlements.map((s) => ({
          warikanEventId: id,
          fromMemberId: s.fromMemberId,
          toMemberId: s.toMemberId,
          amount: s.amount,
        })),
      })

      // ステータスを PAYING に更新
      return tx.warikanEvent.update({
        where: { id },
        data: { status: 'PAYING' },
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
            include: { fromMember: true, toMember: true },
            orderBy: { amount: 'desc' },
          },
        },
      })
    })

    return NextResponse.json({
      ...result,
      summary: {
        totalAmount,
        settlementCount: settlements.length,
      },
    })
  } catch (error) {
    console.error('精算計算エラー:', error)
    return NextResponse.json(
      { error: '精算計算に失敗しました' },
      { status: 500 }
    )
  }
}
