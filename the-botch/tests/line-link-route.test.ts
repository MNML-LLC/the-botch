/**
 * POST /api/line/link の単体テスト
 *
 * - LINE_CHANNEL_SECRET / NEXT_PUBLIC_LIFF_ID / LINE_LOGIN_CHANNEL_ID すべて未設定 → 503
 * - 入力バリデーション（idToken / memberId 必須）
 * - verifyLineIdToken が invalid_token を投げる → 401
 * - 正常系は upsert して 200 を返す
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, parseResponse } from './helpers'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
    },
    memberLineAccount: {
      upsert: vi.fn(),
    },
  },
}))

vi.mock('@/lib/line/verifyToken', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/line/verifyToken')
  >('@/lib/line/verifyToken')
  return {
    ...actual,
    verifyLineIdToken: vi.fn(),
  }
})

import { prisma } from '@/lib/prisma'
import {
  verifyLineIdToken,
  LineTokenVerifyError,
} from '@/lib/line/verifyToken'
import { POST } from '@/app/api/line/link/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedFindMember = prisma.member.findUnique as unknown as MockFn
const mockedUpsert = prisma.memberLineAccount.upsert as unknown as MockFn
const mockedVerify = verifyLineIdToken as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>

const ENV_KEYS = [
  'LINE_LOGIN_CHANNEL_ID',
  'NEXT_PUBLIC_LIFF_ID',
  'LINE_CHANNEL_SECRET',
] as const

function clearLineEnv() {
  for (const key of ENV_KEYS) delete process.env[key]
}

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  clearLineEnv()
  process.env.NEXT_PUBLIC_LIFF_ID = '1234567890-abcdefgh'
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
  consoleWarnSpy.mockRestore()
  clearLineEnv()
})

describe('POST /api/line/link', () => {
  test('LINE 環境変数がすべて未設定 → 503', async () => {
    clearLineEnv()
    const res = await POST(
      createRequest('/api/line/link', {
        method: 'POST',
        body: { idToken: 'tok', memberId: 'mem-1' },
      }),
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(503)
    expect(data.error).toContain('LINE')
    expect(mockedVerify).not.toHaveBeenCalled()
  })

  test('idToken 未指定 → 400', async () => {
    const res = await POST(
      createRequest('/api/line/link', {
        method: 'POST',
        body: { memberId: 'mem-1' },
      }),
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedVerify).not.toHaveBeenCalled()
  })

  test('memberId 未指定 → 400', async () => {
    const res = await POST(
      createRequest('/api/line/link', {
        method: 'POST',
        body: { idToken: 'tok' },
      }),
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedVerify).not.toHaveBeenCalled()
  })

  test('メンバー未存在 → 404', async () => {
    mockedFindMember.mockResolvedValue(null)
    const res = await POST(
      createRequest('/api/line/link', {
        method: 'POST',
        body: { idToken: 'tok', memberId: 'mem-1' },
      }),
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(404)
    expect(data.error).toContain('メンバー')
    expect(mockedVerify).not.toHaveBeenCalled()
  })

  test('verifyLineIdToken が invalid_token → 401', async () => {
    mockedFindMember.mockResolvedValue({ id: 'mem-1', isActive: true })
    mockedVerify.mockRejectedValue(
      new LineTokenVerifyError('bad token', 'invalid_token'),
    )
    const res = await POST(
      createRequest('/api/line/link', {
        method: 'POST',
        body: { idToken: 'tok', memberId: 'mem-1' },
      }),
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(401)
    expect(data.error).toContain('認証')
    expect(mockedUpsert).not.toHaveBeenCalled()
  })

  test('verifyLineIdToken が missing_secret → 503', async () => {
    mockedFindMember.mockResolvedValue({ id: 'mem-1', isActive: true })
    mockedVerify.mockRejectedValue(
      new LineTokenVerifyError('no secret', 'missing_secret'),
    )
    const res = await POST(
      createRequest('/api/line/link', {
        method: 'POST',
        body: { idToken: 'tok', memberId: 'mem-1' },
      }),
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(503)
    expect(mockedUpsert).not.toHaveBeenCalled()
  })

  test('正常系 → upsert & 200', async () => {
    mockedFindMember.mockResolvedValue({ id: 'mem-1', isActive: true })
    mockedVerify.mockResolvedValue({ sub: 'U-abcdef', name: 'ゆうき' })
    mockedUpsert.mockResolvedValue({
      id: 'link-1',
      memberId: 'mem-1',
      lineUserId: 'U-abcdef',
      displayName: 'ゆうき',
      linkedAt: new Date('2026-08-23'),
    })
    const res = await POST(
      createRequest('/api/line/link', {
        method: 'POST',
        body: { idToken: 'tok', memberId: 'mem-1' },
      }),
    )
    const { status, data } = await parseResponse<{
      id: string
      memberId: string
      displayName: string | null
    }>(res)

    expect(status).toBe(200)
    expect(data.memberId).toBe('mem-1')
    expect(data.displayName).toBe('ゆうき')
    expect(mockedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId: 'mem-1' },
        create: expect.objectContaining({
          memberId: 'mem-1',
          lineUserId: 'U-abcdef',
          displayName: 'ゆうき',
          isActive: true,
        }),
        update: expect.objectContaining({
          lineUserId: 'U-abcdef',
          displayName: 'ゆうき',
          isActive: true,
        }),
      }),
    )
  })

  test('Prisma P2002（他メンバーに紐付き済み）→ 409', async () => {
    mockedFindMember.mockResolvedValue({ id: 'mem-1', isActive: true })
    mockedVerify.mockResolvedValue({ sub: 'U-conflict', name: 'X' })
    mockedUpsert.mockRejectedValue({ code: 'P2002' })
    const res = await POST(
      createRequest('/api/line/link', {
        method: 'POST',
        body: { idToken: 'tok', memberId: 'mem-1' },
      }),
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(409)
  })
})
