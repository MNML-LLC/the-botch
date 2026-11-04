/**
 * lib/otokogi-insights.ts のテスト (Issue #404 — 7 層構造 + Auto-Insights)
 *
 * 実行: npx vitest run tests/otokogi-insights.test.ts
 */
import { describe, test, expect } from 'vitest'
import {
  computeInsights,
  INSIGHT_CLUTCH_ABSENT_MIN_EVENTS,
  INSIGHT_CLUTCH_BIAS_MIN_TOTAL,
  INSIGHT_CLUTCH_CLUSTER_MIN,
  INSIGHT_CURRENT_STREAK_MIN,
  INSIGHT_GROWTH_THRESHOLD,
  INSIGHT_JANKEN_GAMES_MIN,
  INSIGHT_MAX_STREAK_MIN,
  INSIGHT_NO_PAY_MIN_PARTICIPATIONS,
  INSIGHT_PEAK_MONTH_SHARE,
  INSIGHT_SINGLE_HIGH_RECORD,
  type InsightsContext,
  type InsightsMemberSummary,
  type InsightsStreakEntry,
} from '@/lib/otokogi-insights'

// ---- helpers ----

function member(
  memberId: string,
  overrides: Partial<InsightsMemberSummary> = {}
): InsightsMemberSummary {
  return {
    memberId,
    memberName: memberId.toUpperCase(),
    participationCount: 0,
    payerCount: 0,
    actualPaid: 0,
    shouldHavePaid: 0,
    otokogiAmount: 0,
    averagePaymentAmount: 0,
    maxSingleOtokogi: 0,
    clutchCount: 0,
    jankenWinRate: null,
    jankenParticipationCount: 0,
    ...overrides,
  }
}

function streak(
  id: string,
  overrides: Partial<InsightsStreakEntry> = {}
): InsightsStreakEntry {
  return {
    id,
    name: id.toUpperCase(),
    maxStreak: 0,
    currentStreak: 0,
    ...overrides,
  }
}

function ctx(overrides: Partial<InsightsContext> = {}): InsightsContext {
  return {
    summary: { totalCount: 0, totalAmount: 0, clutchCount: 0 },
    memberSummaries: [],
    streaks: [],
    monthlyTrend: [],
    categoryBreakdown: [],
    previous: null,
    periodLabel: 'FY26',
    ...overrides,
  }
}

// ---- 1. 期間総額成長 ----

describe('period-growth-total', () => {
  test('前期比 +20% 超で成長 insight', () => {
    const c = ctx({
      summary: { totalCount: 5, totalAmount: 500_000, clutchCount: 0 },
      previous: { totalCount: 4, totalAmount: 400_000, clutchCount: 0 },
    })
    const insights = computeInsights(c)
    const growth = insights.find((i) => i.kind === 'period-growth-total')
    expect(growth).toBeDefined()
    expect(growth?.icon).toBe('📈')
    expect(growth?.text).toContain('成長')
  })

  test('前期比 -20% 超で減少 insight', () => {
    const c = ctx({
      summary: { totalCount: 2, totalAmount: 100_000, clutchCount: 0 },
      previous: { totalCount: 5, totalAmount: 500_000, clutchCount: 0 },
    })
    const growth = computeInsights(c).find((i) => i.kind === 'period-growth-total')
    expect(growth?.icon).toBe('📉')
  })

  test('変動 20% 未満は insight にしない', () => {
    const c = ctx({
      summary: { totalCount: 5, totalAmount: 510_000, clutchCount: 0 },
      previous: { totalCount: 5, totalAmount: 500_000, clutchCount: 0 },
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'period-growth-total')
    ).toBeUndefined()
  })

  test('前期 0 で今期 > 0 なら "初計上" insight', () => {
    const c = ctx({
      summary: { totalCount: 3, totalAmount: 120_000, clutchCount: 0 },
      previous: { totalCount: 0, totalAmount: 0, clutchCount: 0 },
    })
    const growth = computeInsights(c).find((i) => i.kind === 'period-growth-total')
    expect(growth).toBeDefined()
    expect(growth?.text).toContain('前期は男気 0 円')
  })

  test('previous = null なら比較系は発火しない', () => {
    const c = ctx({
      summary: { totalCount: 5, totalAmount: 500_000, clutchCount: 0 },
      previous: null,
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'period-growth-total')
    ).toBeUndefined()
  })

  test(`しきい値は INSIGHT_GROWTH_THRESHOLD=${INSIGHT_GROWTH_THRESHOLD}`, () => {
    expect(INSIGHT_GROWTH_THRESHOLD).toBeGreaterThan(0)
  })
})

