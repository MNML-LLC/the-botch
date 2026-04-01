import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCachedStats, setCachedStats } from '@/lib/stats-cache'

// max/min 統合クエリの結果型
type MaxMinResult = {
  max_id: string | null
  max_amount: number | null
  max_event_name: string | null
  max_payer_id: string | null
  max_payer_name: string | null
  min_id: string | null
  min_amount: number | null
  min_event_name: string | null
  min_payer_id: string | null
  min_payer_name: string | null
}

// GET /api/otokogi/stats — 男気統計情報（DB集計活用版）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const cacheKey = year ?? 'all'

    // キャッシュヒット時は即座に返却
    const cached = getCachedStats(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // 年度フィルター
    const eventWhere = year
      ? { eventDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) } }
      : {}
    const participantWhere = year
      ? { otokogiEvent: { eventDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) } } }
      : {}

    // --- DB並行クエリ（11本: max/min を1本に統合） ---
    const [
      totals,
      payerStats,
      participationStats,
      maxMinResult,
      maxParticipantsEvent,
      streakEvents,
      members,
      monthlyTrendDb,
      heatmapDb,
      maxDayDb,
      cumulativeRaceDb,
    ] = await Promise.all([
      // 1. 全体集計（aggregate）
      prisma.otokogiEvent.aggregate({
        where: eventWhere,
        _count: true,
        _sum: { amount: true },
      }),

      // 2. 支払者別集計（groupBy）
      prisma.otokogiEvent.groupBy({
        by: ['payerId'],
        where: eventWhere,
        _count: true,
        _sum: { amount: true },
      }),

      // 3. 参加回数集計（groupBy on 中間テーブル）
      prisma.otokogiParticipant.groupBy({
        by: ['memberId'],
        where: Object.keys(participantWhere).length > 0 ? participantWhere : undefined,
        _count: true,
      }),

      // 4+5. 最高額・最低額イベント統合（Window関数+CTE、1スキャンで完結）
      year
        ? prisma.$queryRaw<MaxMinResult[]>`
            WITH ranked AS (
              SELECT oe.id, oe.amount, oe.event_name, m.id AS payer_id, m.name AS payer_name,
                ROW_NUMBER() OVER (ORDER BY oe.amount DESC) AS rn_max,
                ROW_NUMBER() OVER (ORDER BY oe.amount ASC) AS rn_min
              FROM otokogi_events oe
              JOIN members m ON oe.payer_id = m.id
              WHERE oe.event_date >= ${new Date(`${year}-01-01`)} AND oe.event_date < ${new Date(`${Number(year) + 1}-01-01`)}
            )
            SELECT
              MAX(CASE WHEN rn_max = 1 THEN id END) AS max_id,
              MAX(CASE WHEN rn_max = 1 THEN amount END) AS max_amount,
              MAX(CASE WHEN rn_max = 1 THEN event_name END) AS max_event_name,
              MAX(CASE WHEN rn_max = 1 THEN payer_id END) AS max_payer_id,
              MAX(CASE WHEN rn_max = 1 THEN payer_name END) AS max_payer_name,
              MAX(CASE WHEN rn_min = 1 THEN id END) AS min_id,
              MAX(CASE WHEN rn_min = 1 THEN amount END) AS min_amount,
              MAX(CASE WHEN rn_min = 1 THEN event_name END) AS min_event_name,
              MAX(CASE WHEN rn_min = 1 THEN payer_id END) AS min_payer_id,
              MAX(CASE WHEN rn_min = 1 THEN payer_name END) AS min_payer_name
            FROM ranked
            WHERE rn_max = 1 OR rn_min = 1`
        : prisma.$queryRaw<MaxMinResult[]>`
            WITH ranked AS (
              SELECT oe.id, oe.amount, oe.event_name, m.id AS payer_id, m.name AS payer_name,
                ROW_NUMBER() OVER (ORDER BY oe.amount DESC) AS rn_max,
                ROW_NUMBER() OVER (ORDER BY oe.amount ASC) AS rn_min
              FROM otokogi_events oe
              JOIN members m ON oe.payer_id = m.id
            )
            SELECT
              MAX(CASE WHEN rn_max = 1 THEN id END) AS max_id,
              MAX(CASE WHEN rn_max = 1 THEN amount END) AS max_amount,
              MAX(CASE WHEN rn_max = 1 THEN event_name END) AS max_event_name,
              MAX(CASE WHEN rn_max = 1 THEN payer_id END) AS max_payer_id,
              MAX(CASE WHEN rn_max = 1 THEN payer_name END) AS max_payer_name,
              MAX(CASE WHEN rn_min = 1 THEN id END) AS min_id,
              MAX(CASE WHEN rn_min = 1 THEN amount END) AS min_amount,
              MAX(CASE WHEN rn_min = 1 THEN event_name END) AS min_event_name,
              MAX(CASE WHEN rn_min = 1 THEN payer_id END) AS min_payer_id,
              MAX(CASE WHEN rn_min = 1 THEN payer_name END) AS min_payer_name
            FROM ranked
            WHERE rn_max = 1 OR rn_min = 1`,

      // 6. 最多参加者イベント
      prisma.otokogiEvent.findFirst({
        where: eventWhere,
        orderBy: { participants: { _count: 'desc' } },
        include: {
          payer: { select: { id: true, name: true } },
          _count: { select: { participants: true } },
        },
      }),

      // 7. ストリーク計算用（支払者・参加者のみ取得）
      prisma.otokogiEvent.findMany({
        where: eventWhere,
        select: {
          payerId: true,
          participants: { select: { memberId: true } },
        },
        orderBy: { eventDate: 'asc' },
      }),

      // 8. メンバー情報（名前解決用）
      prisma.member.findMany({
        where: { isActive: true },
        select: { id: true, name: true, initial: true, colorBg: true, colorText: true },
        orderBy: { name: 'asc' },
      }),

      // 9. 月別トレンド（DB側 DATE_TRUNC + SUM）
      year
        ? prisma.$queryRaw<{ month: string; amount: bigint }[]>`
            SELECT TO_CHAR(event_date, 'YYYY-MM') AS month, SUM(amount)::bigint AS amount
            FROM otokogi_events
            WHERE event_date >= ${new Date(`${year}-01-01`)} AND event_date < ${new Date(`${Number(year) + 1}-01-01`)}
            GROUP BY TO_CHAR(event_date, 'YYYY-MM')
            ORDER BY month ASC`
        : prisma.$queryRaw<{ month: string; amount: bigint }[]>`
            SELECT TO_CHAR(event_date, 'YYYY-MM') AS month, SUM(amount)::bigint AS amount
            FROM otokogi_events
            GROUP BY TO_CHAR(event_date, 'YYYY-MM')
            ORDER BY month ASC`,

      // 10. ヒートマップ（DB側 GROUP BY payer × participant）
      year
        ? prisma.$queryRaw<{ payer_id: string; member_id: string; count: bigint }[]>`
            SELECT oe.payer_id, op.member_id, COUNT(*)::bigint AS count
            FROM otokogi_events oe
            JOIN otokogi_participants op ON oe.id = op.otokogi_event_id
            WHERE oe.payer_id != op.member_id
              AND oe.event_date >= ${new Date(`${year}-01-01`)} AND oe.event_date < ${new Date(`${Number(year) + 1}-01-01`)}
            GROUP BY oe.payer_id, op.member_id`
        : prisma.$queryRaw<{ payer_id: string; member_id: string; count: bigint }[]>`
            SELECT oe.payer_id, op.member_id, COUNT(*)::bigint AS count
            FROM otokogi_events oe
            JOIN otokogi_participants op ON oe.id = op.otokogi_event_id
            WHERE oe.payer_id != op.member_id
            GROUP BY oe.payer_id, op.member_id`,

      // 11. 1日最多回数（DB側 GROUP BY + LIMIT）
      year
        ? prisma.$queryRaw<{ event_date: Date; count: bigint }[]>`
            SELECT event_date, COUNT(*)::bigint AS count
            FROM otokogi_events
            WHERE event_date >= ${new Date(`${year}-01-01`)} AND event_date < ${new Date(`${Number(year) + 1}-01-01`)}
            GROUP BY event_date
            ORDER BY count DESC
            LIMIT 1`
        : prisma.$queryRaw<{ event_date: Date; count: bigint }[]>`
            SELECT event_date, COUNT(*)::bigint AS count
            FROM otokogi_events
            GROUP BY event_date
            ORDER BY count DESC
            LIMIT 1`,

      // 12→統合不要: 累積支払額レース（DB側 window function で累積和）
      year
        ? prisma.$queryRaw<{ month: string; payer_id: string; cumulative: bigint }[]>`
            WITH monthly AS (
              SELECT TO_CHAR(event_date, 'YYYY-MM') AS month, payer_id, SUM(amount) AS amt
              FROM otokogi_events
              WHERE event_date >= ${new Date(`${year}-01-01`)} AND event_date < ${new Date(`${Number(year) + 1}-01-01`)}
              GROUP BY TO_CHAR(event_date, 'YYYY-MM'), payer_id
            ),
            all_months AS (SELECT DISTINCT month FROM monthly),
            all_payers AS (SELECT DISTINCT payer_id FROM monthly),
            grid AS (SELECT m.month, p.payer_id FROM all_months m CROSS JOIN all_payers p)
            SELECT g.month, g.payer_id,
              SUM(COALESCE(mp.amt, 0)) OVER (PARTITION BY g.payer_id ORDER BY g.month)::bigint AS cumulative
            FROM grid g
            LEFT JOIN monthly mp ON g.month = mp.month AND g.payer_id = mp.payer_id
            ORDER BY g.month, g.payer_id`
        : prisma.$queryRaw<{ month: string; payer_id: string; cumulative: bigint }[]>`
            WITH monthly AS (
              SELECT TO_CHAR(event_date, 'YYYY-MM') AS month, payer_id, SUM(amount) AS amt
              FROM otokogi_events
              GROUP BY TO_CHAR(event_date, 'YYYY-MM'), payer_id
            ),
            all_months AS (SELECT DISTINCT month FROM monthly),
            all_payers AS (SELECT DISTINCT payer_id FROM monthly),
            grid AS (SELECT m.month, p.payer_id FROM all_months m CROSS JOIN all_payers p)
            SELECT g.month, g.payer_id,
              SUM(COALESCE(mp.amt, 0)) OVER (PARTITION BY g.payer_id ORDER BY g.month)::bigint AS cumulative
            FROM grid g
            LEFT JOIN monthly mp ON g.month = mp.month AND g.payer_id = mp.payer_id
            ORDER BY g.month, g.payer_id`,
    ])

    // max/min 結果の展開
    const mmr = maxMinResult[0] ?? {} as MaxMinResult
    const maxEvent = mmr.max_id ? {
      amount: mmr.max_amount!,
      eventName: mmr.max_event_name!,
      payer: { id: mmr.max_payer_id!, name: mmr.max_payer_name! },
    } : null
    const minEvent = mmr.min_id ? {
      amount: mmr.min_amount!,
      eventName: mmr.min_event_name!,
      payer: { id: mmr.min_payer_id!, name: mmr.min_payer_name! },
    } : null

    // --- 基本統計 ---
    const totalCount = totals._count
    const totalAmount = totals._sum.amount ?? 0
    const averageAmount = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0

    // --- メンバー別統計 ---
    const payerMap = new Map(
      payerStats.map((s) => [s.payerId, { count: s._count, totalPaid: s._sum.amount ?? 0 }])
    )
    const participationMap = new Map(
      participationStats.map((s) => [s.memberId, s._count])
    )

    const perMember = members.map((member) => {
      const payer = payerMap.get(member.id)
      const count = payer?.count ?? 0
      const totalPaid = payer?.totalPaid ?? 0
      const participated = participationMap.get(member.id) ?? 0
      const winRate = participated > 0 ? Math.round((count / participated) * 100) : 0

      return { id: member.id, name: member.name, count, participated, totalPaid, winRate }
    })

    // --- 月別トレンド（DB集計結果を変換） ---
    const monthlyTrend = monthlyTrendDb.map((row) => ({
      month: row.month,
      amount: Number(row.amount),
    }))

    // --- ヒートマップ（DB集計結果からマトリックス構築） ---
    const heatmap: Record<string, Record<string, number>> = {}
    for (const member of members) {
      heatmap[member.id] = {}
      for (const other of members) {
        heatmap[member.id][other.id] = 0
      }
    }
    for (const row of heatmapDb) {
      if (heatmap[row.payer_id]?.[row.member_id] !== undefined) {
        heatmap[row.payer_id][row.member_id] = Number(row.count)
      }
    }

    // --- 漢気偏差値 ---
    const paidAmounts = perMember.map((m) => m.totalPaid)
    const mean = paidAmounts.length > 0
      ? paidAmounts.reduce((s, v) => s + v, 0) / paidAmounts.length
      : 0
    const variance = paidAmounts.length > 0
      ? paidAmounts.reduce((s, v) => s + (v - mean) ** 2, 0) / paidAmounts.length
      : 0
    const stdDev = Math.sqrt(variance)

    const deviationScores = perMember.map((m) => ({
      id: m.id,
      name: m.name,
      totalPaid: m.totalPaid,
      score: stdDev > 0 ? Math.round(((m.totalPaid - mean) / stdDev) * 10 + 50) : 50,
    }))

    // --- 連勝・連敗（同じ人が連続で支払った回数） ---
    const streaks: { id: string; name: string; maxStreak: number; currentStreak: number }[] = []

    for (const member of members) {
      let maxStreak = 0
      let currentStreak = 0
      let lastWasPayer = false

      for (const event of streakEvents) {
        const isParticipant = event.participants.some((p) => p.memberId === member.id)
        if (!isParticipant) continue

        if (event.payerId === member.id) {
          currentStreak++
          lastWasPayer = true
          if (currentStreak > maxStreak) maxStreak = currentStreak
        } else {
          if (lastWasPayer) currentStreak = 0
          lastWasPayer = false
        }
      }

      streaks.push({
        id: member.id,
        name: member.name,
        maxStreak,
        currentStreak: lastWasPayer ? currentStreak : 0,
      })
    }

    // --- 累積支払額レース（DB集計結果から構築） ---
    const cumulativeByMonth = new Map<string, Map<string, number>>()
    for (const row of cumulativeRaceDb) {
      if (!cumulativeByMonth.has(row.month)) cumulativeByMonth.set(row.month, new Map())
      cumulativeByMonth.get(row.month)!.set(row.payer_id, Number(row.cumulative))
    }

    const cumulativeRace: { month: string; [memberId: string]: string | number }[] = []
    for (const month of Array.from(cumulativeByMonth.keys()).sort()) {
      const entry: { month: string; [memberId: string]: string | number } = { month }
      // 全メンバー0で初期化（支払ゼロのメンバーも含む）
      for (const member of members) entry[member.id] = 0
      // DB結果で上書き
      const monthData = cumulativeByMonth.get(month)!
      monthData.forEach((amount, payerId) => {
        entry[payerId] = amount
      })
      cumulativeRace.push(entry)
    }

    // --- 記録 ---
    const records: { label: string; value: number | string; detail?: string }[] = []

    if (totalCount > 0) {
      // 最高額
      if (maxEvent) {
        records.push({
          label: '最高額',
          value: maxEvent.amount,
          detail: `${maxEvent.payer.name} - ${maxEvent.eventName}`,
        })
      }

      // 最低額
      if (minEvent) {
        records.push({
          label: '最低額',
          value: minEvent.amount,
          detail: `${minEvent.payer.name} - ${minEvent.eventName}`,
        })
      }

      // 1日最多回数（DB集計結果）
      if (maxDayDb.length > 0) {
        records.push({
          label: '1日最多回数',
          value: Number(maxDayDb[0].count),
          detail: new Date(maxDayDb[0].event_date).toISOString().slice(0, 10),
        })
      }

      // 最多参加人数
      if (maxParticipantsEvent) {
        records.push({
          label: '最多参加人数',
          value: maxParticipantsEvent._count.participants,
          detail: `${maxParticipantsEvent.payer.name} - ${maxParticipantsEvent.eventName}`,
        })
      }
    }

    const result = {
      totalCount,
      totalAmount,
      averageAmount,
      perMember,
      monthlyTrend,
      heatmap,
      deviationScores,
      streaks,
      cumulativeRace,
      records,
    }

    // キャッシュに保存
    setCachedStats(cacheKey, result)

    return NextResponse.json(result)
  } catch (error) {
    console.error('統計情報取得エラー:', error)
    return NextResponse.json(
      { error: '統計情報の取得に失敗しました' },
      { status: 500 }
    )
  }
}
