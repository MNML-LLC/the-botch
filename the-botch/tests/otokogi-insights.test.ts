/**
 * lib/otokogi-insights.ts のテスト (Issue #404 — Auto-Insights)
 *
 * 実行: npx vitest run tests/otokogi-insights.test.ts
 */
import { describe, test, expect } from 'vitest'
import {
  computeInsights,
  type InsightContext,
  type InsightMemberSummary,
  type InsightStreakEntry,
  type InsightCategoryEntry,
} from '@/lib/otokogi-insights'

function member(id: string, overrides: Partial<InsightMemberSummary> = {}): InsightMemberSummary {
  return {
    memberId: id,
    memberName: `M-${id}`,
    participationCount: 0,
    payerCount: 0,
    actualPaid: 0,
    shouldHavePaid: 0,
    otokogiAmount: 0,
    averagePaymentAmount: 0,
    maxSingleOtokogi: 0,
    clutchCount: 0,
    clutchTotal: 0,
    jankenWinRate: null,
    jankenParticipationCount: 0,
    ...overrides,
  }
}

function streak(id: string, max: number, current: number, name?: string): InsightStreakEntry {
  return { id, maxStreak: max, currentStreak: current, name }
}

function ctx(overrides: Partial<InsightContext> = {}): InsightContext {
  return {
    totalCount: 0,
    totalAmount: 0,
    averageAmount: 0,
    memberSummaries: [],
    streaks: [],
    monthlyTrend: [],
    categoryBreakdown: [],
    previous: null,
    ...overrides,
  }
}

