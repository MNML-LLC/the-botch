import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { getCachedStats, setCachedStats } from '@/lib/stats-cache'
import { MEMBER_SELECT } from '@/lib/prisma-selects'

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

// 日付 WHERE フラグメント（テーブル alias なし: event_date）
function buildDateSql(fromDate: Date | null, toDate: Date | null, exclusive: boolean): Prisma.Sql {
  if (fromDate && toDate) {
    return exclusive
      ? Prisma.sql`event_date >= ${fromDate} AND event_date < ${toDate}`
      : Prisma.sql`event_date >= ${fromDate} AND event_date <= ${toDate}`
  }
  if (fromDate) return Prisma.sql`event_date >= ${fromDate}`
  if (toDate) return exclusive
    ? Prisma.sql`event_date < ${toDate}`
    : Prisma.sql`event_date <= ${toDate}`
  return Prisma.sql`TRUE`
}

// 日付 WHERE フラグメント（oe. alias: oe.event_date）
function buildDateSqlOe(fromDate: Date | null, toDate: Date | null, exclusive: boolean): Prisma.Sql {
  if (fromDate && toDate) {
    return exclusive
      ? Prisma.sql`oe.event_date >= ${fromDate} AND oe.event_date < ${toDate}`
      : Prisma.sql`oe.event_date >= ${fromDate} AND oe.event_date <= ${toDate}`
  }
  if (fromDate) return Prisma.sql`oe.event_date >= ${fromDate}`
  if (toDate) return exclusive
    ? Prisma.sql`oe.event_date < ${toDate}`
    : Prisma.sql`oe.event_date <= ${toDate}`
  return Prisma.sql`TRUE`
}

