/**
 * lib/otokogi-badges.ts のテスト (Issue #368 — Phase 3 称号・バッジシステム)
 *
 * 実行: npx vitest run tests/otokogi-badges.test.ts
 */
import { describe, test, expect } from 'vitest'
import {
  computeBadges,
  topBadge,
  BADGE_CLUTCH_MIN,
  BADGE_STREAK_MIN,
  BADGE_JANKEN_RATE_MIN,
  BADGE_JANKEN_GAMES_MIN,
  type BadgeContext,
} from '@/lib/otokogi-badges'

// 最小の context ヘルパー
function makeCtx(overrides: Partial<BadgeContext>): BadgeContext {
  return {
    periodLabel: 'FY26',
    streaks: [],
    memberSummaries: [],
    ...overrides,
  }
}

function emptySummary(memberId: string) {
  return {
    memberId,
    payerCount: 0,
    actualPaid: 0,
    averagePaymentAmount: 0,
    clutchCount: 0,
    jankenWinRate: null,
    jankenParticipationCount: 0,
  }
}

// MVP 判定用の便利ヘルパー: actualPaid だけ指定したサマリを作る (Issue #393)
function summaryWithPaid(memberId: string, actualPaid: number) {
  return { ...emptySummary(memberId), actualPaid }
}

