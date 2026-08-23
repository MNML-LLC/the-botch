/**
 * POST /api/line/notify-unpaid の単体テスト
 *
 * - Bearer 認証: NOTIFY_API_TOKEN 未設定 or 不一致 → 401
 * - LINE_CHANNEL_ACCESS_TOKEN 未設定 → LINE 送信スキップ扱いで 200
 * - MemberLineAccount 未登録メンバーはスキップ、エラーにしない
 * - 未払いなし → 200 + sentCount:0
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, parseResponse } from './helpers'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warikanSettlement: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/line/lineService', () => ({
  sendIndividualMessage: vi.fn(),
  isLineMessagingEnabled: vi.fn(() => false),
}))

import { prisma } from '@/lib/prisma'
import {
  sendIndividualMessage,
  isLineMessagingEnabled,
} from '@/lib/line/lineService'
import { POST } from '@/app/api/line/notify-unpaid/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedFindMany = prisma.warikanSettlement.findMany as unknown as MockFn
const mockedSend = sendIndividualMessage as unknown as MockFn
const mockedEnabled = isLineMessagingEnabled as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>
let consoleWarnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  process.env.NOTIFY_API_TOKEN = 'test-token'
  mockedEnabled.mockReturnValue(false)
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
  consoleWarnSpy.mockRestore()
  delete process.env.NOTIFY_API_TOKEN
})

function bearer(token: string) {
  const req = createRequest('/api/line/notify-unpaid', { method: 'POST' })
  req.headers.set('authorization', `Bearer ${token}`)
  return req
}

describe('POST /api/line/notify-unpaid — 認証', () => {
  test('NOTIFY_API_TOKEN 未設定 → 401', async () => {
    delete process.env.NOTIFY_API_TOKEN
    const req = createRequest('/api/line/notify-unpaid', { method: 'POST' })
    req.headers.set('authorization', 'Bearer whatever')
    const res = await POST(req)
    const { status } = await parseResponse(res)
    expect(status).toBe(401)
    expect(mockedFindMany).not.toHaveBeenCalled()
  })

  test('Bearer ヘッダー無し → 401', async () => {
    const req = createRequest('/api/line/notify-unpaid', { method: 'POST' })
    const res = await POST(req)
    const { status } = await parseResponse(res)
    expect(status).toBe(401)
    expect(mockedFindMany).not.toHaveBeenCalled()
  })

  test('Bearer トークン不一致 → 401', async () => {
    const req = createRequest('/api/line/notify-unpaid', { method: 'POST' })
    req.headers.set('authorization', 'Bearer wrong')
    const res = await POST(req)
    const { status } = await parseResponse(res)
    expect(status).toBe(401)
    expect(mockedFindMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/line/notify-unpaid — 挙動', () => {
  test('未払いゼロ → 200 & sentCount:0 & LINE 呼ばれない', async () => {
    mockedFindMany.mockResolvedValue([])

    const req = bearer('test-token')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      sentCount: number
      targetMemberCount: number
      linkedMemberCount: number
      skippedCount: number
    }>(res)

    expect(status).toBe(200)
    expect(data.sentCount).toBe(0)
    expect(data.targetMemberCount).toBe(0)
    expect(data.linkedMemberCount).toBe(0)
    expect(mockedSend).not.toHaveBeenCalled()
  })

  test('LINE 未連携メンバーはスキップされる（sent されない）', async () => {
    mockedFindMany.mockResolvedValue([
      {
        amount: 1000,
        warikanEvent: { eventName: '飲み会', displayDate: new Date('2026-08-01') },
        fromMember: {
          id: 'm-nolinke',
          name: 'ゆうき',
          lineAccount: null,
        },
        toMember: { name: 'ゆうへい' },
      },
    ])

    const req = bearer('test-token')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      targetMemberCount: number
      linkedMemberCount: number
      sentCount: number
      skippedCount: number
    }>(res)

    expect(status).toBe(200)
    expect(data.targetMemberCount).toBe(1)
    expect(data.linkedMemberCount).toBe(0)
    expect(data.sentCount).toBe(0)
    expect(data.skippedCount).toBe(1)
    expect(mockedSend).not.toHaveBeenCalled()
  })

  test('LINE 連携済み × TOKEN 未設定 → 送信スキップ扱い、200', async () => {
    mockedFindMany.mockResolvedValue([
      {
        amount: 500,
        warikanEvent: { eventName: 'ボール', displayDate: new Date('2026-08-02') },
        fromMember: {
          id: 'm-linked',
          name: 'ゆうき',
          lineAccount: { lineUserId: 'U1234', isActive: true },
        },
        toMember: { name: 'ゆうへい' },
      },
    ])
    // 送信ユーティリティ側で TOKEN 未設定 → { sent: false } を返す
    mockedSend.mockResolvedValue({ sent: false })
    mockedEnabled.mockReturnValue(false)

    const req = bearer('test-token')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      sentCount: number
      skippedCount: number
      linkedMemberCount: number
      lineMessagingEnabled: boolean
    }>(res)

    expect(status).toBe(200)
    expect(data.sentCount).toBe(0)
    expect(data.skippedCount).toBe(1)
    expect(data.linkedMemberCount).toBe(1)
    expect(data.lineMessagingEnabled).toBe(false)
    expect(mockedSend).toHaveBeenCalledTimes(1)
  })

  test('連携済みメンバーへ送信 → 200 & sentCount:1 & メッセージ内に金額/イベント名', async () => {
    mockedFindMany.mockResolvedValue([
      {
        amount: 1200,
        warikanEvent: { eventName: 'BBQ', displayDate: new Date('2026-08-10') },
        fromMember: {
          id: 'm-1',
          name: 'ゆうき',
          lineAccount: { lineUserId: 'U-yuki', isActive: true },
        },
        toMember: { name: 'ゆうへい' },
      },
      {
        amount: 800,
        warikanEvent: { eventName: 'カラオケ', displayDate: new Date('2026-08-15') },
        fromMember: {
          id: 'm-1',
          name: 'ゆうき',
          lineAccount: { lineUserId: 'U-yuki', isActive: true },
        },
        toMember: { name: 'たかし' },
      },
    ])
    mockedSend.mockResolvedValue({ sent: true })
    mockedEnabled.mockReturnValue(true)

    const req = bearer('test-token')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      sentCount: number
      linkedMemberCount: number
      skippedCount: number
    }>(res)

    expect(status).toBe(200)
    expect(data.sentCount).toBe(1)
    expect(data.linkedMemberCount).toBe(1)
    expect(data.skippedCount).toBe(0)

    expect(mockedSend).toHaveBeenCalledTimes(1)
    const [userId, message] = mockedSend.mock.calls[0] as [string, string]
    expect(userId).toBe('U-yuki')
    expect(message).toContain('ゆうき')
    expect(message).toContain('BBQ')
    expect(message).toContain('カラオケ')
    expect(message).toContain('2,000')
  })

  test('連携無効（isActive=false）のメンバーはスキップ', async () => {
    mockedFindMany.mockResolvedValue([
      {
        amount: 500,
        warikanEvent: { eventName: 'イベント', displayDate: null },
        fromMember: {
          id: 'm-x',
          name: 'X',
          lineAccount: { lineUserId: 'U-x', isActive: false },
        },
        toMember: { name: 'Y' },
      },
    ])

    const req = bearer('test-token')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      sentCount: number
      skippedCount: number
    }>(res)

    expect(status).toBe(200)
    expect(data.sentCount).toBe(0)
    expect(data.skippedCount).toBe(1)
    expect(mockedSend).not.toHaveBeenCalled()
  })

  test('sendIndividualMessage が例外を投げてもレスポンスは 200 で errors に含まれる', async () => {
    mockedFindMany.mockResolvedValue([
      {
        amount: 100,
        warikanEvent: { eventName: 'E', displayDate: null },
        fromMember: {
          id: 'm-1',
          name: 'A',
          lineAccount: { lineUserId: 'U-a', isActive: true },
        },
        toMember: { name: 'B' },
      },
    ])
    mockedSend.mockRejectedValue(new Error('LINE API 500'))
    mockedEnabled.mockReturnValue(true)

    const req = bearer('test-token')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      sentCount: number
      errors: Array<{ memberId: string; message: string }>
    }>(res)

    expect(status).toBe(200)
    expect(data.sentCount).toBe(0)
    expect(data.errors).toHaveLength(1)
    expect(data.errors[0]?.memberId).toBe('m-1')
  })

  test('Prisma が例外を投げる → 500 + fallbackMessage', async () => {
    mockedFindMany.mockRejectedValue(new Error('DB error'))

    const req = bearer('test-token')
    const res = await POST(req)
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('LINE 未払い通知に失敗しました')
  })
})
