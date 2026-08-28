/**
 * POST /api/warikan/settlement-report の単体テスト
 *
 * - Bearer 認証: NOTIFY_API_TOKEN 未設定 or 不一致 → 401
 * - period パラメータ不正 → 400
 * - SLACK_WEBHOOK_URL 未設定 → slackSent:false で 200
 * - SLACK_WEBHOOK_URL 設定時 → Slack 送信が呼ばれる
 * - 完了率計算（closed / total × 100、小数1桁）
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, parseResponse } from './helpers'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warikanEvent: {
      groupBy: vi.fn(),
    },
    warikanSettlement: {
      aggregate: vi.fn(),
    },
  },
}))

vi.mock('@/lib/slack/slackService', () => ({
  sendSlackMessage: vi.fn(),
  isSlackWebhookEnabled: vi.fn(() => false),
}))

import { prisma } from '@/lib/prisma'
import {
  sendSlackMessage,
  isSlackWebhookEnabled,
} from '@/lib/slack/slackService'
import { POST } from '@/app/api/warikan/settlement-report/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedGroupBy = prisma.warikanEvent.groupBy as unknown as MockFn
const mockedAggregate = prisma.warikanSettlement.aggregate as unknown as MockFn
const mockedSend = sendSlackMessage as unknown as MockFn
const mockedEnabled = isSlackWebhookEnabled as unknown as MockFn

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

function bearerRequest(period: string | null, token = 'test-token') {
  const path = period
    ? `/api/warikan/settlement-report?period=${period}`
    : '/api/warikan/settlement-report'
  const req = createRequest(path, { method: 'POST' })
  req.headers.set('authorization', `Bearer ${token}`)
  return req
}

describe('POST /api/warikan/settlement-report — 認証', () => {
  test('NOTIFY_API_TOKEN 未設定 → 401', async () => {
    delete process.env.NOTIFY_API_TOKEN
    const req = bearerRequest('weekly', 'whatever')
    const res = await POST(req)
    const { status } = await parseResponse(res)
    expect(status).toBe(401)
    expect(mockedGroupBy).not.toHaveBeenCalled()
  })

  test('Bearer ヘッダー無し → 401', async () => {
    const req = createRequest('/api/warikan/settlement-report?period=weekly', {
      method: 'POST',
    })
    const res = await POST(req)
    const { status } = await parseResponse(res)
    expect(status).toBe(401)
    expect(mockedGroupBy).not.toHaveBeenCalled()
  })

  test('Bearer トークン不一致 → 401', async () => {
    const req = bearerRequest('weekly', 'wrong')
    const res = await POST(req)
    const { status } = await parseResponse(res)
    expect(status).toBe(401)
    expect(mockedGroupBy).not.toHaveBeenCalled()
  })
})

describe('POST /api/warikan/settlement-report — バリデーション', () => {
  test('period 未指定 → 400', async () => {
    const req = bearerRequest(null)
    const res = await POST(req)
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('period')
    expect(mockedGroupBy).not.toHaveBeenCalled()
  })

  test('period 不正値 → 400', async () => {
    const req = bearerRequest('yearly')
    const res = await POST(req)
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedGroupBy).not.toHaveBeenCalled()
  })
})

describe('POST /api/warikan/settlement-report — 集計', () => {
  test('データゼロ → 完了率 0%、slackSent:false、200', async () => {
    mockedGroupBy.mockResolvedValue([])
    mockedAggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { amount: null },
    })

    const req = bearerRequest('weekly')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      summary: {
        period: string
        totalCount: number
        completionRate: number
        unpaidSettlementCount: number
        unpaidSettlementAmount: number
      }
      slackSent: boolean
      slackEnabled: boolean
    }>(res)

    expect(status).toBe(200)
    expect(data.summary.period).toBe('weekly')
    expect(data.summary.totalCount).toBe(0)
    expect(data.summary.completionRate).toBe(0)
    expect(data.summary.unpaidSettlementCount).toBe(0)
    expect(data.summary.unpaidSettlementAmount).toBe(0)
    expect(data.slackSent).toBe(false)
    expect(data.slackEnabled).toBe(false)
    expect(mockedSend).not.toHaveBeenCalled()
  })

  test('完了率が正しく計算される（closed 2 / total 5 = 40.0%）', async () => {
    mockedGroupBy.mockResolvedValue([
      { status: 'ENTERING', _count: { _all: 1 } },
      { status: 'PAYING', _count: { _all: 2 } },
      { status: 'CLOSED', _count: { _all: 2 } },
    ])
    mockedAggregate.mockResolvedValue({
      _count: { _all: 3 },
      _sum: { amount: 12345 },
    })

    const req = bearerRequest('monthly')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      summary: {
        totalCount: number
        enteringCount: number
        payingCount: number
        closedCount: number
        completionRate: number
        unpaidSettlementCount: number
        unpaidSettlementAmount: number
      }
    }>(res)

    expect(status).toBe(200)
    expect(data.summary.totalCount).toBe(5)
    expect(data.summary.enteringCount).toBe(1)
    expect(data.summary.payingCount).toBe(2)
    expect(data.summary.closedCount).toBe(2)
    expect(data.summary.completionRate).toBe(40)
    expect(data.summary.unpaidSettlementCount).toBe(3)
    expect(data.summary.unpaidSettlementAmount).toBe(12345)
  })

  test('完了率が小数1桁で丸められる（1 / 3 = 33.3%）', async () => {
    mockedGroupBy.mockResolvedValue([
      { status: 'ENTERING', _count: { _all: 1 } },
      { status: 'PAYING', _count: { _all: 1 } },
      { status: 'CLOSED', _count: { _all: 1 } },
    ])
    mockedAggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { amount: null },
    })

    const req = bearerRequest('weekly')
    const res = await POST(req)
    const { data } = await parseResponse<{
      summary: { completionRate: number }
    }>(res)

    expect(data.summary.completionRate).toBe(33.3)
  })

  test('SLACK_WEBHOOK_URL 設定時: sendSlackMessage が呼ばれ slackSent:true', async () => {
    mockedGroupBy.mockResolvedValue([
      { status: 'CLOSED', _count: { _all: 1 } },
    ])
    mockedAggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { amount: null },
    })
    mockedEnabled.mockReturnValue(true)
    mockedSend.mockResolvedValue({ sent: true })

    const req = bearerRequest('weekly')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      slackSent: boolean
      slackEnabled: boolean
    }>(res)

    expect(status).toBe(200)
    expect(data.slackSent).toBe(true)
    expect(data.slackEnabled).toBe(true)
    expect(mockedSend).toHaveBeenCalledTimes(1)
    const call = mockedSend.mock.calls[0]?.[0] as {
      text: string
      blocks: unknown[]
    }
    expect(call.text).toContain('週次')
    expect(call.text).toContain('割り勘 精算レポート')
    expect(Array.isArray(call.blocks)).toBe(true)
    expect(call.blocks.length).toBeGreaterThan(0)
  })

  test('Slack 送信例外 → 200 & slackSent:false（エラーにはしない）', async () => {
    mockedGroupBy.mockResolvedValue([])
    mockedAggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { amount: null },
    })
    mockedEnabled.mockReturnValue(true)
    mockedSend.mockRejectedValue(new Error('Slack down'))

    const req = bearerRequest('monthly')
    const res = await POST(req)
    const { status, data } = await parseResponse<{
      slackSent: boolean
      slackEnabled: boolean
    }>(res)

    expect(status).toBe(200)
    expect(data.slackSent).toBe(false)
    expect(data.slackEnabled).toBe(true)
  })

  test('Prisma 例外 → 500 + fallbackMessage', async () => {
    mockedGroupBy.mockRejectedValue(new Error('DB error'))

    const req = bearerRequest('weekly')
    const res = await POST(req)
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('割り勘精算レポートの集計に失敗しました')
  })
})
