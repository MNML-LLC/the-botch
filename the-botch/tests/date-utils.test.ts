import { describe, test, expect } from 'vitest'
import {
  computeDisplayDate,
  formatDateWithYear,
  formatMonthShort,
  formatMonthWithYear,
  formatPeriodLabel,
  formatRangeTitle,
  formatRelativeDate,
  formatShortDateWithYear,
  formatYearMonthFull,
  formatYearMonthLabel,
  getFiscalYear,
  getFiscalYearRange,
  isCurrentMonth,
  isCurrentYear,
  parseEventDate,
} from '@/lib/date-utils'

describe('parseEventDate', () => {
  test('先頭8桁の YYYYMMDD パターンを抽出する', () => {
    expect(parseEventDate('20260207_テニス')).toBe('2026-02-07')
    expect(parseEventDate('20260101_新年会')).toBe('2026-01-01')
  })
  test('パターンに一致しない場合は null', () => {
    expect(parseEventDate('テニス')).toBeNull()
    expect(parseEventDate('2026-02-07_テニス')).toBeNull()
  })
})

describe('computeDisplayDate', () => {
  test('eventName の YYYYMMDD を優先', () => {
    const result = computeDisplayDate('20260207_テニス', '2026-03-01', '2026-02-28')
    expect(result?.toISOString().slice(0, 10)).toBe('2026-02-07')
  })
  test('なければ paymentDeadline → detailDeadline の順でフォールバック', () => {
    expect(computeDisplayDate('テニス', '2026-03-01', '2026-02-28')?.toISOString().slice(0, 10)).toBe('2026-03-01')
    expect(computeDisplayDate('テニス', null, '2026-02-28')?.toISOString().slice(0, 10)).toBe('2026-02-28')
    expect(computeDisplayDate('テニス', null, null)).toBeNull()
  })
})

describe('getFiscalYear', () => {
  test('4月1日は当年の年度', () => {
    expect(getFiscalYear(new Date(2026, 3, 1))).toBe(2026)
  })
  test('3月31日は前年の年度（年度跨ぎ）', () => {
    expect(getFiscalYear(new Date(2026, 2, 31))).toBe(2025)
  })
  test('1月は前年の年度（年度跨ぎ）', () => {
    expect(getFiscalYear(new Date(2026, 0, 1))).toBe(2025)
  })
  test('12月は当年の年度', () => {
    expect(getFiscalYear(new Date(2026, 11, 31))).toBe(2026)
  })
  test('11月は当年の年度', () => {
    expect(getFiscalYear(new Date(2026, 10, 1))).toBe(2026)
  })
})

describe('getFiscalYearRange', () => {
  test('2026年度 = 2026/4/1 〜 2027/3/31', () => {
    const { from, to } = getFiscalYearRange(2026)
    expect(from.getFullYear()).toBe(2026)
    expect(from.getMonth()).toBe(3)
    expect(from.getDate()).toBe(1)
    expect(to.getFullYear()).toBe(2027)
    expect(to.getMonth()).toBe(2)
    expect(to.getDate()).toBe(31)
  })
})

describe('formatPeriodLabel', () => {
  const ref = new Date(2026, 10, 1) // 2026/11/1
  test('month: 今月 (2026年11月)', () => {
    expect(formatPeriodLabel('month', ref)).toBe('今月 (2026年11月)')
  })
  test('year: 今年 (2026年)', () => {
    expect(formatPeriodLabel('year', ref)).toBe('今年 (2026年)')
  })
  test('fiscal_year: 今年度 (2026年度 = 2026/4〜2027/3)', () => {
    expect(formatPeriodLabel('fiscal_year', ref)).toBe('今年度 (2026年度 = 2026/4〜2027/3)')
  })
  test('fiscal_year: 3月基準では前年度を返す', () => {
    const march = new Date(2026, 2, 31)
    expect(formatPeriodLabel('fiscal_year', march)).toBe('今年度 (2025年度 = 2025/4〜2026/3)')
  })
})