describe('computeInsights', () => {
  describe('1. period-growth-total (前期比 — 総額)', () => {
    test('前期比 +20% 以上で成長 insight を生成', () => {
      const result = computeInsights(
        ctx({
          totalAmount: 150_000,
          previous: { totalCount: 10, totalAmount: 100_000 },
        })
      )
      const i = result.find((x) => x.kind === 'period-growth-total')
      expect(i).toBeDefined()
      expect(i!.icon).toBe('📈')
      expect(i!.priority).toBe(10)
      expect(i!.text).toContain('+50%')
    })

    test('前期比 -20% 以上で減少 insight を生成', () => {
      const result = computeInsights(
        ctx({
          totalAmount: 50_000,
          previous: { totalCount: 10, totalAmount: 100_000 },
        })
      )
      const i = result.find((x) => x.kind === 'period-growth-total')
      expect(i).toBeDefined()
      expect(i!.icon).toBe('📉')
      expect(i!.text).toContain('減少')
    })

    test('±20% 未満は検出しない', () => {
      const result = computeInsights(
        ctx({
          totalAmount: 110_000,
          previous: { totalCount: 10, totalAmount: 100_000 },
        })
      )
      expect(result.find((x) => x.kind === 'period-growth-total')).toBeUndefined()
    })

    test('previous=null のときは検出しない', () => {
      const result = computeInsights(ctx({ totalAmount: 500_000, previous: null }))
      expect(result.find((x) => x.kind === 'period-growth-total')).toBeUndefined()
    })

    test('previous.totalAmount=0 のときは検出しない (division by zero 回避)', () => {
      const result = computeInsights(
        ctx({
          totalAmount: 500_000,
          previous: { totalCount: 0, totalAmount: 0 },
        })
      )
      expect(result.find((x) => x.kind === 'period-growth-total')).toBeUndefined()
    })
  })

  describe('2. period-growth-count (前期比 — 件数)', () => {
    test('件数が 5 件以上増えたら検出', () => {
      const result = computeInsights(
        ctx({
          totalCount: 15,
          totalAmount: 100,
          previous: { totalCount: 10, totalAmount: 100 },
        })
      )
      const i = result.find((x) => x.kind === 'period-growth-count')
      expect(i).toBeDefined()
      expect(i!.text).toContain('+5')
    })

    test('件数が 20% 以上変化したら 5 件未満でも検出', () => {
      const result = computeInsights(
        ctx({
          totalCount: 4,
          totalAmount: 100,
          previous: { totalCount: 2, totalAmount: 100 },
        })
      )
      expect(result.find((x) => x.kind === 'period-growth-count')).toBeDefined()
    })

    test('件数差 0 のときは検出しない', () => {
      const result = computeInsights(
        ctx({
          totalCount: 10,
          totalAmount: 100,
          previous: { totalCount: 10, totalAmount: 100 },
        })
      )
      expect(result.find((x) => x.kind === 'period-growth-count')).toBeUndefined()
    })
  })

  describe('3. mvp-near-locked (MVP ほぼ確定)', () => {
    test('top1 のリードが top2 の 0.5 倍を超えたら検出', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { memberName: 'Alice', actualPaid: 200_000 }),
            member('b', { memberName: 'Bob', actualPaid: 100_000 }),
          ],
        })
      )
      const i = result.find((x) => x.kind === 'mvp-near-locked')
      expect(i).toBeDefined()
      expect(i!.memberId).toBe('a')
      expect(i!.text).toContain('Alice')
    })

    test('top1 と top2 の差が小さいときは検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { actualPaid: 110_000 }),
            member('b', { actualPaid: 100_000 }),
          ],
        })
      )
      expect(result.find((x) => x.kind === 'mvp-near-locked')).toBeUndefined()
    })

    test('メンバー 1 人だけなら検出しない', () => {
      const result = computeInsights(
        ctx({ memberSummaries: [member('a', { actualPaid: 100_000 })] })
      )
      expect(result.find((x) => x.kind === 'mvp-near-locked')).toBeUndefined()
    })
  })

  describe('4. tight-race (接戦)', () => {
    test('top1 と top2 の差が 5% 以内で接戦 insight を生成', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { memberName: 'Alice', actualPaid: 100_000 }),
            member('b', { memberName: 'Bob', actualPaid: 98_000 }),
          ],
        })
      )
      const i = result.find((x) => x.kind === 'tight-race')
      expect(i).toBeDefined()
      expect(i!.text).toContain('Alice')
      expect(i!.text).toContain('Bob')
    })

    test('差が 5% を超えたら検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { actualPaid: 200_000 }),
            member('b', { actualPaid: 100_000 }),
          ],
        })
      )
      expect(result.find((x) => x.kind === 'tight-race')).toBeUndefined()
    })
  })

  describe('5. current-streak (現在ストリーク)', () => {
    test('3 連続で検出 (priority 7)', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [member('a', { memberName: 'Alice' })],
          streaks: [streak('a', 3, 3, 'Alice')],
        })
      )
      const i = result.find((x) => x.kind === 'current-streak')
      expect(i).toBeDefined()
      expect(i!.priority).toBe(7)
      expect(i!.text).toContain('3 回連続')
    })

    test('5 連続以上で priority 9', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [member('a', { memberName: 'Alice' })],
          streaks: [streak('a', 5, 5, 'Alice')],
        })
      )
      const i = result.find((x) => x.kind === 'current-streak')
      expect(i!.priority).toBe(9)
    })

    test('2 連続以下では検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [member('a', { memberName: 'Alice' })],
          streaks: [streak('a', 2, 2, 'Alice')],
        })
      )
      expect(result.find((x) => x.kind === 'current-streak')).toBeUndefined()
    })

    test('複数メンバーが該当すれば個別に生成', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { memberName: 'Alice' }),
            member('b', { memberName: 'Bob' }),
          ],
          streaks: [streak('a', 3, 3, 'Alice'), streak('b', 4, 4, 'Bob')],
        })
      )
      const matches = result.filter((x) => x.kind === 'current-streak')
      expect(matches).toHaveLength(2)
    })
  })

  describe('6. clutch-bias (CLUTCH 偏り)', () => {
    test('1 人が CLUTCH 総数の 40%+ を占めたら検出', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { memberName: 'Alice', clutchCount: 3 }),
            member('b', { memberName: 'Bob', clutchCount: 2 }),
            member('c', { memberName: 'Carol', clutchCount: 1 }),
          ],
        })
      )
      const i = result.find((x) => x.kind === 'clutch-bias' && x.memberId === 'a')
      expect(i).toBeDefined()
      expect(i!.text).toContain('Alice')
      expect(i!.text).toContain('50%')
    })

    test('CLUTCH 総数が 3 未満のときは検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [member('a', { clutchCount: 2 })],
        })
      )
      expect(result.find((x) => x.kind === 'clutch-bias')).toBeUndefined()
    })

    test('全員 CLUTCH 0 なら検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { clutchCount: 0 }),
            member('b', { clutchCount: 0 }),
          ],
        })
      )
      expect(result.find((x) => x.kind === 'clutch-bias')).toBeUndefined()
    })
  })

  describe('7. clutch-cluster (CLUTCH 集中)', () => {
    test('期間内 CLUTCH 合計 5 以上で検出', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { clutchCount: 3 }),
            member('b', { clutchCount: 2 }),
          ],
        })
      )
      const i = result.find((x) => x.kind === 'clutch-cluster')
      expect(i).toBeDefined()
      expect(i!.text).toContain('5 回')
    })

    test('CLUTCH 合計 4 以下では検出しない', () => {
      const result = computeInsights(
        ctx({ memberSummaries: [member('a', { clutchCount: 4 })] })
      )
      expect(result.find((x) => x.kind === 'clutch-cluster')).toBeUndefined()
    })
  })

  describe('8. no-pay-streak (不運ストリーク)', () => {
    test('参加 10+ で支払 0 のメンバーで検出', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { memberName: 'Alice', participationCount: 12, payerCount: 0 }),
          ],
        })
      )
      const i = result.find((x) => x.kind === 'no-pay-streak')
      expect(i).toBeDefined()
      expect(i!.memberId).toBe('a')
      expect(i!.text).toContain('Alice')
      expect(i!.text).toContain('12 回')
    })

    test('参加 10 未満では検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [member('a', { participationCount: 9, payerCount: 0 })],
        })
      )
      expect(result.find((x) => x.kind === 'no-pay-streak')).toBeUndefined()
    })

    test('1 回でも払っていれば検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [member('a', { participationCount: 20, payerCount: 1 })],
        })
      )
      expect(result.find((x) => x.kind === 'no-pay-streak')).toBeUndefined()
    })
  })

  describe('9. category-bias (カテゴリ偏り)', () => {
    test('1 カテゴリが総額の 60%+ を占めたら検出', () => {
      const breakdown: InsightCategoryEntry[] = [
        { category: 'TRIP', amount: 700_000, count: 3 },
        { category: 'HANGOUT', amount: 200_000, count: 5 },
        { category: 'ACTIVITY', amount: 50_000, count: 1 },
        { category: 'OTHER', amount: 50_000, count: 1 },
      ]
      const result = computeInsights(ctx({ categoryBreakdown: breakdown }))
      const i = result.find((x) => x.kind === 'category-bias')
      expect(i).toBeDefined()
      expect(i!.text).toContain('旅行')
      expect(i!.text).toContain('70%')
    })

    test('バランス良ければ検出しない', () => {
      const breakdown: InsightCategoryEntry[] = [
        { category: 'TRIP', amount: 300_000, count: 3 },
        { category: 'HANGOUT', amount: 300_000, count: 3 },
        { category: 'OTHER', amount: 400_000, count: 3 },
      ]
      const result = computeInsights(ctx({ categoryBreakdown: breakdown }))
      expect(result.find((x) => x.kind === 'category-bias')).toBeUndefined()
    })
  })

  describe('10. peak-month (ピーク月)', () => {
    test('1 月が総額の 40%+ ならピーク insight を生成', () => {
      const result = computeInsights(
        ctx({
          monthlyTrend: [
            { month: '2026-01', amount: 100_000 },
            { month: '2026-02', amount: 50_000 },
            { month: '2026-03', amount: 50_000 },
          ],
        })
      )
      const i = result.find((x) => x.kind === 'peak-month')
      expect(i).toBeDefined()
      expect(i!.text).toContain('2026/1月')
    })

    test('月が 1 つしかないときは検出しない', () => {
      const result = computeInsights(
        ctx({ monthlyTrend: [{ month: '2026-01', amount: 100_000 }] })
      )
      expect(result.find((x) => x.kind === 'peak-month')).toBeUndefined()
    })
  })

  describe('11. clutch-absent (CLUTCH 不在)', () => {
    test('件数 10+ で CLUTCH 0 件なら検出', () => {
      const result = computeInsights(
        ctx({
          totalCount: 15,
          memberSummaries: [member('a', { clutchCount: 0 })],
        })
      )
      const i = result.find((x) => x.kind === 'clutch-absent')
      expect(i).toBeDefined()
      expect(i!.text).toContain('15 件')
    })

    test('件数 10 未満なら検出しない', () => {
      const result = computeInsights(
        ctx({
          totalCount: 5,
          memberSummaries: [member('a', { clutchCount: 0 })],
        })
      )
      expect(result.find((x) => x.kind === 'clutch-absent')).toBeUndefined()
    })

    test('CLUTCH が 1 件でもあれば検出しない', () => {
      const result = computeInsights(
        ctx({
          totalCount: 15,
          memberSummaries: [member('a', { clutchCount: 1 })],
        })
      )
      expect(result.find((x) => x.kind === 'clutch-absent')).toBeUndefined()
    })
  })

  describe('12. max-streak (最長ストリーク)', () => {
    test('期間最長 5+ で検出', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [member('a', { memberName: 'Alice' })],
          streaks: [streak('a', 7, 0, 'Alice')],
        })
      )
      const i = result.find((x) => x.kind === 'max-streak')
      expect(i).toBeDefined()
      expect(i!.text).toContain('Alice')
      expect(i!.text).toContain('7 連続')
    })

    test('最長 4 以下では検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [member('a', { memberName: 'Alice' })],
          streaks: [streak('a', 4, 0, 'Alice')],
        })
      )
      expect(result.find((x) => x.kind === 'max-streak')).toBeUndefined()
    })
  })

  describe('13. janken-bias (じゃんけん偏り)', () => {
    test('勝率 75%+ (10 戦以上) で圧勝型', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', {
              memberName: 'Alice',
              jankenWinRate: 0.8,
              jankenParticipationCount: 10,
            }),
          ],
        })
      )
      const i = result.find((x) => x.kind === 'janken-bias')
      expect(i).toBeDefined()
      expect(i!.text).toContain('Alice')
      expect(i!.text).toContain('80%')
      expect(i!.text).toContain('圧勝')
    })

    test('勝率 25%- (10 戦以上) で苦戦', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', {
              memberName: 'Alice',
              jankenWinRate: 0.2,
              jankenParticipationCount: 15,
            }),
          ],
        })
      )
      const i = result.find((x) => x.kind === 'janken-bias')
      expect(i).toBeDefined()
      expect(i!.text).toContain('苦戦')
    })

    test('10 戦未満では検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { jankenWinRate: 0.9, jankenParticipationCount: 5 }),
          ],
        })
      )
      expect(result.find((x) => x.kind === 'janken-bias')).toBeUndefined()
    })

    test('勝率 null (未集計) では検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { jankenWinRate: null, jankenParticipationCount: 20 }),
          ],
        })
      )
      expect(result.find((x) => x.kind === 'janken-bias')).toBeUndefined()
    })
  })

  describe('14. single-high-record (単発高額記録)', () => {
    test('単発 ¥100k+ の男気で検出', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { memberName: 'Alice', maxSingleOtokogi: 150_000 }),
          ],
        })
      )
      const i = result.find((x) => x.kind === 'single-high-record')
      expect(i).toBeDefined()
      expect(i!.text).toContain('Alice')
      expect(i!.text).toContain('¥150,000')
    })

    test('¥100k 未満では検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [member('a', { maxSingleOtokogi: 90_000 })],
        })
      )
      expect(result.find((x) => x.kind === 'single-high-record')).toBeUndefined()
    })
  })

  describe('15. generosity-bias (気前度バイアス)', () => {
    test('平均単価が全体平均の 2 倍+ で検出', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', {
              memberName: 'Alice',
              payerCount: 2,
              averagePaymentAmount: 100_000,
            }),
            member('b', {
              memberName: 'Bob',
              payerCount: 3,
              averagePaymentAmount: 10_000,
            }),
            member('c', {
              memberName: 'Carol',
              payerCount: 2,
              averagePaymentAmount: 10_000,
            }),
          ],
        })
      )
      const i = result.find((x) => x.kind === 'generosity-bias')
      expect(i).toBeDefined()
      expect(i!.memberId).toBe('a')
      expect(i!.text).toContain('Alice')
    })

    test('差が小さいときは検出しない', () => {
      const result = computeInsights(
        ctx({
          memberSummaries: [
            member('a', { payerCount: 2, averagePaymentAmount: 30_000 }),
            member('b', { payerCount: 3, averagePaymentAmount: 20_000 }),
          ],
        })
      )
      expect(result.find((x) => x.kind === 'generosity-bias')).toBeUndefined()
    })
  })

  describe('sort & aggregate', () => {
    test('優先度降順でソートされる', () => {
      const result = computeInsights(
        ctx({
          totalAmount: 200_000,
          totalCount: 20,
          previous: { totalCount: 10, totalAmount: 100_000 },
          memberSummaries: [
            member('a', {
              memberName: 'Alice',
              actualPaid: 200_000,
              clutchCount: 3,
              maxSingleOtokogi: 150_000,
            }),
            member('b', {
              memberName: 'Bob',
              actualPaid: 50_000,
            }),
          ],
        })
      )
      // priority 10 が最初に出るはず (period-growth-total)
      expect(result[0].kind).toBe('period-growth-total')
      // 順序が降順
      for (let i = 1; i < result.length; i++) {
        expect(result[i].priority).toBeLessThanOrEqual(result[i - 1].priority)
      }
    })

    test('全空 context では insight 0 件', () => {
      const result = computeInsights(ctx())
      expect(result).toHaveLength(0)
    })

    test('全 detector を同時にトリガしても矛盾なく返す', () => {
      const result = computeInsights(
        ctx({
          totalCount: 20,
          totalAmount: 500_000,
          previous: { totalCount: 10, totalAmount: 200_000 },
          memberSummaries: [
            member('a', {
              memberName: 'Alice',
              participationCount: 20,
              payerCount: 10,
              actualPaid: 400_000,
              clutchCount: 5,
              maxSingleOtokogi: 150_000,
              averagePaymentAmount: 40_000,
              jankenWinRate: 0.8,
              jankenParticipationCount: 15,
            }),
            member('b', {
              memberName: 'Bob',
              participationCount: 15,
              payerCount: 0,
              actualPaid: 50_000,
              averagePaymentAmount: 0,
            }),
          ],
          streaks: [streak('a', 7, 5, 'Alice')],
          categoryBreakdown: [
            { category: 'TRIP', amount: 400_000, count: 3 },
            { category: 'HANGOUT', amount: 50_000, count: 1 },
            { category: 'ACTIVITY', amount: 25_000, count: 1 },
            { category: 'OTHER', amount: 25_000, count: 1 },
          ],
          monthlyTrend: [
            { month: '2026-01', amount: 300_000 },
            { month: '2026-02', amount: 100_000 },
            { month: '2026-03', amount: 100_000 },
          ],
        })
      )
      // 複数 kind が返り、ソートされていること
      expect(result.length).toBeGreaterThan(5)
      for (let i = 1; i < result.length; i++) {
        expect(result[i].priority).toBeLessThanOrEqual(result[i - 1].priority)
      }
    })
  })
})
