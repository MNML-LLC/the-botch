import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { WARIKAN_STATUS_LABELS } from '@/lib/constants'
import { calculateSettlements } from '@/lib/warikan-calc'
import { MEMBER_SELECT_WITH_PAYPAY, MEMBER_SELECT_WITH_BANK } from '@/lib/prisma-selects'

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
          select: MEMBER_SELECT_WITH_PAYPAY,
        },
        toMember: {
          select: MEMBER_SELECT_WITH_BANK,
        },
      },
      orderBy: { amount: 'desc' },
    })

    return NextResponse.json(settlements, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    })
  } catch (error) {
    return handleApiError(error, { logLabel: '精算結果一覧取得エラー', fallbackMessage: '精算結果一覧の取得に失敗しました' })
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

    if (warikanEvent.status !== 'ENTERING') {
      return NextResponse.json(
        { error: `${WARIKAN_STATUS_LABELS.ENTERING}のイベントのみ精算を確定できます` },
        { status: 400 }
      )
    }

    if (warikanEvent.expenses.length === 0) {
      return NextResponse.json(
        { error: '明細が登録されていません' },
        { status: 400 }
      )
    }

    if (warikanEvent.participants.length < 2) {
      return NextResponse.json(
        { error: '参加者が2人以上必要です' },
        { status: 400 }
      )
    }

    const participantIds = warikanEvent.participants.map((p) => p.memberId)

    // 整数演算で精算フローを計算
    const { settlements, totalAmount } = calculateSettlements(
      warikanEvent.expenses,
      participantIds
    )

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
    return handleApiError(error, { logLabel: '精算計算エラー', fallbackMessage: '精算計算に失敗しました' })
  }
}
