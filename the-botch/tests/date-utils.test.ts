/**
 * date-utils.ts ユニットテスト — The botch
 *
 * 相対+絶対日付・会計年度・月次ラベルのフォーマット検証
 * 実行: npx vitest run tests/date-utils.test.ts
 */
import { describe, test, expect } from 'vitest'
import {
  formatDateAbs,
  formatDateRel,
  formatDateBoth,
  getFiscalYear,
  getFiscalYearRange,
  getCurrentMonthRange,
  getPeriodRange,
  appendPeriodSearchParams,
  parsePeriodFromSearchParams,
  formatMonthLabel,
  parseEventDate,
  computeDisplayDate,
} from '@/lib/date-utils'

describe('formatDateAbs', () => {
  test('`YYYY/M/D(週)` 形式', () => {
    // 2026-11-02 is Monday → (月)
    expect(formatDateAbs(new Date(2026, 10, 2))).toBe('2026/11/2(月)')
    // 2026-01-01 is Thursday → (木)
    expect(formatDateAbs(new Date(2026, 0, 1))).toBe('2026/1/1(木)')
  })

  test('文字列入力も扱える', () => {
    expect(formatDateAbs('2026-11-01T00:00:00')).toContain('2026/11/1')
  })
})

describe('formatDateRel', () => {
  const now = new Date(2026, 10, 1) // 2026-11-01

  test('今日', () => {
    expect(formatDateRel(new Date(2026, 10, 1), now)).toBe('今日')
  })

  test('昨日 / 明日', () => {
    expect(formatDateRel(new Date(2026, 9, 31), now)).toBe('昨日')
    expect(formatDateRel(new Date(2026, 10, 2), now)).toBe('明日')
  })

  test('N日前 / N日後', () => {
    expect(formatDateRel(new Date(2026, 9, 29), now)).toBe('3日前')
    expect(formatDateRel(new Date(2026, 10, 8), now)).toBe('7日後')
  })

  test('時刻違いで同日なら 今日', () => {
    const t = new Date(2026, 10, 1, 23, 59, 59)
    expect(formatDateRel(t, now)).toBe('今日')
  })
})

describe('formatDateBoth', () => {
  test('相対 · 絶対 を連結', () => {
    const now = new Date(2026, 10, 1)
    const d = new Date(2026, 9, 29) // 3日前
    expect(formatDateBoth(d, now)).toBe('3日前 · 2026/10/29(木)')
  })
})

describe('getFiscalYear (11月始まり)', () => {
  test('FY境界: 10/31 は FY25 Q4', () => {
    const r = getFiscalYear(new Date(2026, 9, 31))
    expect(r.fy).toBe(2025)
    expect(r.quarter).toBe(4)
    expect(r.label).toBe('FY25 Q4 (2025/11〜2026/10)')
  })

  test('FY境界: 11/1 は FY26 Q1', () => {
    const r = getFiscalYear(new Date(2026, 10, 1))
    expect(r.fy).toBe(2026)
    expect(r.quarter).toBe(1)
    expect(r.label).toBe('FY26 Q1 (2026/11〜2027/10)')
    expect(r.from.getFullYear()).toBe(2026)
    expect(r.from.getMonth()).toBe(10) // 11月
    expect(r.to.getFullYear()).toBe(2027)
    expect(r.to.getMonth()).toBe(9) // 10月
  })

  test('四半期の割り当て', () => {
    expect(getFiscalYear(new Date(2026, 10, 15)).quarter).toBe(1) // 11月
    expect(getFiscalYear(new Date(2026, 11, 15)).quarter).toBe(1) // 12月
    expect(getFiscalYear(new Date(2027, 0, 15)).quarter).toBe(1) // 1月
    expect(getFiscalYear(new Date(2027, 1, 15)).quarter).toBe(2) // 2月
    expect(getFiscalYear(new Date(2027, 3, 15)).quarter).toBe(2) // 4月
    expect(getFiscalYear(new Date(2027, 4, 15)).quarter).toBe(3) // 5月
    expect(getFiscalYear(new Date(2027, 6, 15)).quarter).toBe(3) // 7月
    expect(getFiscalYear(new Date(2027, 7, 15)).quarter).toBe(4) // 8月
    expect(getFiscalYear(new Date(2027, 9, 31)).quarter).toBe(4) // 10月
  })

  test('1月は前年始まりの FY に属する', () => {
    const r = getFiscalYear(new Date(2027, 0, 15))
    expect(r.fy).toBe(2026)
    expect(r.label).toBe('FY26 Q1 (2026/11〜2027/10)')
  })
})