// ---- 2. 期間件数成長 ----

describe('period-growth-count', () => {
  test('前期比 +5 回超で count insight', () => {
    const c = ctx({
      summary: { totalCount: 15, totalAmount: 1, clutchCount: 0 },
      previous: { totalCount: 5, totalAmount: 1, clutchCount: 0 },
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'period-growth-count')
    ).toBeDefined()
  })

  test('前期 0 なら 3 回以上で発火', () => {
    const c = ctx({
      summary: { totalCount: 3, totalAmount: 1, clutchCount: 0 },
      previous: { totalCount: 0, totalAmount: 0, clutchCount: 0 },
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'period-growth-count')
    ).toBeDefined()
  })
})

// ---- 3. MVP ほぼ確定 ----

describe('mvp-near-locked', () => {
  test('top1 のリードが top2 の 50% 超なら発火', () => {
    const c = ctx({
      memberSummaries: [
        member('a', { memberName: 'A', actualPaid: 300_000 }),
        member('b', { memberName: 'B', actualPaid: 100_000 }),
      ],
    })
    const mvp = computeInsights(c).find((i) => i.kind === 'mvp-near-locked')
    expect(mvp).toBeDefined()
    expect(mvp?.memberId).toBe('a')
    expect(mvp?.text).toContain('A')
  })

  test('差が少なければ発火しない', () => {
    const c = ctx({
      memberSummaries: [
        member('a', { actualPaid: 120_000 }),
        member('b', { actualPaid: 100_000 }),
      ],
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'mvp-near-locked')
    ).toBeUndefined()
  })

  test('メンバー 1 人なら発火しない', () => {
    const c = ctx({
      memberSummaries: [member('a', { actualPaid: 200_000 })],
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'mvp-near-locked')
    ).toBeUndefined()
  })
})

// ---- 4. 接戦 ----

describe('tight-race', () => {
  test('top1 と top2 の差が 5% 以内なら接戦 insight', () => {
    const c = ctx({
      memberSummaries: [
        member('a', { memberName: 'A', actualPaid: 200_000 }),
        member('b', { memberName: 'B', actualPaid: 198_000 }),
      ],
    })
    const tight = computeInsights(c).find((i) => i.kind === 'tight-race')
    expect(tight).toBeDefined()
    expect(tight?.text).toContain('接戦')
  })

  test('差が大きいと発火しない', () => {
    const c = ctx({
      memberSummaries: [
        member('a', { actualPaid: 300_000 }),
        member('b', { actualPaid: 100_000 }),
      ],
    })
    expect(computeInsights(c).find((i) => i.kind === 'tight-race')).toBeUndefined()
  })
})

// ---- 5. 現在ストリーク ----

describe('current-streak', () => {
  test(`currentStreak >= ${INSIGHT_CURRENT_STREAK_MIN} で発火`, () => {
    const c = ctx({
      streaks: [streak('a', { currentStreak: 3, maxStreak: 3 })],
    })
    const cs = computeInsights(c).find((i) => i.kind === 'current-streak')
    expect(cs).toBeDefined()
    expect(cs?.icon).toBe('🔥')
    expect(cs?.memberId).toBe('a')
    expect(cs?.text).toContain('3 回連続')
  })

  test('currentStreak 2 では発火しない', () => {
    const c = ctx({
      streaks: [streak('a', { currentStreak: 2, maxStreak: 2 })],
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'current-streak')
    ).toBeUndefined()
  })

  test('複数メンバーの同時ストリークを独立に発火', () => {
    const c = ctx({
      streaks: [
        streak('a', { currentStreak: 3 }),
        streak('b', { currentStreak: 4 }),
      ],
    })
    const all = computeInsights(c).filter((i) => i.kind === 'current-streak')
    expect(all).toHaveLength(2)
  })
})

// ---- 6. 最大ストリーク ----

