// CSV 生成ユーティリティ（RFC 4180 準拠のエスケープ、UTF-8 BOM）

const CSV_BOM = '﻿'
const CSV_NEWLINE = '\r\n'

/**
 * CSV 1 フィールド分の値を文字列化する。
 * `"` `,` 改行を含む場合はダブルクォートで囲み、内部の `"` は `""` にエスケープする。
 * null / undefined は空文字列。
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str === '') return ''
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * 2 次元配列（行の配列）を CSV 文字列にシリアライズする。
 * 先頭に UTF-8 BOM を付け、改行は CRLF。
 */
export function serializeCsv(rows: readonly (readonly unknown[])[]): string {
  const body = rows.map((row) => row.map(escapeCsvField).join(',')).join(CSV_NEWLINE)
  return CSV_BOM + body + CSV_NEWLINE
}

/**
 * ファイル名として使えない文字 (`\ / : * ? " < > |` および制御文字) を `_` に置換する。
 * 前後の空白・ピリオドも除去する。
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
}

/**
 * Content-Disposition の値を生成する。
 * ASCII フォールバックと `filename*=UTF-8''` を併用し、日本語ファイル名に対応する。
 */
export function contentDispositionAttachment(filename: string): string {
  const safe = sanitizeFilename(filename)
  // ASCII 以外を `_` に潰したフォールバック（旧ブラウザ用）
  const asciiFallback = safe.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_')
  const encoded = encodeURIComponent(safe)
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}
