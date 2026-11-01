/**
 * lib/otokogi-ranking.ts の単体テスト
 *
 * computeRanking の 4 指標計算と、ソート順・ゼロ除算処理・ストリーク（最長/現在）
 * を DB 不要の pure 関数として検証する。
 * 実行: npx vitest run tests/otokogi-ranking.test.ts
 */
import { describe, test, expect } from 'vitest'
import {
  computeRanking,
  fiscalYearRange,
  isRankingMetric,
  type MemberBase,
  type OtokogiEventInput,
} from '@/lib/otokogi-ranking'

const CLUTCH = 50000

function member(id: string, name: string = id): MemberBase {
  return {
    id,
    name,
    initial: name.charAt(0).toUpperCase(),
    colorBg: 'bg-gray-100',
    colorText: 'text-gray-700',
  }
}

function event(
  id: string,
  date: string,
  payerId: string,
  amount: number,
  participantIds: string[]
): OtokogiEventInput {
  return { id, eventDate: new Date(date), payerId, amount, participantIds }
}

describe('isRankingMetric', () => {
  test('有効な metric を受け入れる', () => {
    expect(isRankingMetric('total')).toBe(true)
    expect(isRankingMetric('rate')).toBe(true)
    expect(isRankingMetric('clutch')).toBe(true)
    expect(isRankingMetric('streak')).toBe(true)
    expect(isRankingMetric('generosity')).toBe(true)
  })

  test('無効な値を拒否する', () => {
    expect(isRankingMetric('foo')).toBe(false)
    expect(isRankingMetric(null)).toBe(false)
    expect(isRankingMetric(undefined)).toBe(false)
    expect(isRankingMetric('')).toBe(false)
  })
})

describe('fiscalYearRange', () => {
  test('2026 年度 = 2025-11-01 〜 2026-10-31', () => {
    const { from, to } = fiscalYearRange(2026)
    expect(from.toISOString()).toBe('2025-11-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-10-31T23:59:59.999Z')
  })
})

describe('computeRanking - 男気率 (otokogi_rate)', () => {
  test('払った額 ÷ 参加した会の総額', () => {
    const members = [member('a'), member('b')]
    const events = [
      event('e1', '2026-01-01', 'a', 1000, ['a', 'b']), // a 払 / a,b 参加
      event('e2', '2026-01-02', 'b', 3000, ['a', 'b']), // b 払 / a,b 参加
    ]
    const result = computeRanking(members, events, { metric: 'rate', clutchThreshold: CLUTCH })
    const a = result.find((r) => r.memberId === 'a')!
    const b = result.find((r) => r.memberId === 'b')!

    // a: 参加 4000, 払った 1000 → 25%
    expect(a.participatedTotal).toBe(4000)
    expect(a.totalPaid).toBe(1000)
    expect(a.otokogiRate).toBeCloseTo(0.25)

    // b: 参加 4000, 払った 3000 → 75%
    expect(b.otokogiRate).toBeCloseTo(0.75)

    // rate 順ソート: b が 1 位
    expect(result[0].memberId).toBe('b')
    expect(result[0].rank).toBe(1)
  })

  test('参加 0 回のメンバーは除外される', () => {
    const members = [member('a'), member('ghost')]
    const events = [event('e1', '2026-01-01', 'a', 1000, ['a'])]
    const result = computeRanking(members, events, { metric: 'rate', clutchThreshold: CLUTCH })

    expect(result).toHaveLength(1)
    expect(result[0].memberId).toBe('a')
  })

  test('参加あり・払いなし → rate = 0, null にならない', () => {
    const members = [member('a'), member('b')]
    const events = [event('e1', '2026-01-01', 'a', 2000, ['a', 'b'])]
    const result = computeRanking(members, events, { metric: 'rate', clutchThreshold: CLUTCH })
    const b = result.find((r) => r.memberId === 'b')!
    expect(b.otokogiRate).toBe(0)
  })
})

