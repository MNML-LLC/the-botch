import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short'
  })
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 口座番号を末尾4桁のみ表示にマスキングする（例: "1234567" → "***4567"）
 * 4桁以下の場合はマスキングの意味がない（全桁が末尾4桁に含まれる）ため、そのまま返す
 */
export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber
  return '*'.repeat(accountNumber.length - 4) + accountNumber.slice(-4)
}

/**
 * 金額入力の表示用フォーマット。数値文字列（カンマなし）を3桁区切りに整形する。
 * 空文字は空のまま、数値化できないものはそのまま返す。
 */
export function formatAmount(value: string): string {
  if (value === '') return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return value
  return num.toLocaleString('ja-JP')
}

/**
 * 金額入力の生値抽出。表示用文字列（カンマ・全角数字を含みうる）から整数文字列を取り出す。
 * 全角数字は半角化し、非数字は除去。先頭ゼロは1桁だけ残す。
 */
export function parseAmount(value: string): string {
  const halfWidth = value.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  )
  const digitsOnly = halfWidth.replace(/[^0-9]/g, '')
  if (digitsOnly === '') return ''
  return digitsOnly.replace(/^0+(?=\d)/, '')
}
