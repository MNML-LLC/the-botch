import { vi } from 'vitest'

// @vercel/kv は import 時点で KV_REST_API_URL / KV_REST_API_TOKEN を要求し、
// 未設定だと throw する。テスト環境では KV を使わないため全体をスタブする。
vi.mock('@vercel/kv', () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    sadd: vi.fn(),
    smembers: vi.fn().mockResolvedValue([]),
  },
}))
