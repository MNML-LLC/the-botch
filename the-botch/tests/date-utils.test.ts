/**
 * lib/date-utils.ts の単体テスト
 *
 * 実行: npx vitest run tests/date-utils.test.ts
 */
import { describe, test, expect } from 'vitest'
import { getCurrentFiscalYear } from '@/lib/date-utils'

describe('getCurrentFiscalYear', () => {
  // ローカルタイム依存を避けるため、ローカル時刻で日付を構築する
  test('1 月〜10 月はその年を fiscal year として返す', () => {
    expect(getCurrentFiscalYear(new Date(2026, 0, 15))).toBe(2026) // Jan
    expect(getCurrentFiscalYear(new Date(2026, 5, 30))).toBe(2026) // Jun
    expect(getCurrentFiscalYear(new Date(2026, 9, 31))).toBe(2026) // Oct
  })

  test('11 月〜12 月は翌年を fiscal year として返す', () => {
    expect(getCurrentFiscalYear(new Date(2026, 10, 1))).toBe(2027) // Nov
    expect(getCurrentFiscalYear(new Date(2026, 11, 31))).toBe(2027) // Dec
  })

  test('引数省略時は現在時刻ベース', () => {
    const result = getCurrentFiscalYear()
    const now = new Date()
    const expected = now.getMonth() >= 10 ? now.getFullYear() + 1 : now.getFullYear()
    expect(result).toBe(expected)
  })
})
