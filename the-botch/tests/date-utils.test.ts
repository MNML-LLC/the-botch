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
