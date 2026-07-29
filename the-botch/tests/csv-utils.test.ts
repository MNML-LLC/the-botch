import { describe, test, expect } from 'vitest'
import {
  escapeCsvField,
  serializeCsv,
  sanitizeFilename,
  contentDispositionAttachment,
} from '@/lib/csv-utils'

describe('escapeCsvField', () => {
  test('null / undefined は空文字列', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  test('通常の文字列はそのまま', () => {
    expect(escapeCsvField('hello')).toBe('hello')
    expect(escapeCsvField('ゆうき')).toBe('ゆうき')
  })

  test('数値は文字列化される', () => {
    expect(escapeCsvField(1234)).toBe('1234')
    expect(escapeCsvField(0)).toBe('0')
  })

  test('カンマ / ダブルクォート / 改行はクォートで囲みエスケープ', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"')
    expect(escapeCsvField('a"b')).toBe('"a""b"')
    expect(escapeCsvField('a\nb')).toBe('"a\nb"')
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"')
  })
})

describe('serializeCsv', () => {
  test('BOM + CRLF 区切り + 末尾 CRLF', () => {
    const csv = serializeCsv([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(csv).toBe('﻿a,b\r\nc,d\r\n')
  })

  test('エスケープが行単位で適用される', () => {
    const csv = serializeCsv([
      ['name', 'note'],
      ['ゆうき', 'コート,ボール'],
    ])
    expect(csv).toBe('﻿name,note\r\nゆうき,"コート,ボール"\r\n')
  })

  test('空行 (空配列) は空文字列の行', () => {
    const csv = serializeCsv([['a'], [], ['b']])
    expect(csv).toBe('﻿a\r\n\r\nb\r\n')
  })
})

describe('sanitizeFilename', () => {
  test('OS 予約文字は _ に置換', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })

  test('前後の空白・ピリオドを除去', () => {
    expect(sanitizeFilename('  hello.csv  ')).toBe('hello.csv')
    expect(sanitizeFilename('..hidden')).toBe('hidden')
  })

  test('日本語文字は保持', () => {
    expect(sanitizeFilename('温泉旅行.csv')).toBe('温泉旅行.csv')
  })
})

describe('contentDispositionAttachment', () => {
  test('ASCII ファイル名は filename + filename* 両方に UTF-8 エンコード形式で入る', () => {
    const cd = contentDispositionAttachment('report.csv')
    expect(cd).toBe(`attachment; filename="report.csv"; filename*=UTF-8''report.csv`)
  })

  test('日本語ファイル名は ASCII フォールバックが _ に潰され、filename* に percent-encoded で入る', () => {
    const cd = contentDispositionAttachment('warikan_温泉_2026-07-29.csv')
    expect(cd).toMatch(/^attachment; filename="warikan____2026-07-29\.csv"; filename\*=UTF-8''/)
    expect(cd).toContain(encodeURIComponent('warikan_温泉_2026-07-29.csv'))
  })

  test('OS 予約文字は先に除去された上でエンコードされる', () => {
    const cd = contentDispositionAttachment('a/b?c.csv')
    expect(cd).toContain('filename="a_b_c.csv"')
    expect(cd).toContain(`filename*=UTF-8''a_b_c.csv`)
  })
})
