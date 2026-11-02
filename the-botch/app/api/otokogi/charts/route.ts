// 男気統計: 追加チャート用データ (Issue #336, Issue #357)
//
// - ヒートマップ: メンバー × 月の支払額（period 指定時は期間内、未指定時は直近 12ヶ月）
// - 累積折れ線: 今年 / 昨年 / 一昨年 の月次累積推移（period 指定時は期間でフィルタ）
// - 比較棒: 今月 vs 先月 / 今年 vs 昨年（period 指定時は期間でフィルタ）
// - Top 3: 金額上位 3 件（period 指定時は期間内、未指定時は直近 3ヶ月）
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
  const d = new Date(base.getFullYear(), base.getMonth() + months, 1)
  return d
}

/** YYYY-MM 文字列の配列を直近 n ヶ月分（過去 → 現在）で返す */
function recentMonthKeys(n: number, now: Date): string[] {
  const first = new Date(now.getFullYear(), now.getMonth() - (n - 1), 1)
  const keys: string[] = []
  for (let i = 0; i < n; i++) {
    const d = addMonths(first, i)
    keys.push(monthKey(d))
  }
  return keys
}

/** from 〜 to (exclusive) に含まれる月の YYYY-MM 配列を返す（最大 36 ヶ月でクランプ） */
function enumerateMonthKeys(from: Date, to: Date, maxMonths = 36): string[] {
  const start = new Date(from.getFullYear(), from.getMonth(), 1)
  // to が月末 (例: 10/31) の場合も含めるため、to の属する月までを含める
  const endInclusive = new Date(to.getFullYear(), to.getMonth(), 1)
  const keys: string[] = []
  let cursor = start
  while (cursor <= endInclusive && keys.length < maxMonths) {
    keys.push(monthKey(cursor))
    cursor = addMonths(cursor, 1)
  }
  return keys
}

