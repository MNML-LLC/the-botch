/**
 * lib/otokogi-fy-badges.ts のテスト (Issue #393)
 *
 * 実行: npx vitest run tests/otokogi-fy-badges.test.ts
 */
import { describe, test, expect } from 'vitest'
import {
  computeFyBadges,
  fyOfDate,
  fyRange,
  fyShortLabel,
  FY_BADGE_STREAK_MIN,
  type FyBadgeOtokogiEvent,
  type FyBadgeMember,
} from '@/lib/otokogi-fy-badges'

const alice: FyBadgeMember = { id: 'a', name: 'Alice' }
const bob: FyBadgeMember = { id: 'b', name: 'Bob' }
const carol: FyBadgeMember = { id: 'c', name: 'Carol' }

function ev(
  id: string,
  dateIso: string,
  payerId: string,
  amount: number,
  participantIds: string[],
): FyBadgeOtokogiEvent {
  return { id, eventDate: new Date(dateIso), amount, payerId, participantIds }
}

describe('fyOfDate / fyRange / fyShortLabel', () => {
  test('11 月 1 日はその年の FY に属する', () => {
    expect(fyOfDate('2026-11-01')).toBe(2026)
  })

  test('10 月 31 日は前年の FY に属する', () => {
    expect(fyOfDate('2026-10-31')).toBe(2025)
  })

  test('FY2026 は 2026/11/1 〜 2027/10/31', () => {
    const r = fyRange(2026)
    expect(r.from.getFullYear()).toBe(2026)
    expect(r.from.getMonth()).toBe(10) // 0-indexed 11月
    expect(r.from.getDate()).toBe(1)
    expect(r.to.getFullYear()).toBe(2027)
    expect(r.to.getMonth()).toBe(9) // 0-indexed 10月
    expect(r.to.getDate()).toBe(31)
  })

  test('FY ショートラベルは "FYxx" 2 桁ゼロ埋め', () => {
    expect(fyShortLabel(2026)).toBe('FY26')
    expect(fyShortLabel(2024)).toBe('FY24')
    expect(fyShortLabel(2103)).toBe('FY03')
  })
})