describe('computeRanking - クラッチ力 (clutch_rate)', () => {
  test('高額イベント (>= 50000) 限定で払った率を算出', () => {
    const members = [member('a'), member('b')]
    const events = [
      event('e1', '2026-01-01', 'a', 60000, ['a', 'b']), // clutch
      event('e2', '2026-01-02', 'a', 80000, ['a', 'b']), // clutch
      event('e3', '2026-01-03', 'b', 55000, ['a', 'b']), // clutch
      event('e4', '2026-01-04', 'a', 15000, ['a', 'b']), // 対象外（10000-49999 の男気はクラッチ外）
    ]
    const result = computeRanking(members, events, { metric: 'clutch', clutchThreshold: CLUTCH })
    const a = result.find((r) => r.memberId === 'a')!
    const b = result.find((r) => r.memberId === 'b')!

    expect(a.clutchParticipatedCount).toBe(3)
    expect(a.clutchPaidCount).toBe(2)
    expect(a.clutchRate).toBeCloseTo(2 / 3)

    expect(b.clutchParticipatedCount).toBe(3)
    expect(b.clutchPaidCount).toBe(1)
    expect(b.clutchRate).toBeCloseTo(1 / 3)

    expect(result[0].memberId).toBe('a') // clutch 順
  })

  test('高額イベントに参加していない → clutchRate は null', () => {
    const members = [member('a'), member('b')]
    const events = [
      event('e1', '2026-01-01', 'a', 15000, ['a']), // b は参加なし / 非クラッチ
      event('e2', '2026-01-02', 'a', 80000, ['a']), // b は参加なし
    ]
    const result = computeRanking(members, events, { metric: 'clutch', clutchThreshold: CLUTCH })
    const b = result.find((r) => r.memberId === 'b')
    expect(b).toBeUndefined() // 参加 0 のため除外
  })

  test('閾値ちょうど (= 50000) はクラッチ扱い', () => {
    const members = [member('a')]
    const events = [event('e1', '2026-01-01', 'a', 50000, ['a'])]
    const result = computeRanking(members, events, { metric: 'clutch', clutchThreshold: CLUTCH })
    expect(result[0].clutchParticipatedCount).toBe(1)
    expect(result[0].clutchPaidCount).toBe(1)
  })

  test('10000〜49999 の男気は clutch にカウントされない', () => {
    const members = [member('a'), member('b')]
    const events = [
      event('e1', '2026-01-01', 'a', 10000, ['a', 'b']), // 男気成立しているが非クラッチ
      event('e2', '2026-01-02', 'a', 25000, ['a', 'b']), // 非クラッチ
      event('e3', '2026-01-03', 'b', 49999, ['a', 'b']), // 境界: 50000 未満は非クラッチ
    ]
    const result = computeRanking(members, events, { metric: 'clutch', clutchThreshold: CLUTCH })
    const a = result.find((r) => r.memberId === 'a')!
    const b = result.find((r) => r.memberId === 'b')!
    // 誰もクラッチイベントに参加していない
    expect(a.clutchParticipatedCount).toBe(0)
    expect(a.clutchPaidCount).toBe(0)
    expect(a.clutchRate).toBeNull()
    expect(b.clutchParticipatedCount).toBe(0)
    expect(b.clutchPaidCount).toBe(0)
    expect(b.clutchRate).toBeNull()
    // ただし total/count には反映される
    expect(a.count).toBe(2)
    expect(a.totalPaid).toBe(35000)
    expect(b.count).toBe(1)
    expect(b.totalPaid).toBe(49999)
  })
})

describe('computeRanking - ストリーク (streak)', () => {
  test('同じ人が連続で払った最長回数を集計', () => {
    const members = [member('a'), member('b')]
    const events = [
      event('e1', '2026-01-01', 'a', 1000, ['a', 'b']),
      event('e2', '2026-01-02', 'a', 1000, ['a', 'b']),
      event('e3', '2026-01-03', 'a', 1000, ['a', 'b']), // a が 3 連続
      event('e4', '2026-01-04', 'b', 1000, ['a', 'b']),
      event('e5', '2026-01-05', 'a', 1000, ['a', 'b']), // ここからまた a
      event('e6', '2026-01-06', 'a', 1000, ['a', 'b']), // a 現在 2 連続
    ]
    const result = computeRanking(members, events, { metric: 'streak', clutchThreshold: CLUTCH })
    const a = result.find((r) => r.memberId === 'a')!
    const b = result.find((r) => r.memberId === 'b')!

    expect(a.maxStreak).toBe(3)
    expect(a.currentStreak).toBe(2) // 末尾の 2 連続
    expect(b.maxStreak).toBe(1)
    expect(b.currentStreak).toBe(0) // 末尾の払い手ではない
  })

  test('同日のイベントは id 昇順で安定ソート', () => {
    const members = [member('a'), member('b')]
    const events = [
      // 入力順はバラバラだが、同日の id 昇順で (e1, e2, e3) として並ぶべき
      event('e3', '2026-01-01', 'b', 1000, ['a', 'b']),
      event('e1', '2026-01-01', 'a', 1000, ['a', 'b']),
      event('e2', '2026-01-01', 'a', 1000, ['a', 'b']),
    ]
    const result = computeRanking(members, events, { metric: 'streak', clutchThreshold: CLUTCH })
    const a = result.find((r) => r.memberId === 'a')!
    const b = result.find((r) => r.memberId === 'b')!
    // 並び: e1(a) e2(a) e3(b) → a が 2 連続、現在は b (1 連続)
    expect(a.maxStreak).toBe(2)
    expect(a.currentStreak).toBe(0)
    expect(b.maxStreak).toBe(1)
    expect(b.currentStreak).toBe(1)
  })

  test('イベント 0 件 → ストリーク 0', () => {
    const members = [member('a')]
    const result = computeRanking(members, [], { metric: 'streak', clutchThreshold: CLUTCH })
    expect(result).toHaveLength(0) // 参加 0 のため除外
  })
})