/** その月の 1 日 00:00 (ローカル) */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** 翌月 1 日 00:00 (ローカル) */
function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
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
    const periodActive = periodFrom !== null || periodTo !== null

    // ----- 時間窓定義 -----
    // period 指定時は period を各グラフの窓として採用し、未指定時は従来のデフォルト窓を使う。
    // 累積・比較は構造が時刻ベースで固定なので、events を period でフィルタした上で
    // 既存の年度/月バケツに流し込む（period が狭ければ対応バケツ以外は 0 になる）。
    const heatmapFrom =
      periodFrom ?? new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const heatmapTo = periodTo ?? startOfNextMonth(now)

    const defaultCumulativeFrom = new Date(now.getFullYear() - 2, 0, 1)
    const defaultCumulativeTo = new Date(now.getFullYear() + 1, 0, 1)

    const defaultComparisonFrom = new Date(now.getFullYear() - 1, 0, 1)
    const defaultComparisonTo = new Date(now.getFullYear() + 1, 0, 1)

    const topRecentFrom =
      periodFrom ?? new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const topRecentTo = periodTo ?? startOfNextMonth(now)

    // 累積・比較の窓: period 指定時は period のみ、未指定時は従来の年度窓
    const cumulativeFrom = periodFrom ?? defaultCumulativeFrom
    const cumulativeTo = periodTo ?? defaultCumulativeTo
    const comparisonFrom = periodFrom ?? defaultComparisonFrom
    const comparisonTo = periodTo ?? defaultComparisonTo

    // 1 回のクエリで取得する範囲 = 全窓の union
    const allFroms = [heatmapFrom, cumulativeFrom, comparisonFrom, topRecentFrom]
    const allTos = [heatmapTo, cumulativeTo, comparisonTo, topRecentTo]
    const unifiedFrom = new Date(Math.min(...allFroms.map((d) => d.getTime())))
    const unifiedTo = new Date(Math.max(...allTos.map((d) => d.getTime())))

    const [events, members] = await Promise.all([
      prisma.otokogiEvent.findMany({
        where: {
          eventDate: {
            gte: unifiedFrom,
            lt: unifiedTo,
          },
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
        orderBy: { eventDate: 'desc' },
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

    // ===== A. ヒートマップ: 月 × メンバー × 金額 =====
    // period 指定時は period の月を列挙、未指定時は直近 12ヶ月
    const heatmapMonths = periodActive
      ? enumerateMonthKeys(heatmapFrom, heatmapTo)
      : recentMonthKeys(12, now)
    // Map<monthKey, Map<memberId, amount>>
    const heatmapAgg = new Map<string, Map<string, number>>()
    for (const m of heatmapMonths) heatmapAgg.set(m, new Map())

    for (const e of aggregated) {
      if (e.eventDate < heatmapFrom || e.eventDate >= heatmapTo) continue
      const key = monthKey(e.eventDate)
      const row = heatmapAgg.get(key)
      if (!row) continue
      row.set(e.payerId, (row.get(e.payerId) ?? 0) + e.amount)
    }

    const heatmap = {
      months: heatmapMonths,
      members,
      cells: heatmapMonths.flatMap((month) =>
        members.map((mem) => ({
          month,
          memberId: mem.id,
          amount: heatmapAgg.get(month)?.get(mem.id) ?? 0,
        }))
      ),
    }

    // 累積・比較は「今/先」の基準時刻を anchor とする。
    // period 指定時: 現在時刻が period 内なら now、過去期間なら period の末日を anchor にする
    //   例) 今期 → 今日が今期内なので anchor = now
    //       前期 → 今日は前期外なので anchor = periodTo（前期の最終日）
    let anchor = now
    if (periodActive) {
      const nowInPeriod =
        (!periodFrom || now >= periodFrom) && (!periodTo || now <= periodTo)
      if (!nowInPeriod) {
        anchor = periodTo ?? periodFrom ?? now
      }
    }

    // ===== C. 累積折れ線: 今年 / 昨年 / 一昨年 の月次累積 =====
    const currentYear = anchor.getFullYear()
    const yearSeries: Record<number, number[]> = {
      [currentYear]: new Array(12).fill(0),
      [currentYear - 1]: new Array(12).fill(0),
      [currentYear - 2]: new Array(12).fill(0),
    }

    for (const e of aggregated) {
      const y = e.eventDate.getFullYear()
      const m = e.eventDate.getMonth()
      if (y in yearSeries) {
        yearSeries[y][m] += e.amount
      }
    }

    // 累積に変換（anchor の月以降は "未来" として null）
    const cumulativeYearly: {
      month: number
      [key: string]: number | null
    }[] = []
    const cumThis = new Array(12).fill(0)
    const cumLast = new Array(12).fill(0)
    const cumBefore = new Array(12).fill(0)
    for (let i = 0; i < 12; i++) {
      cumThis[i] = (i === 0 ? 0 : cumThis[i - 1]) + yearSeries[currentYear][i]
      cumLast[i] = (i === 0 ? 0 : cumLast[i - 1]) + yearSeries[currentYear - 1][i]
      cumBefore[i] = (i === 0 ? 0 : cumBefore[i - 1]) + yearSeries[currentYear - 2][i]
    }

    const currentMonthIdx = anchor.getMonth() // 0-11
    for (let i = 0; i < 12; i++) {
      cumulativeYearly.push({
        month: i + 1,
        thisYear: i <= currentMonthIdx ? cumThis[i] : null,
        lastYear: cumLast[i],
        yearBefore: cumBefore[i],
      })
    }

    // ===== D. 比較棒グラフ: 今月 vs 先月、今年 vs 昨年 =====
    // anchor の月/年を "今" とする
    const thisMonthStart = startOfMonth(anchor)
    const nextMonthStart = startOfNextMonth(anchor)
    const lastMonthStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)
    const thisYearStart = new Date(anchor.getFullYear(), 0, 1)
    const nextYearStart = new Date(anchor.getFullYear() + 1, 0, 1)
    const lastYearStart = new Date(anchor.getFullYear() - 1, 0, 1)

    type Bucket = { total: number; byMember: Map<string, number> }
    const emptyBucket = (): Bucket => ({ total: 0, byMember: new Map() })

    const buckets: {
      thisMonth: Bucket
      lastMonth: Bucket
      thisYear: Bucket
      lastYear: Bucket
    } = {
      thisMonth: emptyBucket(),
      lastMonth: emptyBucket(),
      thisYear: emptyBucket(),
      lastYear: emptyBucket(),
    }

    function addToBucket(bucket: Bucket, e: AggregatedEvent) {
      bucket.total += e.amount
      bucket.byMember.set(e.payerId, (bucket.byMember.get(e.payerId) ?? 0) + e.amount)
    }

    for (const e of aggregated) {
      if (e.eventDate >= thisMonthStart && e.eventDate < nextMonthStart) {
        addToBucket(buckets.thisMonth, e)
      }
      if (e.eventDate >= lastMonthStart && e.eventDate < thisMonthStart) {
        addToBucket(buckets.lastMonth, e)
      }
      if (e.eventDate >= thisYearStart && e.eventDate < nextYearStart) {
        addToBucket(buckets.thisYear, e)
      }
      if (e.eventDate >= lastYearStart && e.eventDate < thisYearStart) {
        addToBucket(buckets.lastYear, e)
      }
    }

    function bucketOut(b: Bucket) {
      return {
        total: b.total,
        byMember: members.map((m) => ({
          memberId: m.id,
          memberName: m.name,
          amount: b.byMember.get(m.id) ?? 0,
        })),
      }
    }

    const comparison = {
      thisMonth: bucketOut(buckets.thisMonth),
      lastMonth: bucketOut(buckets.lastMonth),
      thisYear: bucketOut(buckets.thisYear),
      lastYear: bucketOut(buckets.lastYear),
      labels: {
        thisMonth: `${anchor.getMonth() + 1}月`,
        lastMonth: `${lastMonthStart.getMonth() + 1}月`,
        thisYear: `${anchor.getFullYear()}年`,
        lastYear: `${lastYearStart.getFullYear()}年`,
      },
    }

    // ===== E. Top 3 直近 3ヶ月 =====
    const recentForTop = aggregated
      .filter((e) => e.eventDate >= topRecentFrom && e.eventDate < topRecentTo)
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
        cumulativeYearly,
        comparison,
        topRecent: recentForTop,
        members,
        anchorYear: anchor.getFullYear(),
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      }
    )
  } catch (error) {
    return handleApiError(error, {
      logLabel: '男気チャートデータ取得エラー',
      fallbackMessage: '男気チャートデータの取得に失敗しました',
    })
  }
}
