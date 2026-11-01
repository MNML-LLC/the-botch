/**
 * /api/otokogi/ranking GET の単体テスト
 *
 * Prisma クライアントを vi.mock でモックし、Route Handler の入出力・year/metric
 * クエリ処理・computeRanking 連携を DB なしで検証する。
 * 実行: npx vitest run tests/otokogi-ranking-route.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, parseResponse } from './helpers'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    member: {
      findMany: vi.fn(),
    },
    otokogiEvent: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/otokogi/ranking/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedMemberFindMany = prisma.member.findMany as unknown as MockFn
const mockedEventFindMany = prisma.otokogiEvent.findMany as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

const SAMPLE_MEMBERS = [
  { id: 'a', name: 'Alice', initial: 'A', colorBg: 'bg-red-100', colorText: 'text-red-700' },
  { id: 'b', name: 'Bob', initial: 'B', colorBg: 'bg-blue-100', colorText: 'text-blue-700' },
]

const SAMPLE_EVENTS = [
  {
    id: 'e1',
    eventDate: new Date('2026-01-01'),
    payerId: 'a',
    amount: 15000,
    participants: [{ memberId: 'a' }, { memberId: 'b' }],
  },
  {
    id: 'e2',
    eventDate: new Date('2026-01-02'),
    payerId: 'b',
    amount: 3000,
    participants: [{ memberId: 'a' }, { memberId: 'b' }],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockedMemberFindMany.mockResolvedValue(SAMPLE_MEMBERS)
  mockedEventFindMany.mockResolvedValue(SAMPLE_EVENTS)
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('GET /api/otokogi/ranking', () => {
  test('デフォルトは metric=total で ranking を返す', async () => {
    const res = await GET(createRequest('/api/otokogi/ranking'))
    const { status, data } = await parseResponse<{
      metric: string
      clutchThreshold: number
      ranking: Array<{
        rank: number
        memberId: string
        totalPaid: number
        otokogiRate: number | null
        clutchRate: number | null
        maxStreak: number
        generosity: number | null
      }>
    }>(res)

    expect(status).toBe(200)
    expect(data.metric).toBe('total')
    expect(data.clutchThreshold).toBe(50000)
    expect(data.ranking).toHaveLength(2)

    // total 順: a が 15000, b が 3000
    expect(data.ranking[0].memberId).toBe('a')
    expect(data.ranking[0].totalPaid).toBe(15000)
    expect(data.ranking[1].memberId).toBe('b')

    // 全指標が含まれていること
    expect(data.ranking[0].otokogiRate).toBeCloseTo(15000 / 18000)
    expect(data.ranking[0].maxStreak).toBe(1)
    expect(data.ranking[0].generosity).toBe(15000)
  })

  test('metric=rate を指定するとレスポンスも rate 順', async () => {
    const res = await GET(createRequest('/api/otokogi/ranking', { searchParams: { metric: 'rate' } }))
    const { status, data } = await parseResponse<{
      metric: string
      ranking: Array<{ memberId: string; otokogiRate: number | null }>
    }>(res)

    expect(status).toBe(200)
    expect(data.metric).toBe('rate')
    // a: 15000/18000 ≈ 0.833, b: 3000/18000 ≈ 0.167
    expect(data.ranking[0].memberId).toBe('a')
  })

  test('不正な metric はデフォルト (total) にフォールバック', async () => {
    const res = await GET(createRequest('/api/otokogi/ranking', { searchParams: { metric: 'bogus' } }))
    const { status, data } = await parseResponse<{ metric: string }>(res)
    expect(status).toBe(200)
    expect(data.metric).toBe('total')
  })

  test('year パラメータは fiscal year (11月開始) の範囲でフィルタ', async () => {
    await GET(createRequest('/api/otokogi/ranking', { searchParams: { year: '2026' } }))

    expect(mockedEventFindMany).toHaveBeenCalledTimes(1)
    const call = mockedEventFindMany.mock.calls[0][0]
    expect(call.where.eventDate.gte.toISOString()).toBe('2025-11-01T00:00:00.000Z')
    expect(call.where.eventDate.lte.toISOString()).toBe('2026-10-31T23:59:59.999Z')
  })

  test('year が YYYY 形式でない場合は現在の fiscal year にフォールバック', async () => {
    await GET(createRequest('/api/otokogi/ranking', { searchParams: { year: 'abcd' } }))
    expect(mockedEventFindMany).toHaveBeenCalledTimes(1)
    const call = mockedEventFindMany.mock.calls[0][0]
    // 不正値は無視し、デフォルト（現在の fiscal year）が適用される
    expect(call.where.eventDate.gte).toBeInstanceOf(Date)
    expect(call.where.eventDate.lte).toBeInstanceOf(Date)
  })

  test('year を省略すると現在の fiscal year がデフォルトで適用される', async () => {
    // システム時刻を 2026-06-15 (fiscal year 2026 内) に固定（タイムゾーン非依存）
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0, 0))
    try {
      await GET(createRequest('/api/otokogi/ranking'))
      expect(mockedEventFindMany).toHaveBeenCalledTimes(1)
      const call = mockedEventFindMany.mock.calls[0][0]
      expect(call.where.eventDate.gte.toISOString()).toBe('2025-11-01T00:00:00.000Z')
      expect(call.where.eventDate.lte.toISOString()).toBe('2026-10-31T23:59:59.999Z')
    } finally {
      vi.useRealTimers()
    }
  })

  test('年度境界 (11月1日) で fiscal year が切り替わる', async () => {
    vi.useFakeTimers()
    // ローカル 2026-11-01 00:00 → month index 10 → fiscal year 2027
    vi.setSystemTime(new Date(2026, 10, 1, 0, 0, 0, 0))
    try {
      await GET(createRequest('/api/otokogi/ranking'))
      const call = mockedEventFindMany.mock.calls[0][0]
      expect(call.where.eventDate.gte.toISOString()).toBe('2026-11-01T00:00:00.000Z')
      expect(call.where.eventDate.lte.toISOString()).toBe('2027-10-31T23:59:59.999Z')
    } finally {
      vi.useRealTimers()
    }
  })

  test('year=all を指定すると日付フィルタなし', async () => {
    await GET(createRequest('/api/otokogi/ranking', { searchParams: { year: 'all' } }))
    expect(mockedEventFindMany).toHaveBeenCalledTimes(1)
    const call = mockedEventFindMany.mock.calls[0][0]
    expect(call.where).toEqual({})
  })

  test('アクティブメンバーのみ取得する', async () => {
    await GET(createRequest('/api/otokogi/ranking'))
    expect(mockedMemberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    )
  })

  test('Cache-Control ヘッダーが付与される', async () => {
    const res = await GET(createRequest('/api/otokogi/ranking'))
    expect(res.headers.get('Cache-Control')).toContain('max-age=60')
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate=300')
  })

  test('Prisma エラー → 500 を返す', async () => {
    mockedEventFindMany.mockRejectedValue(new Error('DB down'))
    const res = await GET(createRequest('/api/otokogi/ranking'))
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(500)
    expect(data.error).toBe('ランキングの取得に失敗しました')
  })
})
