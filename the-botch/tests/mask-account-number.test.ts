/**
 * maskAccountNumber ユニットテスト — The botch
 *
 * 口座番号マスキング（末尾4桁のみ表示）のロジック検証。DB 非依存。
 * 実行: npx vitest run tests/mask-account-number.test.ts
 */
import { describe, test, expect } from 'vitest'
import { maskAccountNumber } from '@/lib/utils'

describe('maskAccountNumber', () => {
  test('7桁の口座番号は先頭3桁がマスクされる', () => {
    expect(maskAccountNumber('1234567')).toBe('***4567')
  })

  test('5桁の口座番号は先頭1桁がマスクされる', () => {
    expect(maskAccountNumber('12345')).toBe('*2345')
  })

  test('4桁以下はそのまま返す', () => {
    expect(maskAccountNumber('1234')).toBe('1234')
    expect(maskAccountNumber('1')).toBe('1')
  })

  test('空文字はそのまま返す', () => {
    expect(maskAccountNumber('')).toBe('')
  })
})
