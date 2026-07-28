/**
 * formatAmount / parseAmount ユニットテスト — The botch
 *
 * 金額入力フィールドのカンマ区切り自動フォーマット用ヘルパー検証。
 * 実行: npx vitest run tests/amount-format.test.ts
 */
import { describe, test, expect } from 'vitest'
import { formatAmount, parseAmount } from '@/lib/utils'

describe('formatAmount', () => {
  test('数値文字列を3桁区切りに整形する', () => {
    expect(formatAmount('10000')).toBe('10,000')
    expect(formatAmount('1234567')).toBe('1,234,567')
  })

  test('3桁以下はカンマなし', () => {
    expect(formatAmount('0')).toBe('0')
    expect(formatAmount('999')).toBe('999')
  })

  test('空文字は空文字を返す', () => {
    expect(formatAmount('')).toBe('')
  })

  test('数値化できない値はそのまま返す', () => {
    expect(formatAmount('abc')).toBe('abc')
  })
})

describe('parseAmount', () => {
  test('カンマを除去して数字だけ残す', () => {
    expect(parseAmount('10,000')).toBe('10000')
    expect(parseAmount('1,234,567')).toBe('1234567')
  })

  test('全角数字を半角に変換する', () => {
    expect(parseAmount('１０００')).toBe('1000')
    expect(parseAmount('１０，０００')).toBe('10000')
  })

  test('先頭ゼロは1桁だけ残す', () => {
    expect(parseAmount('007')).toBe('7')
    expect(parseAmount('0')).toBe('0')
    expect(parseAmount('0000')).toBe('0')
  })

  test('非数字文字は除去する', () => {
    expect(parseAmount('¥1,000')).toBe('1000')
    expect(parseAmount('abc123')).toBe('123')
  })

  test('空文字・数字なしは空文字を返す', () => {
    expect(parseAmount('')).toBe('')
    expect(parseAmount('abc')).toBe('')
  })
})