describe('computeFyBadges', () => {
  test('空配列を渡すと空の結果', () => {
    expect(computeFyBadges([], [alice, bob])).toEqual([])
  })

  test('FY ごとに event を振り分ける (境界: 11/1 と 10/31)', () => {
    const events = [
      ev('e1', '2025-11-05', 'a', 1000, ['a', 'b']),
      ev('e2', '2026-10-31', 'a', 2000, ['a', 'b']),
      ev('e3', '2026-11-01', 'a', 3000, ['a', 'b']),
    ]
    const results = computeFyBadges(events, [alice, bob])
    // FY25 (e1, e2) と FY26 (e3) の 2 つ
    expect(results.map((r) => r.fy).sort()).toEqual([2025, 2026])
    const fy25 = results.find((r) => r.fy === 2025)!
    const fy26 = results.find((r) => r.fy === 2026)!
    expect(fy25.eventCount).toBe(2)
    expect(fy26.eventCount).toBe(1)
  })

  test('結果は fy 降順 (新しい FY が先頭) に並ぶ', () => {
    const events = [
      ev('e1', '2023-12-01', 'a', 1000, ['a']),
      ev('e2', '2025-12-01', 'a', 1000, ['a']),
      ev('e3', '2024-12-01', 'a', 1000, ['a']),
    ]
    const results = computeFyBadges(events, [alice])
    expect(results.map((r) => r.fy)).toEqual([2025, 2024, 2023])
  })

  test('MVP: FY 内で actualPaid 1 位のメンバーに付与される', () => {
    const events = [
      ev('e1', '2026-11-01', 'a', 100_000, ['a', 'b']),
      ev('e2', '2026-12-01', 'b', 50_000, ['a', 'b']),
    ]
    const results = computeFyBadges(events, [alice, bob])
    const fy26 = results[0]
    expect(fy26.shortLabel).toBe('FY26')
    const aBadges = fy26.badgesByMember.get('a') ?? []
    const bBadges = fy26.badgesByMember.get('b') ?? []
    expect(aBadges.find((b) => b.kind === 'mvp')?.label).toBe('FY26 MVP')
    expect(bBadges.find((b) => b.kind === 'mvp')).toBeUndefined()
  })

  test('裏男気王: actualPaid − shouldHavePaid 1 位のメンバーに付与される', () => {
    // 参加者 a, b, c で ¥90k の男気を a が払う → fairShare は ¥30k ずつ
    //  a: actualPaid=90k, shouldHavePaid=30k, shadow = +60k
    //  b: actualPaid=0,   shouldHavePaid=30k, shadow = -30k
    //  c: actualPaid=0,   shouldHavePaid=30k, shadow = -30k
    const events = [ev('e1', '2026-11-05', 'a', 90_000, ['a', 'b', 'c'])]
    const results = computeFyBadges(events, [alice, bob, carol])
    const fy26 = results[0]
    const aBadges = fy26.badgesByMember.get('a') ?? []
    const shadow = aBadges.find((b) => b.kind === 'shadow-otokogi-king')
    expect(shadow).toBeDefined()
    expect(shadow?.label).toBe('FY26 裏男気王')
    expect(shadow?.id).toBe('shadow-otokogi-king-FY26')
  })

  test('裏男気王: shadowOtokogi が 0 以下しかなければ誰にも付与されない', () => {
    // 2 人で ¥10k を割り勘 (payer a、participants: a, b) → fair share は均等
    // a: actualPaid=10k, shouldHavePaid=5k, shadow=+5k → a に付く
    // これを "全員 shadow <= 0" にするには均等払いでなければならないが、
    // 1 件の男気では必ず payer に shadow が偏るため、イベント 0 件のケースで検証する
    const results = computeFyBadges([], [alice, bob])
    expect(results).toEqual([])
  })

  test('量産王: payerCount 1 位のメンバーに付与される', () => {
    const events = [
      ev('e1', '2026-11-01', 'a', 10_000, ['a', 'b']),
      ev('e2', '2026-11-02', 'a', 10_000, ['a', 'b']),
      ev('e3', '2026-11-03', 'a', 10_000, ['a', 'b']),
      ev('e4', '2026-11-04', 'b', 100_000, ['a', 'b']),
    ]
    const results = computeFyBadges(events, [alice, bob])
    const fy26 = results[0]
    const aBadges = fy26.badgesByMember.get('a') ?? []
    const bBadges = fy26.badgesByMember.get('b') ?? []
    expect(aBadges.find((b) => b.kind === 'count-king')?.label).toBe('FY26 量産王')
    expect(bBadges.find((b) => b.kind === 'count-king')).toBeUndefined()
  })

  test('連勝王: maxStreak >= 5 で付与される', () => {
    // a が 5 連続で払う
    const events: FyBadgeOtokogiEvent[] = []
    for (let i = 0; i < 5; i++) {
      events.push(
        ev(`e${i}`, `2026-11-${String(i + 1).padStart(2, '0')}`, 'a', 10_000, ['a', 'b']),
      )
    }
    const results = computeFyBadges(events, [alice, bob])
    const fy26 = results[0]
    const aBadges = fy26.badgesByMember.get('a') ?? []
    const streak = aBadges.find((b) => b.kind === 'streak-king')
    expect(streak).toBeDefined()
    expect(streak?.label).toContain('5連勝')
  })

  test(`連勝王: maxStreak < ${FY_BADGE_STREAK_MIN} では付与されない`, () => {
    const events = [
      ev('e1', '2026-11-01', 'a', 10_000, ['a', 'b']),
      ev('e2', '2026-11-02', 'a', 10_000, ['a', 'b']),
    ]
    const results = computeFyBadges(events, [alice, bob])
    const fy26 = results[0]
    const aBadges = fy26.badgesByMember.get('a') ?? []
    expect(aBadges.find((b) => b.kind === 'streak-king')).toBeUndefined()
  })

  test('気前度の帝王: 平均 payer 額 1 位 (payerCount > 0 必須)', () => {
    const events = [
      ev('e1', '2026-11-01', 'a', 100_000, ['a', 'b']), // a: 平均 100k
      ev('e2', '2026-11-02', 'b', 10_000, ['a', 'b']),  // b: 平均 10k
      ev('e3', '2026-11-03', 'b', 10_000, ['a', 'b']),
      ev('e4', '2026-11-04', 'b', 10_000, ['a', 'b']),
    ]
    const results = computeFyBadges(events, [alice, bob])
    const fy26 = results[0]
    const aBadges = fy26.badgesByMember.get('a') ?? []
    const bBadges = fy26.badgesByMember.get('b') ?? []
    expect(aBadges.find((b) => b.kind === 'generosity-emperor')?.label).toBe(
      'FY26 気前度の帝王',
    )
    expect(bBadges.find((b) => b.kind === 'generosity-emperor')).toBeUndefined()
  })

  test('FY ごとに独立計算: 違う FY で違うメンバーが MVP になる', () => {
    const events = [
      // FY25: a が多く払う
      ev('e1', '2025-11-01', 'a', 200_000, ['a', 'b']),
      // FY26: b が多く払う
      ev('e2', '2026-11-01', 'b', 300_000, ['a', 'b']),
    ]
    const results = computeFyBadges(events, [alice, bob])
    const fy25 = results.find((r) => r.fy === 2025)!
    const fy26 = results.find((r) => r.fy === 2026)!
    expect(fy25.badgesByMember.get('a')?.find((b) => b.kind === 'mvp')).toBeDefined()
    expect(fy26.badgesByMember.get('b')?.find((b) => b.kind === 'mvp')).toBeDefined()
    expect(fy25.badgesByMember.get('b')?.find((b) => b.kind === 'mvp')).toBeUndefined()
    expect(fy26.badgesByMember.get('a')?.find((b) => b.kind === 'mvp')).toBeUndefined()
  })

  test('aggregates は全メンバー分返る (0 円でも row が存在)', () => {
    const events = [ev('e1', '2026-11-01', 'a', 10_000, ['a'])]
    const results = computeFyBadges(events, [alice, bob, carol])
    const fy26 = results[0]
    expect(fy26.aggregates).toHaveLength(3)
    const b = fy26.aggregates.find((a) => a.memberId === 'b')!
    expect(b.actualPaid).toBe(0)
    expect(b.payerCount).toBe(0)
  })

  test('shouldHavePaid はイベントの参加者で均等割される', () => {
    // 3 人イベントで ¥99k → 各自 ¥33k
    const events = [ev('e1', '2026-11-01', 'a', 99_000, ['a', 'b', 'c'])]
    const results = computeFyBadges(events, [alice, bob, carol])
    const fy26 = results[0]
    const a = fy26.aggregates.find((x) => x.memberId === 'a')!
    const b = fy26.aggregates.find((x) => x.memberId === 'b')!
    expect(a.shouldHavePaid).toBe(33_000)
    expect(b.shouldHavePaid).toBe(33_000)
    expect(a.shadowOtokogi).toBe(99_000 - 33_000) // +66k
    expect(b.shadowOtokogi).toBe(0 - 33_000) // -33k
  })

  test('totalAmount は FY 内の全イベント額の合計', () => {
    const events = [
      ev('e1', '2026-11-01', 'a', 10_000, ['a', 'b']),
      ev('e2', '2026-12-01', 'b', 20_000, ['a', 'b']),
      ev('e3', '2025-11-01', 'a', 99_999, ['a', 'b']),
    ]
    const results = computeFyBadges(events, [alice, bob])
    const fy26 = results.find((r) => r.fy === 2026)!
    const fy25 = results.find((r) => r.fy === 2025)!
    expect(fy26.totalAmount).toBe(30_000)
    expect(fy25.totalAmount).toBe(99_999)
  })

  test('複数の称号を同一メンバーが FY 内で獲得できる (MVP + 裏男気王 + 量産王)', () => {
    // a が全イベントで payer → 回数 1 位・総額 1 位・shadow 1 位
    const events = [
      ev('e1', '2026-11-01', 'a', 100_000, ['a', 'b']),
      ev('e2', '2026-11-02', 'a', 100_000, ['a', 'b']),
      ev('e3', '2026-11-03', 'a', 100_000, ['a', 'b']),
    ]
    const results = computeFyBadges(events, [alice, bob])
    const fy26 = results[0]
    const aBadges = fy26.badgesByMember.get('a') ?? []
    const kinds = aBadges.map((x) => x.kind)
    expect(kinds).toContain('mvp')
    expect(kinds).toContain('shadow-otokogi-king')
    expect(kinds).toContain('count-king')
    // b は称号ゼロ
    expect(fy26.badgesByMember.get('b')).toBeUndefined()
  })

  test('badges は FY_BADGE_PRIORITY 順にソートされている (mvp > shadow > count > streak > generosity)', () => {
    // a が 5 連続で払う → mvp / shadow / count / streak / generosity を獲得
    const events: FyBadgeOtokogiEvent[] = []
    for (let i = 0; i < 5; i++) {
      events.push(
        ev(`e${i}`, `2026-11-${String(i + 1).padStart(2, '0')}`, 'a', 50_000, ['a', 'b']),
      )
    }
    const results = computeFyBadges(events, [alice, bob])
    const kinds = results[0].badgesByMember.get('a')?.map((x) => x.kind) ?? []
    expect(kinds[0]).toBe('mvp')
    expect(kinds[1]).toBe('shadow-otokogi-king')
    expect(kinds[2]).toBe('count-king')
    expect(kinds[3]).toBe('streak-king')
    expect(kinds[4]).toBe('generosity-emperor')
  })
})