describe('max-streak', () => {
  test(`期間内最長が >= ${INSIGHT_MAX_STREAK_MIN} で発火`, () => {
    const c = ctx({
      streaks: [
        streak('a', { maxStreak: 7, currentStreak: 0 }),
        streak('b', { maxStreak: 3 }),
      ],
    })
    const ms = computeInsights(c).find((i) => i.kind === 'max-streak')
    expect(ms).toBeDefined()
    expect(ms?.memberId).toBe('a')
    expect(ms?.text).toContain('7 連勝')
  })
})

// ---- 7. CLUTCH 偏り ----

describe('clutch-bias', () => {
  test(`1 人が CLUTCH の 40% 超, 全体 >= ${INSIGHT_CLUTCH_BIAS_MIN_TOTAL} で発火`, () => {
    const c = ctx({
      summary: { totalCount: 10, totalAmount: 1, clutchCount: 5 },
      memberSummaries: [
        member('a', { memberName: 'A', clutchCount: 3 }),
        member('b', { clutchCount: 1 }),
        member('c', { clutchCount: 1 }),
      ],
    })
    const bias = computeInsights(c).find((i) => i.kind === 'clutch-bias')
    expect(bias).toBeDefined()
    expect(bias?.memberId).toBe('a')
    expect(bias?.text).toContain('60%')
  })

  test('全体 CLUTCH 数が少ないと発火しない', () => {
    const c = ctx({
      summary: { totalCount: 2, totalAmount: 1, clutchCount: 2 },
      memberSummaries: [member('a', { clutchCount: 2 })],
    })
    expect(computeInsights(c).find((i) => i.kind === 'clutch-bias')).toBeUndefined()
  })
})

// ---- 8. CLUTCH 不在 ----

describe('clutch-absent', () => {
  test(`clutchCount=0 かつ totalCount >= ${INSIGHT_CLUTCH_ABSENT_MIN_EVENTS} で発火`, () => {
    const c = ctx({
      summary: { totalCount: 12, totalAmount: 1, clutchCount: 0 },
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'clutch-absent')
    ).toBeDefined()
  })

  test('clutchCount > 0 なら発火しない', () => {
    const c = ctx({
      summary: { totalCount: 12, totalAmount: 1, clutchCount: 1 },
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'clutch-absent')
    ).toBeUndefined()
  })

  test('totalCount が少なければ発火しない', () => {
    const c = ctx({
      summary: { totalCount: 5, totalAmount: 1, clutchCount: 0 },
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'clutch-absent')
    ).toBeUndefined()
  })
})

// ---- 9. CLUTCH 密集 ----

describe('clutch-cluster', () => {
  test(`clutchCount >= ${INSIGHT_CLUTCH_CLUSTER_MIN} で発火`, () => {
    const c = ctx({
      summary: { totalCount: 10, totalAmount: 1, clutchCount: 6 },
    })
    expect(
      computeInsights(c).find((i) => i.kind === 'clutch-cluster')
    ).toBeDefined()
  })
})

// ---- 10. 不運期間 ----

describe('no-pay-streak', () => {
  test(`参加 >= ${INSIGHT_NO_PAY_MIN_PARTICIPATIONS}, payerCount=0 で発火`, () => {
    const c = ctx({
      memberSummaries: [
        member('a', {
          memberName: 'A',
          participationCount: 15,
          payerCount: 0,
        }),
      ],
    })
    const i = computeInsights(c).find((x) => x.kind === 'no-pay-streak')
    expect(i).toBeDefined()
    expect(i?.text).toContain('15 回参加')
  })

  test('payerCount > 0 なら発火しない', () => {
    const c = ctx({
      memberSummaries: [
        member('a', { participationCount: 15, payerCount: 1 }),
      ],
    })
    expect(computeInsights(c).find((x) => x.kind === 'no-pay-streak')).toBeUndefined()
  })
})

// ---- 11. カテゴリ偏り ----

describe('category-bias', () => {
  test('1 カテゴリが 60% 超かつ totalCount >= 5 で発火', () => {
    const c = ctx({
      summary: { totalCount: 10, totalAmount: 1000, clutchCount: 0 },
      categoryBreakdown: [
        { category: 'TRIP', amount: 800, count: 5 },
        { category: 'HANGOUT', amount: 100, count: 3 },
        { category: 'OTHER', amount: 100, count: 2 },
      ],
    })
    const i = computeInsights(c).find((x) => x.kind === 'category-bias')
    expect(i).toBeDefined()
    expect(i?.text).toContain('旅行')
  })

  test('均等分布では発火しない', () => {
    const c = ctx({
      summary: { totalCount: 10, totalAmount: 900, clutchCount: 0 },
      categoryBreakdown: [
        { category: 'TRIP', amount: 300, count: 4 },
        { category: 'HANGOUT', amount: 300, count: 3 },
        { category: 'OTHER', amount: 300, count: 3 },
      ],
    })
    expect(computeInsights(c).find((x) => x.kind === 'category-bias')).toBeUndefined()
  })
})

