// 男気統計: 追加チャート用データ (Issue #336)
//
// - 直近 12ヶ月のメンバー × 月の支払額ヒートマップ
// - 今年 / 昨年 / 一昨年 の月次累積推移
// - 今月 vs 先月 / 今年 vs 昨年 の比較（メンバー別積み上げ）
// - 直近 3ヶ月の金額 Top 3
//
// 期間フィルタは適用しない（各グラフが固有の時間窓を持つ）。
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { MEMBER_SELECT } from '@/lib/prisma-selects'

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

/** その月の 1 日 00:00 (ローカル) */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

/** 翌月 1 日 00:00 (ローカル) */
function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
}

export async function GET() {
  try {
    const now = new Date()

    // ----- 時間窓定義 -----
    // ヒートマップ: 直近 12ヶ月（当月含む）
    const heatmapFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const heatmapTo = startOfNextMonth(now)

    // 累積: 一昨年 1/1 〜 今年末
    const cumulativeFrom = new Date(now.getFullYear() - 2, 0, 1)
    const cumulativeTo = new Date(now.getFullYear() + 1, 0, 1)

    // 比較: 今年 1/1 〜 翌年 1/1、ただし先月・先々月以降も必要なので昨年 1/1 〜 翌年 1/1
    const comparisonFrom = new Date(now.getFullYear() - 1, 0, 1)
    const comparisonTo = new Date(now.getFullYear() + 1, 0, 1)

    // 直近 3ヶ月: 当月 1 日から 2 ヶ月前の 1 日
    const topRecentFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const topRecentTo = startOfNextMonth(now)

    // 1 回のクエリで最も広い範囲を取得（最古 = cumulativeFrom と comparisonFrom のうち早い方）
    const unifiedFrom = cumulativeFrom < comparisonFrom ? cumulativeFrom : comparisonFrom
    const unifiedTo = cumulativeTo > comparisonTo ? cumulativeTo : comparisonTo

    const [events, members] = await Promise.all([
      prisma.otokogiEvent.findMany({
        where: {
          eventDate: {
            gte: unifiedFrom,
            lt: unifiedTo,
          },
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
        where: { isActive: true },
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
    const heatmapMonths = recentMonthKeys(12, now)
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

    // ===== C. 累積折れ線: 今年 / 昨年 / 一昨年 の月次累積 =====
    const currentYear = now.getFullYear()
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

    // 累積に変換（直近月以降は 0 のままにしておく: 未発生の月は "未来" として扱わず null にする）
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

    const currentMonthIdx = now.getMonth() // 0-11
    for (let i = 0; i < 12; i++) {
      cumulativeYearly.push({
        month: i + 1,
        thisYear: i <= currentMonthIdx ? cumThis[i] : null,
        lastYear: cumLast[i],
        yearBefore: cumBefore[i],
      })
    }

    // ===== D. 比較棒グラフ: 今月 vs 先月、今年 vs 昨年 =====
    const thisMonthStart = startOfMonth(now)
    const nextMonthStart = startOfNextMonth(now)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const thisYearStart = new Date(now.getFullYear(), 0, 1)
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1)
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1)

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
        thisMonth: `${now.getMonth() + 1}月`,
        lastMonth: `${lastMonthStart.getMonth() + 1}月`,
        thisYear: `${now.getFullYear()}年`,
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