describe('formatMonthLabel', () => {
  test('`YYYY/M` 形式', () => {
    expect(formatMonthLabel(new Date(2026, 10, 15))).toBe('2026/11')
    expect(formatMonthLabel(new Date(2026, 0, 1))).toBe('2026/1')
  })
})

describe('parseEventDate (既存)', () => {
  test('先頭 YYYYMMDD を抽出', () => {
    expect(parseEventDate('20260207_テニス')).toBe('2026-02-07')
  })
  test('マッチしない場合は null', () => {
    expect(parseEventDate('テニス')).toBeNull()
  })
})

describe('getFiscalYearRange', () => {
  test('offset=0 (今期): 2026-11-01 は FY26 (2026/11〜2027/10)', () => {
    const r = getFiscalYearRange(new Date(2026, 10, 1), 0)
    expect(r.fy).toBe(2026)
    expect(r.from.getFullYear()).toBe(2026)
    expect(r.from.getMonth()).toBe(10) // 11月
    expect(r.from.getDate()).toBe(1)
    expect(r.to.getFullYear()).toBe(2027)
    expect(r.to.getMonth()).toBe(9) // 10月
    expect(r.to.getDate()).toBe(31)
    expect(r.label).toBe('2026年度 (11月開始)')
  })

  test('offset=-1 (前期): 2026-11-01 → FY25 (2025/11〜2026/10)', () => {
    const r = getFiscalYearRange(new Date(2026, 10, 1), -1)
    expect(r.fy).toBe(2025)
    expect(r.from.getFullYear()).toBe(2025)
    expect(r.from.getMonth()).toBe(10)
    expect(r.to.getFullYear()).toBe(2026)
    expect(r.to.getMonth()).toBe(9)
  })

  test('offset=1 (次期): 2026-11-01 → FY27', () => {
    const r = getFiscalYearRange(new Date(2026, 10, 1), 1)
    expect(r.fy).toBe(2027)
  })

  test('境界 10/31 は前年 FY に属する (offset=0)', () => {
    const r = getFiscalYearRange(new Date(2026, 9, 31), 0)
    expect(r.fy).toBe(2025)
    expect(r.label).toBe('2025年度 (11月開始)')
  })

  test('境界 11/1 は当年 FY に属する (offset=0)', () => {
    const r = getFiscalYearRange(new Date(2026, 10, 1), 0)
    expect(r.fy).toBe(2026)
  })

  test('閏年 2024/2 → FY23 (2023/11〜2024/10)', () => {
    const r = getFiscalYearRange(new Date(2024, 1, 29), 0)
    expect(r.fy).toBe(2023)
    expect(r.from.getFullYear()).toBe(2023)
    expect(r.to.getFullYear()).toBe(2024)
  })

  test('年末年始跨ぎ 2027/1/15 → FY26', () => {
    const r = getFiscalYearRange(new Date(2027, 0, 15), 0)
    expect(r.fy).toBe(2026)
  })

  test('ref 省略時は "今" を基準に動く', () => {
    const r = getFiscalYearRange()
    // 現在が 11月以降なら当年、そうでなければ前年
    const now = new Date()
    const expectedFy = now.getMonth() + 1 >= 11 ? now.getFullYear() : now.getFullYear() - 1
    expect(r.fy).toBe(expectedFy)
  })
})

describe('getCurrentMonthRange', () => {
  test('月初〜現在時刻', () => {
    const ref = new Date(2026, 10, 15, 14, 30)
    const r = getCurrentMonthRange(ref)
    expect(r.from.getFullYear()).toBe(2026)
    expect(r.from.getMonth()).toBe(10)
    expect(r.from.getDate()).toBe(1)
    expect(r.to.getFullYear()).toBe(2026)
    expect(r.to.getDate()).toBe(15)
    expect(r.label).toBe('2026/11月')
  })
})