// ---- 12. ピーク月 ----

describe('peak-month', () => {
  test(`1 月が ${INSIGHT_PEAK_MONTH_SHARE * 100}% 超なら発火`, () => {
    const c = ctx({
      monthlyTrend: [
        { month: '2026-11', amount: 500_000 },
        { month: '2026-12', amount: 100_000 },
        { month: '2027-01', amount: 50_000 },
      ],
    })
    const i = computeInsights(c).find((x) => x.kind === 'peak-month')
    expect(i).toBeDefined()
    expect(i?.text).toContain('2026/11月')
  })

  test('月が 1 つしかなければ発火しない (比較できない)', () => {
    const c = ctx({
      monthlyTrend: [{ month: '2026-11', amount: 500_000 }],
    })
    expect(computeInsights(c).find((x) => x.kind === 'peak-month')).toBeUndefined()
  })
})

// ---- 13. 単発高額記録 ----

describe('single-high-record', () => {
  test(`単発 >= ${INSIGHT_SINGLE_HIGH_RECORD} で発火`, () => {
    const c = ctx({
      memberSummaries: [
        member('a', { memberName: 'A', maxSingleOtokogi: 150_000 }),
      ],
    })
    const i = computeInsights(c).find((x) => x.kind === 'single-high-record')
    expect(i).toBeDefined()
    expect(i?.memberId).toBe('a')
  })
})

// ---- 14. じゃんけん勝率偏り ----

describe('janken-bias', () => {
  test(`勝率 75%+ かつ >= ${INSIGHT_JANKEN_GAMES_MIN} 戦で "運の神" 発火`, () => {
    const c = ctx({
      memberSummaries: [
        member('a', {
          memberName: 'A',
          jankenWinRate: 0.8,
          jankenParticipationCount: 15,
        }),
      ],
    })
    const i = computeInsights(c).find((x) => x.kind === 'janken-bias')
    expect(i).toBeDefined()
    expect(i?.text).toContain('運の神')
  })

  test('勝率 25% 以下で "集中しやすい" 側 insight', () => {
    const c = ctx({
      memberSummaries: [
        member('a', {
          jankenWinRate: 0.2,
          jankenParticipationCount: 15,
        }),
      ],
    })
    const i = computeInsights(c).find((x) => x.kind === 'janken-bias')
    expect(i?.text).toContain('集中しやすい')
  })

  test('試合数が足りなければ発火しない', () => {
    const c = ctx({
      memberSummaries: [
        member('a', { jankenWinRate: 0.8, jankenParticipationCount: 5 }),
      ],
    })
    expect(computeInsights(c).find((x) => x.kind === 'janken-bias')).toBeUndefined()
  })

  test('jankenWinRate=null は無視 (記録なし)', () => {
    const c = ctx({
      memberSummaries: [
        member('a', { jankenWinRate: null, jankenParticipationCount: 20 }),
      ],
    })
    expect(computeInsights(c).find((x) => x.kind === 'janken-bias')).toBeUndefined()
  })
})

// ---- 15. 気前度突出 ----

describe('generosity-bias', () => {
  test('平均単価が全体平均の 2 倍以上なら発火', () => {
    const c = ctx({
      memberSummaries: [
        member('a', { memberName: 'A', payerCount: 2, averagePaymentAmount: 100_000 }),
        member('b', { payerCount: 3, averagePaymentAmount: 30_000 }),
        member('c', { payerCount: 2, averagePaymentAmount: 20_000 }),
      ],
    })
    const i = computeInsights(c).find((x) => x.kind === 'generosity-bias')
    expect(i).toBeDefined()
    expect(i?.memberId).toBe('a')
  })

  test('payer が 1 人しかいなければ発火しない (比較できない)', () => {
    const c = ctx({
      memberSummaries: [
        member('a', { payerCount: 3, averagePaymentAmount: 100_000 }),
      ],
    })
    expect(
      computeInsights(c).find((x) => x.kind === 'generosity-bias')
    ).toBeUndefined()
  })
})

