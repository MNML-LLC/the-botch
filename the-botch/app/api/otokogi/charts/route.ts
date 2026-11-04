// 男気統計: 追加チャート用データ (Issue #336, Issue #357, Issue #400)
//
// Issue #400: 全チャートを period フィルタに完全対応させる。
// - 期間内 (periodFrom..periodTo) のイベントのみで集計。period=all なら実データ範囲。
// - 月軸 (months[]) も period に応じて動的生成。
// - 旧 comparison (今月 vs 先月 / 今年 vs 昨年) は Issue #391 で UI 削除済みのため API からも撤去。
// - 旧 cumulativeYearly (今年 / 昨年 / 一昨年の 3 本線) は period に紐づかないため廃止し、
//   「期間内月を軸に累積総額 1 本」に置き換えた (null は anchor より未来)。
//
// 期間フィルタ (period / from / to / memberIds) は /api/otokogi/stats と同じ
// parsePeriodFromSearchParams で解釈する。
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { MEMBER_SELECT } from '@/lib/prisma-selects'
import { parsePeriodFromSearchParams } from '@/lib/date-utils'

type MinimalMember = {
  id: string
  name: string
  initial: string
  colorBg: string
  colorText: string
}

type AggregatedEvent = {
  id: string
  eventDate: Date
  eventName: string
  amount: number
  place: string | null
  payerId: string
  payer: MinimalMember
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function addMonths(base: Date, months: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + months, 1)
}

/** from..to (包含) に含まれる月の YYYY-MM 配列を返す (昇順)。maxMonths で上限クランプ。 */
function enumerateMonthKeys(from: Date, to: Date, maxMonths = 120): string[] {
  const start = new Date(from.getFullYear(), from.getMonth(), 1)
  const endInclusive = new Date(to.getFullYear(), to.getMonth(), 1)
  const keys: string[] = []
  let cursor = start
  while (cursor <= endInclusive && keys.length < maxMonths) {
    keys.push(monthKey(cursor))
    cursor = addMonths(cursor, 1)
  }
  return keys
}