describe('computeRanking - 気前度 (generosity)', () => {
  test('1 回あたりの平均 payer 額', () => {
    const members = [member('a'), member('b')]
    const events = [
      event('e1', '2026-01-01', 'a', 10000, ['a']),
      event('e2', '2026-01-02', 'a', 20000, ['a']),
      event('e3', '2026-01-03', 'b', 5000, ['b']),
    ]
    const result = computeRanking(members, events, { metric: 'generosity', clutchThreshold: CLUTCH })
    const a = result.find((r) => r.memberId === 'a')!
    const b = result.find((r) => r.memberId === 'b')!

    expect(a.generosity).toBe(15000) // (10000 + 20000) / 2
    expect(b.generosity).toBe(5000)

    expect(result[0].memberId).toBe('a') // generosity 順
  })

  test('払った回数 0 → generosity は null', () => {
    const members = [member('a'), member('b')]
    const events = [event('e1', '2026-01-01', 'a', 1000, ['a', 'b'])]
    const result = computeRanking(members, events, { metric: 'generosity', clutchThreshold: CLUTCH })
    const b = result.find((r) => r.memberId === 'b')!
    expect(b.generosity).toBeNull()
  })
})

describe('computeRanking - ソート (metric 別)', () => {
  const members = [member('a', 'Alice'), member('b', 'Bob'), member('c', 'Carol')]
  const events = [
    event('e1', '2026-01-01', 'a', 1000, ['a', 'b', 'c']),
    event('e2', '2026-01-02', 'b', 50000, ['a', 'b', 'c']),
    event('e3', '2026-01-03', 'c', 2000, ['a', 'b', 'c']),
    event('e4', '2026-01-04', 'c', 2000, ['a', 'b', 'c']),
  ]

  test('total: 絶対額順', () => {
    const result = computeRanking(members, events, { metric: 'total', clutchThreshold: CLUTCH })
    expect(result.map((r) => r.memberId)).toEqual(['b', 'c', 'a'])
    expect(result[0].rank).toBe(1)
    expect(result[2].rank).toBe(3)
  })

  test('rate: 男気率順 (null は末尾)', () => {
    const result = computeRanking(members, events, { metric: 'rate', clutchThreshold: CLUTCH })
    // b: 50000 / 55000, c: 4000 / 55000, a: 1000 / 55000
    expect(result[0].memberId).toBe('b')
  })

  test('clutch: 高額率順', () => {
    const result = computeRanking(members, events, { metric: 'clutch', clutchThreshold: CLUTCH })
    // b が 1 回高額払い、他は 0
    expect(result[0].memberId).toBe('b')
  })

  test('streak: 連続回数順 (c が 2 連続)', () => {
    const result = computeRanking(members, events, { metric: 'streak', clutchThreshold: CLUTCH })
    expect(result[0].memberId).toBe('c')
    expect(result[0].maxStreak).toBe(2)
  })

  test('generosity: 平均額順', () => {
    const result = computeRanking(members, events, { metric: 'generosity', clutchThreshold: CLUTCH })
    expect(result[0].memberId).toBe('b') // 50000/回
  })

  test('同値は name 昇順で安定', () => {
    // 全員が同じ値になるケース: name 昇順
    const equalEvents = [
      event('e1', '2026-01-01', 'a', 1000, ['a']),
      event('e2', '2026-01-02', 'b', 1000, ['b']),
      event('e3', '2026-01-03', 'c', 1000, ['c']),
    ]
    const result = computeRanking(members, equalEvents, { metric: 'total', clutchThreshold: CLUTCH })
    expect(result.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Carol'])
  })
})

describe('computeRanking - amount 制限 (clutch 以外は全額対象)', () => {
  // CEO フィードバック: total / rate / streak / generosity は amount に関わらず全額カウント。
  // clutch のみが OTOKOGI_CLUTCH_THRESHOLD 以上に絞られる。
  test('1 万円未満の男気も total / rate / generosity に反映される', () => {
    const members = [member('a'), member('b')]
    const events = [
      event('e1', '2026-01-01', 'a', 500, ['a', 'b']), // 低額
      event('e2', '2026-01-02', 'a', 1500, ['a', 'b']), // 低額
      event('e3', '2026-01-03', 'b', 2000, ['a', 'b']), // 低額
    ]
    const result = computeRanking(members, events, { metric: 'total', clutchThreshold: CLUTCH })
    const a = result.find((r) => r.memberId === 'a')!
    const b = result.find((r) => r.memberId === 'b')!

    // total: 低額でも full amount カウント
    expect(a.totalPaid).toBe(2000)
    expect(b.totalPaid).toBe(2000)
    expect(a.count).toBe(2)
    expect(b.count).toBe(1)

    // rate: 低額でも分母・分子に加算
    expect(a.participatedTotal).toBe(4000)
    expect(a.otokogiRate).toBeCloseTo(2000 / 4000)

    // generosity: 低額でも平均に反映
    expect(a.generosity).toBe(1000) // (500 + 1500) / 2
    expect(b.generosity).toBe(2000)

    // clutch: 全イベントが閾値未満 → 全員 null
    expect(a.clutchRate).toBeNull()
    expect(b.clutchRate).toBeNull()
    expect(a.clutchParticipatedCount).toBe(0)
  })

  test('1 万円未満だけでも streak は普通にカウントされる', () => {
    const members = [member('a'), member('b')]
    const events = [
      event('e1', '2026-01-01', 'a', 300, ['a', 'b']),
      event('e2', '2026-01-02', 'a', 400, ['a', 'b']),
      event('e3', '2026-01-03', 'a', 500, ['a', 'b']), // a 3 連続（全部低額）
    ]
    const result = computeRanking(members, events, { metric: 'streak', clutchThreshold: CLUTCH })
    const a = result.find((r) => r.memberId === 'a')!
    expect(a.maxStreak).toBe(3)
    expect(a.currentStreak).toBe(3)
  })

  test('低額のみでも 1 位になり得る (clutch 以外)', () => {
    const members = [member('a', 'Alice'), member('b', 'Bob')]
    const events = [
      event('e1', '2026-01-01', 'a', 100, ['a', 'b']),
      event('e2', '2026-01-02', 'a', 200, ['a', 'b']),
      event('e3', '2026-01-03', 'a', 300, ['a', 'b']), // a: 600 円 payer
      event('e4', '2026-01-04', 'b', 50, ['a', 'b']), // b: 50 円 payer
    ]
    const totalResult = computeRanking(members, events, { metric: 'total', clutchThreshold: CLUTCH })
    expect(totalResult[0].memberId).toBe('a')
    expect(totalResult[0].totalPaid).toBe(600)
  })
})

describe('computeRanking - エッジケース', () => {
  test('event 0 件 → 空配列を返す', () => {
    const members = [member('a'), member('b')]
    const result = computeRanking(members, [], { metric: 'total', clutchThreshold: CLUTCH })
    expect(result).toEqual([])
  })

  test('未登録メンバー ID の participants は無視される', () => {
    const members = [member('a')]
    const events = [event('e1', '2026-01-01', 'a', 1000, ['a', 'ghost'])]
    const result = computeRanking(members, events, { metric: 'total', clutchThreshold: CLUTCH })
    expect(result).toHaveLength(1)
    expect(result[0].participatedCount).toBe(1)
  })

  test('participantIds の重複は 1 回とカウント', () => {
    const members = [member('a')]
    const events = [event('e1', '2026-01-01', 'a', 1000, ['a', 'a'])]
    const result = computeRanking(members, events, { metric: 'total', clutchThreshold: CLUTCH })
    expect(result[0].participatedCount).toBe(1)
    expect(result[0].participatedTotal).toBe(1000)
  })

  test('rank は 1 始まり連番', () => {
    const members = [member('a'), member('b'), member('c')]
    const events = [
      event('e1', '2026-01-01', 'a', 100, ['a']),
      event('e2', '2026-01-02', 'b', 200, ['b']),
      event('e3', '2026-01-03', 'c', 300, ['c']),
    ]
    const result = computeRanking(members, events, { metric: 'total', clutchThreshold: CLUTCH })
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3])
  })
})
