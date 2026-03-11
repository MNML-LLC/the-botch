// 統計API サーバーサイドインメモリキャッシュ（5分TTL）

type StatsCache = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  expiresAt: number
}

// キーは year パラメータ（"all" | "2026" | "2025" ...）
const cache = new Map<string, StatsCache>()
const CACHE_TTL = 5 * 60 * 1000 // 5分

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCachedStats(year: string): any | null {
  const entry = cache.get(year)
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(year)
    return null
  }
  return entry.data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCachedStats(year: string, data: any): void {
  cache.set(year, { data, expiresAt: Date.now() + CACHE_TTL })
}

/** イベント/メンバー/精算の変更時にキャッシュを全クリア */
export function invalidateStatsCache(): void {
  cache.clear()
}