export async function GET(request: NextRequest) {
  try {
    const now = new Date()
    const { searchParams } = new URL(request.url)
    const { from: periodFrom, to: periodTo } = parsePeriodFromSearchParams(
      searchParams,
      now,
    )
    const memberIdsParam = searchParams.get('memberIds')
    const memberIdList = memberIdsParam
      ? memberIdsParam.split(',').filter(Boolean)
      : []
    const hasDateFilter = !!(periodFrom || periodTo)

    // 期間フィルタ (gte/lte, inclusive) を適用して events を取得する。
    // period 未指定 (period=all 等) ならフィルタなしで全件取得する。
    const eventDateFilter: { gte?: Date; lte?: Date } = {}
    if (periodFrom) eventDateFilter.gte = periodFrom
    if (periodTo) eventDateFilter.lte = periodTo

    const [events, members] = await Promise.all([
      prisma.otokogiEvent.findMany({
        where: {
          ...(hasDateFilter ? { eventDate: eventDateFilter } : {}),
          ...(memberIdList.length > 0
            ? { payerId: { in: memberIdList } }
            : {}),
        },
        select: {
          id: true,
          eventDate: true,
          eventName: true,
          amount: true,
          place: true,
          payerId: true,
          payer: { select: MEMBER_SELECT },
        },
        orderBy: { eventDate: 'asc' },
      }),
      prisma.member.findMany({
        where: {
          isActive: true,
          ...(memberIdList.length > 0 ? { id: { in: memberIdList } } : {}),
        },
        select: MEMBER_SELECT,
        orderBy: { name: 'asc' },
      }),
    ])

    const aggregated: AggregatedEvent[] = events.map((e) => ({
      id: e.id,
      eventDate: e.eventDate,
      eventName: e.eventName,
      amount: e.amount,
      place: e.place,
      payerId: e.payerId,
      payer: e.payer,
    }))

    // 月軸の始点/終点を決める。
    // - periodFrom/periodTo が指定されていればそれを採用。
    // - 未指定 (period=all) なら実データの範囲 (earliest eventDate .. now) を使う。
    const earliestEventDate =
      aggregated.length > 0 ? aggregated[0].eventDate : null
    const latestEventDate =
      aggregated.length > 0
        ? aggregated[aggregated.length - 1].eventDate
        : null
    const axisFrom = periodFrom ?? earliestEventDate
    const axisTo =
      periodTo ??
      (latestEventDate && latestEventDate > now ? latestEventDate : now)

    const months =
      axisFrom && axisTo ? enumerateMonthKeys(axisFrom, axisTo) : []

    // 累積計算の anchor (= "今" 相当日).
    // - period が現在をまたぐなら now
    // - period が過去 (last-fy 等) なら periodTo を採用して全月が cumulative に乗るようにする
    // - period=all は now
    let anchor = now
    if (hasDateFilter) {
      const nowInPeriod =
        (!periodFrom || now >= periodFrom) && (!periodTo || now <= periodTo)
      if (!nowInPeriod) {
        anchor = periodTo ?? periodFrom ?? now
      }
    }
    const anchorMonth = monthKey(anchor)

    // ===== A. ヒートマップ: 月 × メンバー × 金額 (期間内) =====
    const heatmapAgg = new Map<string, Map<string, number>>()
    for (const m of months) heatmapAgg.set(m, new Map())
    for (const e of aggregated) {
      const key = monthKey(e.eventDate)
      const row = heatmapAgg.get(key)
      if (!row) continue
      row.set(e.payerId, (row.get(e.payerId) ?? 0) + e.amount)
    }
    const heatmapCells = months.flatMap((month) =>
      members.map((mem) => ({
        month,
        memberId: mem.id,
        amount: heatmapAgg.get(month)?.get(mem.id) ?? 0,
      })),
    )
    const heatmap = { months, members, cells: heatmapCells }

    // ===== A2. 月 × メンバー ヒートマップ (Issue #366) =====
    // 固定しきい値バケット用に maxAmount を付与する。
    const maxHeatmapAmount = heatmapCells.reduce(
      (acc, c) => (c.amount > acc ? c.amount : acc),
      0,
    )
    const monthMemberHeatmap = {
      months,
      members,
      cells: heatmapCells,
      maxAmount: maxHeatmapAmount,
    }

    // ===== B. 累積折れ線 (期間内月ベース, 1 本線) =====
    // 月ごとの合計 → 累積。anchor より先 (未来) の月は null にする。
    const monthTotals = new Map<string, number>()
    for (const m of months) monthTotals.set(m, 0)
    for (const e of aggregated) {
      const key = monthKey(e.eventDate)
      if (monthTotals.has(key)) {
        monthTotals.set(key, (monthTotals.get(key) ?? 0) + e.amount)
      }
    }

    let running = 0
    const cumulativeYearly: Array<{
      month: string
      cumulative: number | null
    }> = months.map((m) => {
      if (m > anchorMonth) {
        return { month: m, cumulative: null }
      }
      running += monthTotals.get(m) ?? 0
      return { month: m, cumulative: running }
    })

    // ===== C. Top 3 (期間内の金額上位) =====
    const topRecent = [...aggregated]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3)
      .map((e) => ({
        id: e.id,
        eventName: e.eventName,
        eventDate: e.eventDate.toISOString().slice(0, 10),
        amount: e.amount,
        place: e.place,
        payer: e.payer,
      }))

    return NextResponse.json(
      {
        heatmap,
        monthMemberHeatmap,
        cumulativeYearly,
        topRecent,
        members,
        periodLabel: {
          from: axisFrom ? monthKey(axisFrom) : null,
          to: axisTo ? monthKey(axisTo) : null,
        },
        anchorYear: anchor.getFullYear(),
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      },
    )
  } catch (error) {
    return handleApiError(error, {
      logLabel: '男気チャートデータ取得エラー',
      fallbackMessage: '男気チャートデータの取得に失敗しました',
    })
  }
}
