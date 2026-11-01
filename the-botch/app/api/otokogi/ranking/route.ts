import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { OTOKOGI_CLUTCH_THRESHOLD } from '@/lib/constants'
import {
  computeRanking,
  fiscalYearRange,
  isRankingMetric,
  type OtokogiEventInput,
  type RankingMetric,
} from '@/lib/otokogi-ranking'

// GET /api/otokogi/ranking — 男気ランキング（4軸対応 / Issue #335）
//
// クエリ:
//   - year=YYYY     fiscal year フィルタ (11月開始)。省略時は全期間。
//   - metric=total|rate|clutch|streak|generosity (default: total)
//     ソート基準。レスポンスには全指標が含まれるのでフロントで切替可能。
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const metricParam = searchParams.get('metric')

    const metric: RankingMetric = isRankingMetric(metricParam) ? metricParam : 'total'

    const dateRange = yearParam && /^\d{4}$/.test(yearParam)
      ? fiscalYearRange(Number(yearParam))
      : null

    // メンバー・男気イベント（参加者込み）を並列取得
    const whereDate = dateRange
      ? { eventDate: { gte: dateRange.from, lte: dateRange.to } }
      : {}

    const [members, events] = await Promise.all([
      prisma.member.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          initial: true,
          colorBg: true,
          colorText: true,
        },
      }),
      prisma.otokogiEvent.findMany({
        where: whereDate,
        select: {
          id: true,
          eventDate: true,
          payerId: true,
          amount: true,
          participants: { select: { memberId: true } },
        },
      }),
    ])

    const eventInputs: OtokogiEventInput[] = events.map((e) => ({
      id: e.id,
      eventDate: e.eventDate,
      payerId: e.payerId,
      amount: e.amount,
      participantIds: e.participants.map((p) => p.memberId),
    }))

    const ranking = computeRanking(members, eventInputs, {
      metric,
      clutchThreshold: OTOKOGI_CLUTCH_THRESHOLD,
    })

    const response = NextResponse.json({
      metric,
      clutchThreshold: OTOKOGI_CLUTCH_THRESHOLD,
      ranking,
    })
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300')
    return response
  } catch (error) {
    return handleApiError(error, {
      logLabel: 'ランキング取得エラー',
      fallbackMessage: 'ランキングの取得に失敗しました',
    })
  }
}