describe('computeBadges', () => {
  // Issue #393: MVP 判定は actualPaid (合計支払額) ベース (旧: otokogiAmount = 超過分)
  describe('MVP (支払総額 1 位 / Issue #393)', () => {
    test('支払総額 1 位のメンバーに MVP が付与される', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summaryWithPaid('a', 100_000),
          summaryWithPaid('b', 50_000),
        ],
      })
      const badges = computeBadges('a', ctx)
      const mvp = badges.find((b) => b.kind === 'mvp')
      expect(mvp).toBeDefined()
      expect(mvp?.id).toBe('mvp-FY26')
      expect(mvp?.label).toBe('FY26 MVP (総額)')
      // description に actualPaid 値が含まれる
      expect(mvp?.description).toContain('¥100,000')
      expect(mvp?.description).toContain('合計額 1 位')
    })

    test('2 位以下のメンバーには MVP は付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summaryWithPaid('a', 100_000),
          summaryWithPaid('b', 50_000),
        ],
      })
      const badges = computeBadges('b', ctx)
      expect(badges.find((b) => b.kind === 'mvp')).toBeUndefined()
    })

    test('支払総額が 0 円しかない期間では MVP は付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summaryWithPaid('a', 0),
          summaryWithPaid('b', 0),
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'mvp')).toBeUndefined()
    })

    test('memberSummaries が空の場合は付与されない', () => {
      const ctx = makeCtx({})
      expect(computeBadges('a', ctx).find((b) => b.kind === 'mvp')).toBeUndefined()
    })

    test('periodLabel がラベル・ID に埋め込まれる', () => {
      const ctx = makeCtx({
        periodLabel: '2026',
        memberSummaries: [summaryWithPaid('a', 10)],
      })
      const mvp = computeBadges('a', ctx).find((b) => b.kind === 'mvp')
      expect(mvp?.id).toBe('mvp-2026')
      expect(mvp?.label).toBe('2026 MVP (総額)')
    })

    // Issue #393 回帰防止: 旧仕様では「少ない回数で大きく払った人」が MVP になりやすかった。
    // 新仕様では純粋な合計額 1 位になることを確認する。
    test('「少ない参加で高額 1 回」より「多数の支払いの合計」を優先する', () => {
      const ctx = makeCtx({
        memberSummaries: [
          // a: 1 回だけだが 100k を単独で払った (旧仕様では MVP になりやすい)
          { ...emptySummary('a'), payerCount: 1, actualPaid: 100_000 },
          // b: 複数回払った合計で 200k (新仕様の総額 1 位)
          { ...emptySummary('b'), payerCount: 5, actualPaid: 200_000 },
        ],
      })
      expect(computeBadges('b', ctx).find((bg) => bg.kind === 'mvp')).toBeDefined()
      expect(computeBadges('a', ctx).find((bg) => bg.kind === 'mvp')).toBeUndefined()
    })
  })

  describe('クラッチマスター (CLUTCH 5 回以上)', () => {
    test(`clutchCount >= ${BADGE_CLUTCH_MIN} で付与される`, () => {
      const ctx = makeCtx({
        memberSummaries: [
          { ...emptySummary('a'), clutchCount: BADGE_CLUTCH_MIN },
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'clutch-master')).toBeDefined()
    })

    test(`clutchCount < ${BADGE_CLUTCH_MIN} では付与されない`, () => {
      const ctx = makeCtx({
        memberSummaries: [
          { ...emptySummary('a'), clutchCount: BADGE_CLUTCH_MIN - 1 },
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'clutch-master')).toBeUndefined()
    })

    test('member-summary に存在しないメンバーには付与されない', () => {
      const ctx = makeCtx({ memberSummaries: [] })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'clutch-master')).toBeUndefined()
    })
  })

  describe('ストリーク王 (連続男気 5 回以上)', () => {
    test(`maxStreak >= ${BADGE_STREAK_MIN} で付与される`, () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: BADGE_STREAK_MIN }],
      })
      const badge = computeBadges('a', ctx).find((b) => b.kind === 'streak-king')
      expect(badge).toBeDefined()
      expect(badge?.label).toContain(`${BADGE_STREAK_MIN}連勝`)
    })

    test(`maxStreak < ${BADGE_STREAK_MIN} では付与されない`, () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: BADGE_STREAK_MIN - 1 }],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'streak-king')).toBeUndefined()
    })

    test('ラベルに連勝数を含む (7 連勝)', () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: 7 }],
      })
      const badge = computeBadges('a', ctx).find((b) => b.kind === 'streak-king')
      expect(badge?.label).toBe('ストリーク王 (7連勝)')
    })
  })

  describe('気前度の帝王 (平均支払単価 1 位)', () => {
    test('平均支払単価が 1 位のメンバーに付与される', () => {
      const ctx = makeCtx({
        memberSummaries: [
          { ...emptySummary('a'), payerCount: 10, averagePaymentAmount: 30_000 },
          { ...emptySummary('b'), payerCount: 5, averagePaymentAmount: 60_000 },
        ],
      })
      expect(computeBadges('b', ctx).find((b) => b.kind === 'generosity-emperor')).toBeDefined()
      expect(computeBadges('a', ctx).find((b) => b.kind === 'generosity-emperor')).toBeUndefined()
    })

    test('payerCount が 0 のメンバーは候補から除外される', () => {
      const ctx = makeCtx({
        memberSummaries: [
          { ...emptySummary('a'), payerCount: 0, averagePaymentAmount: 100_000 },
          { ...emptySummary('b'), payerCount: 3, averagePaymentAmount: 30_000 },
        ],
      })
      expect(computeBadges('b', ctx).find((b) => b.kind === 'generosity-emperor')).toBeDefined()
      expect(computeBadges('a', ctx).find((b) => b.kind === 'generosity-emperor')).toBeUndefined()
    })

    test('全員 payerCount=0 の場合は誰にも付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [emptySummary('a'), emptySummary('b')],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'generosity-emperor')).toBeUndefined()
    })
  })

  describe('じゃんけん神 (勝率 70% 以上 かつ 10 試合以上)', () => {
    test(`勝率 >= ${BADGE_JANKEN_RATE_MIN} かつ 試合数 >= ${BADGE_JANKEN_GAMES_MIN} で付与される`, () => {
      const ctx = makeCtx({
        memberSummaries: [
          {
            ...emptySummary('a'),
            jankenWinRate: BADGE_JANKEN_RATE_MIN,
            jankenParticipationCount: BADGE_JANKEN_GAMES_MIN,
          },
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'janken-god')).toBeDefined()
    })

    test('試合数が不足する場合は付与されない (勝率は十分でも)', () => {
      const ctx = makeCtx({
        memberSummaries: [
          {
            ...emptySummary('a'),
            jankenWinRate: 1.0,
            jankenParticipationCount: BADGE_JANKEN_GAMES_MIN - 1,
          },
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'janken-god')).toBeUndefined()
    })

    test('勝率が不足する場合は付与されない (試合数は十分でも)', () => {
      const ctx = makeCtx({
        memberSummaries: [
          {
            ...emptySummary('a'),
            jankenWinRate: 0.69,
            jankenParticipationCount: 20,
          },
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'janken-god')).toBeUndefined()
    })

    test('jankenWinRate が null (じゃんけん未参加) では付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [
          {
            ...emptySummary('a'),
            jankenWinRate: null,
            jankenParticipationCount: 20,
          },
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'janken-god')).toBeUndefined()
    })
  })

  describe('複合シナリオ', () => {
    test('1 人のメンバーが複数の称号を保有できる', () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: 6 }],
        memberSummaries: [
          {
            memberId: 'a',
            payerCount: 10,
            actualPaid: 500_000,
            averagePaymentAmount: 50_000,
            clutchCount: 7,
            jankenWinRate: 0.8,
            jankenParticipationCount: 15,
          },
          {
            memberId: 'b',
            payerCount: 5,
            actualPaid: 100_000,
            averagePaymentAmount: 20_000,
            clutchCount: 1,
            jankenWinRate: 0.3,
            jankenParticipationCount: 15,
          },
        ],
      })

      const badges = computeBadges('a', ctx)
      const kinds = badges.map((b) => b.kind)
      // a は全 5 称号を獲得できる
      expect(kinds).toContain('mvp')
      expect(kinds).toContain('clutch-master')
      expect(kinds).toContain('streak-king')
      expect(kinds).toContain('generosity-emperor')
      expect(kinds).toContain('janken-god')
      expect(badges).toHaveLength(5)
    })

    test('返り値は BADGE_PRIORITY 順にソートされている', () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: 10 }],
        memberSummaries: [
          {
            memberId: 'a',
            payerCount: 5,
            actualPaid: 100,
            averagePaymentAmount: 10_000,
            clutchCount: 10,
            jankenWinRate: 1.0,
            jankenParticipationCount: 20,
          },
        ],
      })
      const kinds = computeBadges('a', ctx).map((b) => b.kind)
      expect(kinds).toEqual([
        'mvp',
        'streak-king',
        'clutch-master',
        'generosity-emperor',
        'janken-god',
      ])
    })

    test('何の条件も満たさないメンバーは空配列', () => {
      const ctx = makeCtx({
        memberSummaries: [summaryWithPaid('a', 10), emptySummary('b')],
      })
      expect(computeBadges('b', ctx)).toEqual([])
    })
  })
})