describe('formatDateWithYear', () => {
  test('年含み + 曜日', () => {
    const d = new Date(2026, 10, 1) // 2026/11/1(日)
    expect(formatDateWithYear(d)).toBe('2026/11/1(日)')
  })
  test('文字列入力も受け付ける (ローカルタイムゾーン)', () => {
    // Date constructor + numeric fields はローカル TZ 基準。文字列経由でもローカル解釈に戻ることを確認
    const iso = new Date(2026, 10, 1).toISOString()
    expect(formatDateWithYear(iso)).toMatch(/^2026\/(10|11)\/(1|31)\([日月火水木金土]\)$/)
  })
})

describe('formatShortDateWithYear', () => {
  test('年含み・曜日なし', () => {
    expect(formatShortDateWithYear(new Date(2026, 10, 1))).toBe('2026/11/1')
  })
})

describe('formatMonthWithYear', () => {
  test('2026年11月', () => {
    expect(formatMonthWithYear(new Date(2026, 10, 15))).toBe('2026年11月')
  })
})

describe('formatMonthShort', () => {
  test('2026/11', () => {
    expect(formatMonthShort(new Date(2026, 10, 15))).toBe('2026/11')
  })
})

describe('formatYearMonthLabel', () => {
  test('YYYY-MM → YYYY/M', () => {
    expect(formatYearMonthLabel('2026-11')).toBe('2026/11')
    expect(formatYearMonthLabel('2026-01')).toBe('2026/1')
  })
  test('不正な入力はそのまま返す', () => {
    expect(formatYearMonthLabel('invalid')).toBe('invalid')
  })
})

describe('formatYearMonthFull', () => {
  test('YYYY-MM → YYYY年M月', () => {
    expect(formatYearMonthFull('2026-11')).toBe('2026年11月')
    expect(formatYearMonthFull('2026-01')).toBe('2026年1月')
  })
})

describe('isCurrentMonth / isCurrentYear', () => {
  const now = new Date(2026, 10, 1)
  test('同月は true', () => {
    expect(isCurrentMonth(new Date(2026, 10, 30), now)).toBe(true)
    expect(isCurrentMonth(new Date(2026, 9, 30), now)).toBe(false)
  })
  test('同年は true', () => {
    expect(isCurrentYear(new Date(2026, 0, 1), now)).toBe(true)
    expect(isCurrentYear(new Date(2025, 11, 31), now)).toBe(false)
  })
})

describe('formatRelativeDate', () => {
  const now = new Date(2026, 10, 1) // 2026/11/1
  test('同日は今日', () => {
    const r = formatRelativeDate(new Date(2026, 10, 1, 10, 0, 0), now)
    expect(r.primary).toBe('今日')
    expect(r.absolute).toBe('2026/11/1(日)')
  })
  test('1日前は昨日', () => {
    expect(formatRelativeDate(new Date(2026, 9, 31), now).primary).toBe('昨日')
  })
  test('3日前は 3日前', () => {
    expect(formatRelativeDate(new Date(2026, 9, 29), now).primary).toBe('3日前')
  })
  test('1日後は明日', () => {
    expect(formatRelativeDate(new Date(2026, 10, 2), now).primary).toBe('明日')
  })
  test('8日より昔は絶対日付が primary', () => {
    const r = formatRelativeDate(new Date(2025, 0, 1), now)
    expect(r.primary).toBe('2025/1/1(水)')
    expect(r.absolute).toBe('2025/1/1(水)')
  })
})

describe('formatRangeTitle', () => {
  const ref = new Date(2026, 10, 1)
  test('month', () => {
    expect(formatRangeTitle('month', { refDate: ref })).toBe('対象期間: 2026年11月')
  })
  test('year', () => {
    expect(formatRangeTitle('year', { refDate: ref })).toBe('対象期間: 2026年')
  })
  test('fiscal_year', () => {
    expect(formatRangeTitle('fiscal_year', { refDate: ref })).toBe('対象期間: 2026年度 (2026/4〜2027/3)')
  })
  test('all', () => {
    expect(formatRangeTitle('all')).toBe('対象期間: 全期間')
  })
  test('custom', () => {
    expect(formatRangeTitle('custom', { customFrom: '2026-01-01', customTo: '2026-06-30' })).toBe(
      '対象期間: 2026-01-01 〜 2026-06-30',
    )
  })
  test('label を上書きできる', () => {
    expect(formatRangeTitle('month', { refDate: ref, label: 'ランキング' })).toBe('ランキング: 2026年11月')
  })
})