// GET /api/otokogi/stats — 男気統計情報（DB集計活用版）
// クエリパラメータ:
//   year=YYYY          — 年度フィルタ（後方互換）
//   from=YYYY-MM-DD    — 開始日（from/to は year より優先）
//   to=YYYY-MM-DD      — 終了日
//   memberIds=id1,id2  — メンバー絞り込み（カンマ区切り、省略時は全員）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const memberIdsParam = searchParams.get('memberIds')
    const memberIdList = memberIdsParam ? memberIdsParam.split(',').filter(Boolean) : []

    // 日付フィルタ構築（from/to 優先、なければ year から生成）
    let fromDate: Date | null = null
    let toDate: Date | null = null
    let exclusive = false // year モードは lt（exclusive）、日付範囲は lte

    if (from || to) {
      fromDate = from ? new Date(from) : null
      toDate = to ? new Date(to) : null
    } else if (year) {
      fromDate = new Date(`${year}-01-01`)
      toDate = new Date(`${Number(year) + 1}-01-01`)
      exclusive = true
    }

    // キャッシュキー（後方互換: year のみなら従来キー）
    const cacheKey = (from || to || memberIdList.length > 0)
      ? `f:${from ?? ''}_t:${to ?? ''}_m:${[...memberIdList].sort().join(',')}`
      : (year ?? 'all')

    const cached = getCachedStats(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    // --- Prisma ORM where 条件 ---
    const eventDateFilter = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? (exclusive ? { lt: toDate } : { lte: toDate }) : {}),
    }
    const hasDateFilter = !!(fromDate || toDate)

    // イベント集計用（支払者フィルタ付き）
    const eventWhere = {
      ...(hasDateFilter ? { eventDate: eventDateFilter } : {}),
      ...(memberIdList.length > 0 ? { payerId: { in: memberIdList } } : {}),
    }
    // 参加者集計用（参加者フィルタ付き）
    const participantWhere = {
      ...(hasDateFilter ? { otokogiEvent: { eventDate: eventDateFilter } } : {}),
      ...(memberIdList.length > 0 ? { memberId: { in: memberIdList } } : {}),
    }
    // 日付のみフィルタ（記録系クエリ用）
    const dateOnlyEventWhere = hasDateFilter ? { eventDate: eventDateFilter } : {}

    // --- SQL フラグメント ---
    const dateSql = buildDateSql(fromDate, toDate, exclusive)
    const dateSqlOe = buildDateSqlOe(fromDate, toDate, exclusive)

    const payerSql: Prisma.Sql = memberIdList.length > 0
      ? Prisma.sql`AND payer_id IN (${Prisma.join(memberIdList)})`
      : Prisma.sql``

    const payerSqlOe: Prisma.Sql = memberIdList.length > 0
      ? Prisma.sql`AND oe.payer_id IN (${Prisma.join(memberIdList)})`
      : Prisma.sql``

    const memberSqlM: Prisma.Sql = memberIdList.length > 0
      ? Prisma.sql`AND m.id IN (${Prisma.join(memberIdList)})`
      : Prisma.sql``

    // --- DB並行クエリ ---
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
      otokogiAmountDb,
    ] = await Promise.all([
      // 1. 全体集計
      prisma.otokogiEvent.aggregate({
        where: eventWhere,
        _count: true,
        _sum: { amount: true },
      }),

      // 2. 支払者別集計
      prisma.otokogiEvent.groupBy({
        by: ['payerId'],
        where: eventWhere,
        _count: true,
        _sum: { amount: true },
      }),

      // 3. 参加回数集計
      prisma.otokogiParticipant.groupBy({
        by: ['memberId'],
        where: Object.keys(participantWhere).length > 0 ? participantWhere : undefined,
        _count: true,
      }),

      // 4+5. 最高額・最低額イベント統合
      prisma.$queryRaw<MaxMinResult[]>`
          WITH ranked AS (
            SELECT oe.id, oe.amount, oe.event_name, m.id AS payer_id, m.name AS payer_name,
              ROW_NUMBER() OVER (ORDER BY oe.amount DESC) AS rn_max,
              ROW_NUMBER() OVER (ORDER BY oe.amount ASC) AS rn_min
            FROM otokogi_events oe
            JOIN members m ON oe.payer_id = m.id
            WHERE ${dateSqlOe} ${memberSqlM}
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

      // 6. 最多参加者イベント（日付フィルタのみ）
      prisma.otokogiEvent.findFirst({
        where: dateOnlyEventWhere,
        orderBy: { participants: { _count: 'desc' } },
        include: {
          payer: { select: { id: true, name: true } },
          _count: { select: { participants: true } },
        },
      }),

      // 7. ストリーク計算用
      prisma.otokogiEvent.findMany({
        where: eventWhere,
        select: {
          payerId: true,
          participants: { select: { memberId: true } },
        },
        orderBy: { eventDate: 'asc' },
      }),

      // 8. メンバー情報（memberIds 絞り込み対応）
      prisma.member.findMany({
        where: {
          isActive: true,
          ...(memberIdList.length > 0 ? { id: { in: memberIdList } } : {}),
        },
        select: MEMBER_SELECT,
        orderBy: { name: 'asc' },
      }),

      // 9. 月別トレンド
      prisma.$queryRaw<{ month: string; amount: bigint }[]>`
          SELECT TO_CHAR(event_date, 'YYYY-MM') AS month, SUM(amount)::bigint AS amount
          FROM otokogi_events
          WHERE ${dateSql} ${payerSql}
          GROUP BY TO_CHAR(event_date, 'YYYY-MM')
          ORDER BY month ASC`,

      // 10. ヒートマップ（日付フィルタのみ）
      prisma.$queryRaw<{ payer_id: string; member_id: string; count: bigint }[]>`
          SELECT oe.payer_id, op.member_id, COUNT(*)::bigint AS count
          FROM otokogi_events oe
          JOIN otokogi_participants op ON oe.id = op.otokogi_event_id
          WHERE oe.payer_id != op.member_id
            AND ${dateSqlOe}
          GROUP BY oe.payer_id, op.member_id`,

      // 11. 1日最多回数（日付フィルタのみ）
      prisma.$queryRaw<{ event_date: Date; count: bigint }[]>`
          SELECT event_date, COUNT(*)::bigint AS count
          FROM otokogi_events
          WHERE ${dateSql}
          GROUP BY event_date
          ORDER BY count DESC
          LIMIT 1`,

      // 12. 累積支払額レース
      prisma.$queryRaw<{ month: string; payer_id: string; cumulative: bigint }[]>`
          WITH monthly AS (
            SELECT TO_CHAR(event_date, 'YYYY-MM') AS month, payer_id, SUM(amount) AS amt
            FROM otokogi_events
            WHERE ${dateSql} ${payerSql}
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

      // 13. 漢気額（支払者別）
      prisma.$queryRaw<{ payer_id: string; otokogi_amount: bigint }[]>`
          SELECT oe.payer_id,
            ROUND(SUM(oe.amount::float * (cnt.participant_count - 1)::float / GREATEST(cnt.participant_count, 1)::float))::bigint AS otokogi_amount
          FROM otokogi_events oe
          JOIN (
            SELECT otokogi_event_id, COUNT(*) AS participant_count
            FROM otokogi_participants
            GROUP BY otokogi_event_id
          ) cnt ON oe.id = cnt.otokogi_event_id
          WHERE ${dateSqlOe} ${payerSqlOe}
          GROUP BY oe.payer_id`,
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

    // --- 月別トレンド ---
    const monthlyTrend = monthlyTrendDb.map((row) => ({
      month: row.month,
      amount: Number(row.amount),
    }))

    // --- ヒートマップ ---
    // ヒートマップはフル members リスト（絞り込みなし）が必要なため別途取得を省いて既存 members で代用
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

    // --- 連勝・連敗 ---
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

    // --- 累積支払額レース ---
    const cumulativeByMonth = new Map<string, Map<string, number>>()
    for (const row of cumulativeRaceDb) {
      if (!cumulativeByMonth.has(row.month)) cumulativeByMonth.set(row.month, new Map())
      cumulativeByMonth.get(row.month)!.set(row.payer_id, Number(row.cumulative))
    }

    const cumulativeRace: { month: string; [memberId: string]: string | number }[] = []
    for (const month of Array.from(cumulativeByMonth.keys()).sort()) {
      const entry: { month: string; [memberId: string]: string | number } = { month }
      for (const member of members) entry[member.id] = 0
      const monthData = cumulativeByMonth.get(month)!
      monthData.forEach((amount, payerId) => {
        entry[payerId] = amount
      })
      cumulativeRace.push(entry)
    }

    // --- 漢気額（メンバー別累計） ---
    const otokogiAmountMap = new Map(otokogiAmountDb.map((r) => [r.payer_id, Number(r.otokogi_amount)]))
    const otokogiByMember = members
      .map((member) => ({
        id: member.id,
        name: member.name,
        initial: member.initial,
        colorBg: member.colorBg,
        colorText: member.colorText,
        otokogiAmount: otokogiAmountMap.get(member.id) ?? 0,
      }))
      .sort((a, b) => b.otokogiAmount - a.otokogiAmount)
    const totalOtokogiAmount = otokogiByMember.reduce((sum, m) => sum + m.otokogiAmount, 0)

    // --- 記録 ---
    const records: { label: string; value: number | string; detail?: string }[] = []

    if (totalCount > 0) {
      if (maxEvent) {
        records.push({
          label: '最高額',
          value: maxEvent.amount,
          detail: `${maxEvent.payer.name} - ${maxEvent.eventName}`,
        })
      }
      if (minEvent) {
        records.push({
          label: '最低額',
          value: minEvent.amount,
          detail: `${minEvent.payer.name} - ${minEvent.eventName}`,
        })
      }
      if (maxDayDb.length > 0) {
        records.push({
          label: '1日最多回数',
          value: Number(maxDayDb[0].count),
          detail: new Date(maxDayDb[0].event_date).toISOString().slice(0, 10),
        })
      }
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
      otokogiByMember,
      totalOtokogiAmount,
    }

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