describe('topBadge', () => {
  test('空配列の場合 null を返す', () => {
    expect(topBadge([])).toBeNull()
  })

  test('優先度順に 1 つ目を返す (MVP > streak-king)', () => {
    const ctx = makeCtx({
      streaks: [{ id: 'a', maxStreak: 10 }],
      memberSummaries: [summaryWithPaid('a', 100)],
    })
    const badges = computeBadges('a', ctx)
    expect(topBadge(badges)?.kind).toBe('mvp')
  })

  test('MVP が無ければ streak-king を返す', () => {
    const ctx = makeCtx({
      streaks: [{ id: 'a', maxStreak: 10 }],
      memberSummaries: [
        {
          memberId: 'a',
          payerCount: 5,
          actualPaid: 0,
          averagePaymentAmount: 10_000,
          clutchCount: 10,
          jankenWinRate: null,
          jankenParticipationCount: 0,
        },
      ],
    })
    const badges = computeBadges('a', ctx)
    expect(topBadge(badges)?.kind).toBe('streak-king')
  })

  test('clutch のみでも返る', () => {
    const ctx = makeCtx({
      memberSummaries: [
        {
          memberId: 'a',
          payerCount: 0,
          actualPaid: 0,
          averagePaymentAmount: 0,
          clutchCount: 5,
          jankenWinRate: null,
          jankenParticipationCount: 0,
        },
      ],
    })
    const badges = computeBadges('a', ctx)
    expect(topBadge(badges)?.kind).toBe('clutch-master')
  })
})
