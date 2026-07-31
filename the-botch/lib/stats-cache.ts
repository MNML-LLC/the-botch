// 統計API サーバーサイドキャッシュ（5分TTL）
// 本番: Vercel KV (Redis) を利用してサーバーレスインスタンス間でキャッシュ共有。
// ローカル開発 / KV 未設定環境: インメモリ Map にフォールバック。

import { kv } from '@vercel/kv'

type MemoryEntry = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  expiresAt: number
}

const CACHE_TTL_SECONDS = 5 * 60 // 5分
const KEY_PREFIX = 'stats:'
// KV 上で一括削除する対象キーを追跡する Set
const KV_INDEX_KEY = 'stats:__keys'

const memoryCache = new Map<string, MemoryEntry>()

function isKvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}

function kvKey(year: string): string {
  return `${KEY_PREFIX}${year}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCachedStats(year: string): Promise<any | null> {
  if (isKvAvailable()) {
    try {
      const value = await kv.get(kvKey(year))
      return value ?? null
    } catch (error) {
      console.error('[stats-cache] KV get error, fallback to memory:', error)
    }
  }
  const entry = memoryCache.get(year)
  if (!entry || Date.now() > entry.expiresAt) {
    memoryCache.delete(year)
    return null
  }
  return entry.data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setCachedStats(year: string, data: any): Promise<void> {
  if (isKvAvailable()) {
    try {
      await kv.set(kvKey(year), data, { ex: CACHE_TTL_SECONDS })
      await kv.sadd(KV_INDEX_KEY, kvKey(year))
      return
    } catch (error) {
      console.error('[stats-cache] KV set error, fallback to memory:', error)
    }
  }
  memoryCache.set(year, { data, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 })
}

/** イベント/メンバー/精算の変更時にキャッシュを全クリア */
export async function invalidateStatsCache(): Promise<void> {
  if (isKvAvailable()) {
    try {
      const keys = await kv.smembers(KV_INDEX_KEY)
      if (Array.isArray(keys) && keys.length > 0) {
        await kv.del(...(keys as string[]))
      }
      await kv.del(KV_INDEX_KEY)
    } catch (error) {
      console.error('[stats-cache] KV invalidate error:', error)
    }
  }
  memoryCache.clear()
}