describe('getPeriodRange', () => {
  const ref = new Date(2026, 10, 15) // 2026-11-15 (FY26 中盤)

  test('current-month', () => {
    const r = getPeriodRange('current-month', ref)
    expect(r.from?.getDate()).toBe(1)
    expect(r.to?.getDate()).toBe(15)
    expect(r.label).toBe('今月')
  })

  test('current-fy', () => {
    const r = getPeriodRange('current-fy', ref)
    expect(r.from?.getFullYear()).toBe(2026)
    expect(r.from?.getMonth()).toBe(10)
    expect(r.to?.getFullYear()).toBe(2027)
    expect(r.label).toBe('今期')
  })

  test('last-fy', () => {
    const r = getPeriodRange('last-fy', ref)
    expect(r.from?.getFullYear()).toBe(2025)
    expect(r.to?.getFullYear()).toBe(2026)
    expect(r.label).toBe('前期')
  })

  test('all は from/to とも null', () => {
    const r = getPeriodRange('all', ref)
    expect(r.from).toBeNull()
    expect(r.to).toBeNull()
    expect(r.label).toBe('全期間')
  })

  test('custom は入力をパースして返す', () => {
    const r = getPeriodRange('custom', ref, { from: '2026-01-01', to: '2026-06-30' })
    expect(r.from?.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(r.to?.toISOString().slice(0, 10)).toBe('2026-06-30')
  })

  test('custom で値が無ければ null', () => {
    const r = getPeriodRange('custom', ref, {})
    expect(r.from).toBeNull()
    expect(r.to).toBeNull()
  })
})

describe('appendPeriodSearchParams', () => {
  test('all は何も書かない', () => {
    const p = new URLSearchParams()
    appendPeriodSearchParams(p, { period: 'all' })
    expect(p.toString()).toBe('')
  })

  test('current-fy は period のみ', () => {
    const p = new URLSearchParams()
    appendPeriodSearchParams(p, { period: 'current-fy' })
    expect(p.get('period')).toBe('current-fy')
    expect(p.get('from')).toBeNull()
  })

  test('custom は from/to も書く', () => {
    const p = new URLSearchParams()
    appendPeriodSearchParams(p, { period: 'custom', from: '2026-01-01', to: '2026-06-30' })
    expect(p.get('period')).toBe('custom')
    expect(p.get('from')).toBe('2026-01-01')
    expect(p.get('to')).toBe('2026-06-30')
  })
})

describe('parsePeriodFromSearchParams', () => {
  const now = new Date(2026, 10, 15) // 2026-11-15

  test('period=current-fy → FY26', () => {
    const p = new URLSearchParams({ period: 'current-fy' })
    const r = parsePeriodFromSearchParams(p, now)
    expect(r.from?.getFullYear()).toBe(2026)
    expect(r.from?.getMonth()).toBe(10)
    expect(r.to?.getFullYear()).toBe(2027)
  })

  test('period=last-fy → FY25', () => {
    const p = new URLSearchParams({ period: 'last-fy' })
    const r = parsePeriodFromSearchParams(p, now)
    expect(r.from?.getFullYear()).toBe(2025)
    expect(r.to?.getFullYear()).toBe(2026)
  })

  test('period=all → null, null', () => {
    const p = new URLSearchParams({ period: 'all' })
    const r = parsePeriodFromSearchParams(p, now)
    expect(r.from).toBeNull()
    expect(r.to).toBeNull()
  })

  test('period=custom + from/to', () => {
    const p = new URLSearchParams({ period: 'custom', from: '2026-01-01', to: '2026-06-30' })
    const r = parsePeriodFromSearchParams(p, now)
    expect(r.from?.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(r.to?.toISOString().slice(0, 10)).toBe('2026-06-30')
  })

  test('backward compat: year=2026 → 2025/11〜2026/10 (旧実装互換)', () => {
    const p = new URLSearchParams({ year: '2026' })
    const r = parsePeriodFromSearchParams(p, now)
    expect(r.from).toEqual(new Date('2025-11-01'))
    expect(r.to).toEqual(new Date('2026-10-31'))
  })

  test('from/to のみ', () => {
    const p = new URLSearchParams({ from: '2026-05-01', to: '2026-06-01' })
    const r = parsePeriodFromSearchParams(p, now)
    expect(r.from?.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(r.to?.toISOString().slice(0, 10)).toBe('2026-06-01')
  })

  test('何も無ければ null, null', () => {
    const p = new URLSearchParams()
    const r = parsePeriodFromSearchParams(p, now)
    expect(r.from).toBeNull()
    expect(r.to).toBeNull()
  })
})

describe('computeDisplayDate (既存)', () => {
  test('eventName 優先', () => {
    const r = computeDisplayDate('20260207_テニス', '2026-03-01', '2026-02-01')
    expect(r?.toISOString().slice(0, 10)).toBe('2026-02-07')
  })
  test('eventName なければ paymentDeadline', () => {
    const r = computeDisplayDate('テニス', '2026-03-01', '2026-02-01')
    expect(r?.toISOString().slice(0, 10)).toBe('2026-03-01')
  })
  test('両方なければ detailDeadline', () => {
    const r = computeDisplayDate('テニス', null, '2026-02-01')
    expect(r?.toISOString().slice(0, 10)).toBe('2026-02-01')
  })
  test('どれもなければ null', () => {
    expect(computeDisplayDate('テニス', null, null)).toBeNull()
  })
})
