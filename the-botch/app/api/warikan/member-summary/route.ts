import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { MEMBER_SELECT } from '@/lib/prisma-selects'
import { parsePeriodFromSearchParams } from '@/lib/date-utils'

// GET /api/warikan/member-summary
// クエリパラメータ:
//   period=current-fy|last-fy|current-month|all|custom — 期間プリセット（優先）
//   from / to                                           — カスタム範囲
//   year=YYYY                                           — 後方互換（カレンダー年）
//
// 全 CLOSED イベントの精算結果（WarikanSettlement）を集計し、
// メンバー間の純収支（ネット化した送金指示）を返す。
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const periodParam = searchParams.get('period')
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    let dateFilter: { createdAt?: { gte?: Date; lte?: Date; lt?: Date } } = {}

    if (periodParam || fromParam || toParam) {
      const { from, to } = parsePeriodFromSearchParams(searchParams)
      if (from || to) {
        dateFilter = {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      }
    } else if (yearParam) {
      const parsed = Number.parseInt(yearParam, 10)
      if (!Number.isFinite(parsed) || parsed < 1970 || parsed > 9999) {
        return NextResponse.json(
          { error: 'year の指定が不正です' },
          { status: 400 }
        )
      }
      dateFilter = {
        createdAt: {
          gte: new Date(`${parsed}-01-01T00:00:00.000Z`),
          lt: new Date(`${parsed + 1}-01-01T00:00:00.000Z`),
        },
      }
    }

    // 集計対象イベント（CLOSED のみ）
    const [aggregated, closedEventIds, availableYearsRows] = await Promise.all([
      prisma.warikanSettlement.groupBy({
        by: ['fromMemberId', 'toMemberId'],
        where: {
          warikanEvent: {
            status: 'CLOSED',
            ...dateFilter,
          },
        },
        _sum: { amount: true },
      }),
      prisma.warikanEvent.findMany({
        where: { status: 'CLOSED', ...dateFilter },
        select: { id: true },
      }),
      // 年フィルタ用の選択肢（CLOSED イベントが存在する年の一覧）
      prisma.warikanEvent.findMany({
        where: { status: 'CLOSED' },
        select: { createdAt: true },
      }),
    ])

    // 無指定ペア (from→to) の合計をペア (unordered) 単位でネット化
    const pairSum = new Map<string, number>() // key: "from|to" (from < to)
    for (const row of aggregated) {
      const amount = row._sum.amount ?? 0
      if (amount === 0) continue
      const a = row.fromMemberId
      const b = row.toMemberId
      if (a === b) continue // 通常発生しないが念のため
      const [lo, hi] = a < b ? [a, b] : [b, a]
      const key = `${lo}|${hi}`
      // A→B は +amount、B→A は -amount として集計
      const signed = a === lo ? amount : -amount
      pairSum.set(key, (pairSum.get(key) ?? 0) + signed)
    }

    // ネット > 0 の方向を balances に。ゼロ収支は除外
    const balances: {
      fromMemberId: string
      toMemberId: string
      amount: number
    }[] = []
    const involvedMemberIds = new Set<string>()
    for (const [key, net] of pairSum) {
      if (net === 0) continue
      const [lo, hi] = key.split('|')
      const from = net > 0 ? lo : hi
      const to = net > 0 ? hi : lo
      const amount = Math.abs(net)
      balances.push({ fromMemberId: from, toMemberId: to, amount })
      involvedMemberIds.add(from)
      involvedMemberIds.add(to)
    }

    // 収支に登場するメンバーの表示情報を取得（isActive フィルタは掛けない：退会者も表示する）
    const members = involvedMemberIds.size > 0
      ? await prisma.member.findMany({
          where: { id: { in: Array.from(involvedMemberIds) } },
          select: MEMBER_SELECT,
          orderBy: { name: 'asc' },
        })
      : []

    balances.sort((a, b) => b.amount - a.amount)

    const totalAmount = balances.reduce((sum, b) => sum + b.amount, 0)
    const availableYears = Array.from(
      new Set(availableYearsRows.map((r) => r.createdAt.getUTCFullYear()))
    ).sort((a, b) => b - a)

    return NextResponse.json({
      members,
      balances,
      eventCount: closedEventIds.length,
      totalAmount,
      availableYears,
    })
  } catch (error) {
    return handleApiError(error, {
      logLabel: '割り勘累積サマリー取得エラー',
      fallbackMessage: '累積サマリーの取得に失敗しました',
    })
  }
}
