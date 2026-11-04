/**
 * lib/otokogi-badges.ts のテスト
 * - Issue #368 Phase 3: 称号・バッジシステム導入
 * - Issue #393: MVP を actualPaid ベースに変更 + 男気量産王 (count-king) 追加
 * - Issue #396: 裏男気王 (shadow-otokogi-king) 追加 / FY プレフィックス統一 / 連勝王 改名
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
  type BadgeMemberSummary,
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

function emptySummary(memberId: string): BadgeMemberSummary {
  return {
    memberId,
    payerCount: 0,
    actualPaid: 0,
    otokogiAmount: 0,
    averagePaymentAmount: 0,
    clutchCount: 0,
    jankenWinRate: null,
    jankenParticipationCount: 0,
  }
}

function summary(memberId: string, overrides: Partial<BadgeMemberSummary>): BadgeMemberSummary {
  return { ...emptySummary(memberId), ...overrides }
}

describe('computeBadges', () => {
  describe('💎 MVP (actualPaid 支払総額 1 位 / Issue #393)', () => {
    test('actualPaid 1 位のメンバーに MVP が付与される', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 3, actualPaid: 100_000 }),
          summary('b', { payerCount: 5, actualPaid: 50_000 }),
        ],
      })
      const badges = computeBadges('a', ctx)
      const mvp = badges.find((b) => b.kind === 'mvp')
      expect(mvp).toBeDefined()
      expect(mvp?.id).toBe('mvp-FY26')
      expect(mvp?.label).toBe('FY26 MVP')
      expect(mvp?.icon).toBe('💎')
    })

    test('2 位以下のメンバーには MVP は付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 3, actualPaid: 100_000 }),
          summary('b', { payerCount: 5, actualPaid: 50_000 }),
        ],
      })
      const badges = computeBadges('b', ctx)
      expect(badges.find((b) => b.kind === 'mvp')).toBeUndefined()
    })

    test('actualPaid が 0 円しかない期間では MVP は付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [emptySummary('a'), emptySummary('b')],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'mvp')).toBeUndefined()
    })

    test('memberSummaries が空の場合は付与されない', () => {
      const ctx = makeCtx({})
      expect(computeBadges('a', ctx).find((b) => b.kind === 'mvp')).toBeUndefined()
    })

    test('periodLabel がラベル・ID に埋め込まれる', () => {
      const ctx = makeCtx({
        periodLabel: 'FY25',
        memberSummaries: [summary('a', { payerCount: 1, actualPaid: 10 })],
      })
      const mvp = computeBadges('a', ctx).find((b) => b.kind === 'mvp')
      expect(mvp?.id).toBe('mvp-FY25')
      expect(mvp?.label).toBe('FY25 MVP')
    })

    test('Issue #393 回帰防止: actualPaid 1 位と otokogiAmount (超過) 1 位が別人でも actualPaid 側が MVP', () => {
      // a: 10 回参加して多く払ったが平均化されると fair share 近辺
      // b: 1 回しか参加しておらず超過額は大きいが actualPaid は a より少ない
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 10, actualPaid: 300_000 }),
          summary('b', { payerCount: 1, actualPaid: 100_000 }),
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'mvp')).toBeDefined()
      expect(computeBadges('b', ctx).find((b) => b.kind === 'mvp')).toBeUndefined()
    })
  })

  describe('🏆 裏男気王 (フェアシェア超過分 1 位 / Issue #396)', () => {
    test('otokogiAmount 1 位のメンバーに付与される', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 3, actualPaid: 200_000, otokogiAmount: 80_000 }),
          summary('b', { payerCount: 5, actualPaid: 300_000, otokogiAmount: 30_000 }),
        ],
      })
      const badges = computeBadges('a', ctx)
      const hidden = badges.find((b) => b.kind === 'shadow-otokogi-king')
      expect(hidden).toBeDefined()
      expect(hidden?.id).toBe('shadow-otokogi-king-FY26')
      expect(hidden?.label).toBe('FY26 裏男気王')
      expect(hidden?.icon).toBe('🏆')
      expect(hidden?.description).toContain('80,000')
    })

    test('2 位以下のメンバーには付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { otokogiAmount: 80_000 }),
          summary('b', { otokogiAmount: 30_000 }),
        ],
      })
      expect(computeBadges('b', ctx).find((b) => b.kind === 'shadow-otokogi-king')).toBeUndefined()
    })

    test('otokogiAmount <= 0 (全員フェアシェア以下) の場合は付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { otokogiAmount: -10_000 }),
          summary('b', { otokogiAmount: 0 }),
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'shadow-otokogi-king')).toBeUndefined()
      expect(computeBadges('b', ctx).find((b) => b.kind === 'shadow-otokogi-king')).toBeUndefined()
    })

    test('MVP と 裏男気王 は独立 (別人になりうる)', () => {
      // a: 多数会に参加して薄く広く多く払った → actualPaid 1 位 (MVP)
      // b: 少数会で突出して引き受け → otokogiAmount 1 位 (裏男気王)
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 10, actualPaid: 500_000, otokogiAmount: 50_000 }),
          summary('b', { payerCount: 2, actualPaid: 200_000, otokogiAmount: 150_000 }),
        ],
      })
      const aBadges = computeBadges('a', ctx)
      const bBadges = computeBadges('b', ctx)
      expect(aBadges.find((x) => x.kind === 'mvp')).toBeDefined()
      expect(aBadges.find((x) => x.kind === 'shadow-otokogi-king')).toBeUndefined()
      expect(bBadges.find((x) => x.kind === 'shadow-otokogi-king')).toBeDefined()
      expect(bBadges.find((x) => x.kind === 'mvp')).toBeUndefined()
    })
  })

  describe('⚡ 量産王 (payerCount 1 位 / Issue #393)', () => {
    test('payerCount 1 位のメンバーに付与される', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 30, actualPaid: 300_000 }),
          summary('b', { payerCount: 3, actualPaid: 300_000 }),
        ],
      })
      const badges = computeBadges('a', ctx)
      const countKing = badges.find((b) => b.kind === 'count-king')
      expect(countKing).toBeDefined()
      expect(countKing?.id).toBe('count-king-FY26')
      expect(countKing?.label).toBe('FY26 量産王')
      expect(countKing?.icon).toBe('⚡')
      expect(countKing?.description).toContain('30 回')
    })

    test('2 位以下のメンバーには付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 30 }),
          summary('b', { payerCount: 3 }),
        ],
      })
      expect(computeBadges('b', ctx).find((b) => b.kind === 'count-king')).toBeUndefined()
    })

    test('payerCount が全員 0 の場合は付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [emptySummary('a'), emptySummary('b')],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'count-king')).toBeUndefined()
    })

    test('MVP と 量産王 が別人になるケース (回数王 vs 総額王)', () => {
      // a: 少数の大きい男気 → 総額 1 位 (MVP)
      // b: 多数の小さい男気 → 回数 1 位 (count-king)
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 3, actualPaid: 300_000 }),
          summary('b', { payerCount: 30, actualPaid: 299_999 }),
        ],
      })
      const aBadges = computeBadges('a', ctx)
      const bBadges = computeBadges('b', ctx)
      expect(aBadges.find((x) => x.kind === 'mvp')).toBeDefined()
      expect(aBadges.find((x) => x.kind === 'count-king')).toBeUndefined()
      expect(bBadges.find((x) => x.kind === 'mvp')).toBeUndefined()
      expect(bBadges.find((x) => x.kind === 'count-king')).toBeDefined()
    })
  })

  describe('💪 クラッチマスター (CLUTCH 5 回以上)', () => {
    test(`clutchCount >= ${BADGE_CLUTCH_MIN} で付与される`, () => {
      const ctx = makeCtx({
        memberSummaries: [summary('a', { clutchCount: BADGE_CLUTCH_MIN })],
      })
      const badge = computeBadges('a', ctx).find((b) => b.kind === 'clutch-master')
      expect(badge).toBeDefined()
      expect(badge?.icon).toBe('💪')
    })

    test(`clutchCount < ${BADGE_CLUTCH_MIN} では付与されない`, () => {
      const ctx = makeCtx({
        memberSummaries: [summary('a', { clutchCount: BADGE_CLUTCH_MIN - 1 })],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'clutch-master')).toBeUndefined()
    })

    test('member-summary に存在しないメンバーには付与されない', () => {
      const ctx = makeCtx({ memberSummaries: [] })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'clutch-master')).toBeUndefined()
    })
  })

  describe('🔥 連勝王 (連続男気 5 回以上 / Issue #396 で改名)', () => {
    test(`maxStreak >= ${BADGE_STREAK_MIN} で付与される`, () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: BADGE_STREAK_MIN }],
      })
      const badge = computeBadges('a', ctx).find((b) => b.kind === 'streak-king')
      expect(badge).toBeDefined()
      expect(badge?.label).toContain(`${BADGE_STREAK_MIN}連勝`)
      expect(badge?.label).toContain('FY26 連勝王')
      expect(badge?.icon).toBe('🔥')
    })

    test(`maxStreak < ${BADGE_STREAK_MIN} では付与されない`, () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: BADGE_STREAK_MIN - 1 }],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'streak-king')).toBeUndefined()
    })

    test('ラベルに連勝数と期間が含まれる (7 連勝)', () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: 7 }],
      })
      const badge = computeBadges('a', ctx).find((b) => b.kind === 'streak-king')
      expect(badge?.label).toBe('FY26 連勝王 (7連勝)')
    })
  })

  describe('👑 気前度の帝王 (平均支払単価 1 位)', () => {
    test('平均支払単価が 1 位のメンバーに付与される', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 10, averagePaymentAmount: 30_000 }),
          summary('b', { payerCount: 5, averagePaymentAmount: 60_000 }),
        ],
      })
      const bBadge = computeBadges('b', ctx).find((b) => b.kind === 'generosity-emperor')
      expect(bBadge).toBeDefined()
      expect(bBadge?.label).toBe('FY26 気前度の帝王')
      expect(bBadge?.icon).toBe('👑')
      expect(computeBadges('a', ctx).find((b) => b.kind === 'generosity-emperor')).toBeUndefined()
    })

    test('payerCount が 0 のメンバーは候補から除外される', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 0, averagePaymentAmount: 100_000 }),
          summary('b', { payerCount: 3, averagePaymentAmount: 30_000 }),
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

  describe('✊ じゃんけん神 (勝率 70% 以上 かつ 10 試合以上)', () => {
    test(`勝率 >= ${BADGE_JANKEN_RATE_MIN} かつ 試合数 >= ${BADGE_JANKEN_GAMES_MIN} で付与される`, () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', {
            jankenWinRate: BADGE_JANKEN_RATE_MIN,
            jankenParticipationCount: BADGE_JANKEN_GAMES_MIN,
          }),
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'janken-god')).toBeDefined()
    })

    test('試合数が不足する場合は付与されない (勝率は十分でも)', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', {
            jankenWinRate: 1.0,
            jankenParticipationCount: BADGE_JANKEN_GAMES_MIN - 1,
          }),
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'janken-god')).toBeUndefined()
    })

    test('勝率が不足する場合は付与されない (試合数は十分でも)', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { jankenWinRate: 0.69, jankenParticipationCount: 20 }),
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'janken-god')).toBeUndefined()
    })

    test('jankenWinRate が null (じゃんけん未参加) では付与されない', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { jankenWinRate: null, jankenParticipationCount: 20 }),
        ],
      })
      expect(computeBadges('a', ctx).find((b) => b.kind === 'janken-god')).toBeUndefined()
    })
  })

  describe('複合シナリオ', () => {
    test('1 人のメンバーが全称号を保有できる (全 7 称号)', () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: 6 }],
        memberSummaries: [
          summary('a', {
            payerCount: 10,
            actualPaid: 500_000,
            otokogiAmount: 200_000,
            averagePaymentAmount: 50_000,
            clutchCount: 7,
            jankenWinRate: 0.8,
            jankenParticipationCount: 15,
          }),
          summary('b', {
            payerCount: 5,
            actualPaid: 100_000,
            otokogiAmount: 30_000,
            averagePaymentAmount: 20_000,
            clutchCount: 1,
            jankenWinRate: 0.3,
            jankenParticipationCount: 15,
          }),
        ],
      })

      const badges = computeBadges('a', ctx)
      const kinds = badges.map((b) => b.kind)
      expect(kinds).toContain('mvp')
      expect(kinds).toContain('shadow-otokogi-king')
      expect(kinds).toContain('count-king')
      expect(kinds).toContain('streak-king')
      expect(kinds).toContain('generosity-emperor')
      expect(kinds).toContain('clutch-master')
      expect(kinds).toContain('janken-god')
      expect(badges).toHaveLength(7)
    })

    test('返り値は BADGE_PRIORITY 順にソートされている', () => {
      const ctx = makeCtx({
        streaks: [{ id: 'a', maxStreak: 10 }],
        memberSummaries: [
          summary('a', {
            payerCount: 5,
            actualPaid: 100,
            otokogiAmount: 50,
            averagePaymentAmount: 10_000,
            clutchCount: 10,
            jankenWinRate: 1.0,
            jankenParticipationCount: 20,
          }),
        ],
      })
      const kinds = computeBadges('a', ctx).map((b) => b.kind)
      expect(kinds).toEqual([
        'mvp',
        'shadow-otokogi-king',
        'count-king',
        'streak-king',
        'generosity-emperor',
        'clutch-master',
        'janken-god',
      ])
    })

    test('何の条件も満たさないメンバーは空配列', () => {
      const ctx = makeCtx({
        memberSummaries: [
          summary('a', { payerCount: 1, actualPaid: 10, otokogiAmount: 5 }),
          emptySummary('b'),
        ],
      })
      expect(computeBadges('b', ctx)).toEqual([])
    })
  })
})

describe('topBadge', () => {
  test('空配列の場合 null を返す', () => {
    expect(topBadge([])).toBeNull()
  })

  test('優先度順に 1 つ目を返す (MVP > shadow-otokogi-king > streak-king)', () => {
    const ctx = makeCtx({
      streaks: [{ id: 'a', maxStreak: 10 }],
      memberSummaries: [summary('a', { payerCount: 1, actualPaid: 100, otokogiAmount: 50 })],
    })
    const badges = computeBadges('a', ctx)
    expect(topBadge(badges)?.kind).toBe('mvp')
  })

  test('MVP が無く shadow-otokogi-king がある場合は shadow-otokogi-king が top', () => {
    // a: 単発で超過大 (shadow-otokogi-king)、b: actualPaid 最大 (MVP)
    const ctx = makeCtx({
      streaks: [{ id: 'a', maxStreak: 10 }],
      memberSummaries: [
        summary('a', { payerCount: 1, actualPaid: 100_000, otokogiAmount: 90_000 }),
        summary('b', { payerCount: 10, actualPaid: 500_000, otokogiAmount: 10_000 }),
      ],
    })
    const badges = computeBadges('a', ctx)
    expect(topBadge(badges)?.kind).toBe('shadow-otokogi-king')
  })

  test('clutch のみでも返る', () => {
    const ctx = makeCtx({
      memberSummaries: [summary('a', { clutchCount: 5 })],
    })
    const badges = computeBadges('a', ctx)
    expect(topBadge(badges)?.kind).toBe('clutch-master')
  })
})