// ---- 優先度ソート ----

describe('computeInsights ordering', () => {
  test('insight は priority 降順で返る', () => {
    const c = ctx({
      summary: { totalCount: 20, totalAmount: 1_200_000, clutchCount: 7 },
      previous: { totalCount: 5, totalAmount: 300_000, clutchCount: 1 },
      memberSummaries: [
        member('a', {
          memberName: 'A',
          participationCount: 10,
          payerCount: 7,
          actualPaid: 1_000_000,
          clutchCount: 5,
          maxSingleOtokogi: 200_000,
          averagePaymentAmount: 143_000,
        }),
        member('b', { memberName: 'B', participationCount: 12, payerCount: 1, actualPaid: 100_000 }),
        member('c', { memberName: 'C', participationCount: 15, payerCount: 0 }),
      ],
      streaks: [streak('a', { maxStreak: 7, currentStreak: 3 })],
      categoryBreakdown: [
        { category: 'TRIP', amount: 900_000, count: 6 },
        { category: 'HANGOUT', amount: 200_000, count: 3 },
      ],
      monthlyTrend: [
        { month: '2026-11', amount: 800_000 },
        { month: '2026-12', amount: 200_000 },
        { month: '2027-01', amount: 100_000 },
      ],
    })
    const insights = computeInsights(c)
    expect(insights.length).toBeGreaterThanOrEqual(6)
    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1].priority).toBeGreaterThanOrEqual(insights[i].priority)
    }
  })

  test('全て空の context では insight が出ない', () => {
    expect(computeInsights(ctx())).toHaveLength(0)
  })

  test('15 種類の判定を含む (仕様: 10 種以上)', () => {
    // 各 detector をフル発火させる network of conditions を 1 発で用意する。
    const c = ctx({
      summary: { totalCount: 30, totalAmount: 3_000_000, clutchCount: 8 },
      previous: { totalCount: 10, totalAmount: 500_000, clutchCount: 1 },
      memberSummaries: [
        member('a', {
          memberName: 'A',
          participationCount: 20,
          payerCount: 5,
          actualPaid: 1_500_000,
          shouldHavePaid: 600_000,
          otokogiAmount: 900_000,
          averagePaymentAmount: 300_000,
          maxSingleOtokogi: 200_000,
          clutchCount: 5,
          jankenWinRate: 0.8,
          jankenParticipationCount: 15,
        }),
        member('b', {
          memberName: 'B',
          participationCount: 20,
          payerCount: 10,
          actualPaid: 500_000,
          averagePaymentAmount: 50_000,
          clutchCount: 1,
        }),
        member('c', {
          memberName: 'C',
          participationCount: 20,
          payerCount: 0,
        }),
      ],
      streaks: [
        streak('a', { maxStreak: 6, currentStreak: 4 }),
      ],
      categoryBreakdown: [
        { category: 'TRIP', amount: 2_500_000, count: 10 },
        { category: 'HANGOUT', amount: 400_000, count: 15 },
        { category: 'OTHER', amount: 100_000, count: 5 },
      ],
      monthlyTrend: [
        { month: '2026-11', amount: 2_000_000 },
        { month: '2026-12', amount: 600_000 },
        { month: '2027-01', amount: 400_000 },
      ],
    })
    const kinds = new Set(computeInsights(c).map((i) => i.kind))
    // 以下の 7 系統は最低でも発火する組み合わせにしてある
    expect(kinds.has('period-growth-total')).toBe(true)
    expect(kinds.has('period-growth-count')).toBe(true)
    expect(kinds.has('mvp-near-locked')).toBe(true)
    expect(kinds.has('current-streak')).toBe(true)
    expect(kinds.has('max-streak')).toBe(true)
    expect(kinds.has('clutch-bias')).toBe(true)
    expect(kinds.has('clutch-cluster')).toBe(true)
    expect(kinds.has('no-pay-streak')).toBe(true)
    expect(kinds.has('category-bias')).toBe(true)
    expect(kinds.has('peak-month')).toBe(true)
    expect(kinds.has('single-high-record')).toBe(true)
    expect(kinds.has('janken-bias')).toBe(true)
    expect(kinds.has('generosity-bias')).toBe(true)
  })
})
