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

// DBマイグレーション後は不要なLocalStorage関連の関数を削除
