/**
 * middleware.ts (Issue #329) の単体テスト
 *
 * - BASIC_AUTH_USER / BASIC_AUTH_PASS 未設定 → 全パス 401 (fail-closed)
 * - 正しい credential なしで保護対象パス → 401 + WWW-Authenticate
 * - 正しい credential ありで保護対象パス → next (401 ではない)
 * - /api/line/* 配下は認証なしでバイパス
 * - /liff/* 配下は認証なしでバイパス
 * - GET /api/members のみバイパス (POST /api/members は保護)
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

const BASE_URL = 'http://localhost:3000'

function buildRequest(
  path: string,
  options?: { method?: string; authorization?: string },
): NextRequest {
  const headers: Record<string, string> = {}
  if (options?.authorization) {
    headers['authorization'] = options.authorization
  }
  return new NextRequest(new URL(path, BASE_URL), {
    method: options?.method ?? 'GET',
    headers,
  })
}

function basicAuthHeader(user: string, pass: string): string {
  // atob/btoa はテスト環境でもグローバルに利用可能
  const encoded = Buffer.from(`${user}:${pass}`, 'utf-8').toString('base64')
  return `Basic ${encoded}`
}

const ENV_KEYS = ['BASIC_AUTH_USER', 'BASIC_AUTH_PASS'] as const
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

describe('middleware (Basic 認証)', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
    }
    process.env.BASIC_AUTH_USER = 'alice'
    process.env.BASIC_AUTH_PASS = 'secret-pass'
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key] as string
      }
    }
  })

  describe('認証が必要なパス', () => {
    test('Authorization ヘッダなし → 401', async () => {
      const res = middleware(buildRequest('/'))
      expect(res.status).toBe(401)
      expect(res.headers.get('WWW-Authenticate')).toContain('Basic realm="the-botch"')
    })

    test('Basic 以外のスキーム → 401', async () => {
      const res = middleware(
        buildRequest('/warikan', { authorization: 'Bearer token-abc' }),
      )
      expect(res.status).toBe(401)
    })

    test('壊れた Base64 → 401', async () => {
      const res = middleware(
        buildRequest('/otokogi', { authorization: 'Basic !!!not-base64!!!' }),
      )
      expect(res.status).toBe(401)
    })

    test('user:pass 形式でない → 401', async () => {
      const encoded = Buffer.from('no-colon-here', 'utf-8').toString('base64')
      const res = middleware(
        buildRequest('/members', { authorization: `Basic ${encoded}` }),
      )
      expect(res.status).toBe(401)
    })

    test('user が不一致 → 401', async () => {
      const res = middleware(
        buildRequest('/members', {
          authorization: basicAuthHeader('bob', 'secret-pass'),
        }),
      )
      expect(res.status).toBe(401)
    })

    test('pass が不一致 → 401', async () => {
      const res = middleware(
        buildRequest('/members', {
          authorization: basicAuthHeader('alice', 'wrong-pass'),
        }),
      )
      expect(res.status).toBe(401)
    })

    test('正しい credential → next (401 ではない)', async () => {
      const res = middleware(
        buildRequest('/', {
          authorization: basicAuthHeader('alice', 'secret-pass'),
        }),
      )
      expect(res.status).not.toBe(401)
    })

    test('API ルートも保護対象', async () => {
      const res = middleware(buildRequest('/api/warikan'))
      expect(res.status).toBe(401)
    })

    test('口座情報 API は保護対象', async () => {
      const res = middleware(buildRequest('/api/members/abc-123/bank-account'))
      expect(res.status).toBe(401)
    })
  })

  describe('認証バイパスパス', () => {
    test('/api/line/link は認証なしでバイパス', async () => {
      const res = middleware(buildRequest('/api/line/link', { method: 'POST' }))
      expect(res.status).not.toBe(401)
    })

    test('/api/line/notify-unpaid は認証なしでバイパス', async () => {
      const res = middleware(
        buildRequest('/api/line/notify-unpaid', { method: 'POST' }),
      )
      expect(res.status).not.toBe(401)
    })

    test('/liff/link は認証なしでバイパス', async () => {
      const res = middleware(buildRequest('/liff/link'))
      expect(res.status).not.toBe(401)
    })

    test('/liff ルート自体もバイパス', async () => {
      const res = middleware(buildRequest('/liff'))
      expect(res.status).not.toBe(401)
    })

    test('GET /api/members は LIFF 用にバイパス', async () => {
      const res = middleware(buildRequest('/api/members'))
      expect(res.status).not.toBe(401)
    })

    test('POST /api/members は保護対象 (バイパスされない)', async () => {
      const res = middleware(buildRequest('/api/members', { method: 'POST' }))
      expect(res.status).toBe(401)
    })

    test('DELETE /api/members も保護対象', async () => {
      const res = middleware(buildRequest('/api/members', { method: 'DELETE' }))
      expect(res.status).toBe(401)
    })

    test('/api/line を部分一致で偽装したパスはバイパスされない', async () => {
      // 例: /api/line-fake や /api/linefake は /api/line/ プレフィックス外
      const res = middleware(buildRequest('/api/line-fake'))
      expect(res.status).toBe(401)
    })
  })

  describe('fail-closed (credential 未設定時)', () => {
    test('BASIC_AUTH_USER 未設定 → 401', async () => {
      delete process.env.BASIC_AUTH_USER
      const res = middleware(
        buildRequest('/', {
          authorization: basicAuthHeader('alice', 'secret-pass'),
        }),
      )
      expect(res.status).toBe(401)
    })

    test('BASIC_AUTH_PASS 未設定 → 401', async () => {
      delete process.env.BASIC_AUTH_PASS
      const res = middleware(
        buildRequest('/', {
          authorization: basicAuthHeader('alice', 'secret-pass'),
        }),
      )
      expect(res.status).toBe(401)
    })

    test('credential 未設定でもバイパス対象は 401 にならない', async () => {
      delete process.env.BASIC_AUTH_USER
      delete process.env.BASIC_AUTH_PASS
      const res = middleware(buildRequest('/api/line/link', { method: 'POST' }))
      expect(res.status).not.toBe(401)
    })
  })

  describe('コロンを含むパスワード', () => {
    test('パスワードにコロンが含まれていても検証成功', async () => {
      process.env.BASIC_AUTH_PASS = 'pass:with:colons'
      const res = middleware(
        buildRequest('/', {
          authorization: basicAuthHeader('alice', 'pass:with:colons'),
        }),
      )
      expect(res.status).not.toBe(401)
    })
  })
})
