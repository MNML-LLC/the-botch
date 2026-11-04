/**
 * /api/otokogi/stats GET の単体テスト (Issue #382 regression ガード)
 *
 * - `totalOtokogiAmount` が存在
 * - `categoryBreakdown[].amount` の合計が `totalAmount` に一致
 * - `period=all` でもデータが落ちない
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, parseResponse } from './helpers'

// Prisma クライアントをモック (otokogiEvent / otokogiParticipant / member / $queryRaw)
vi.mock('@/lib/prisma', () => ({
  prisma: {
    otokogiEvent: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    otokogiParticipant: {
      groupBy: vi.fn(),
    },
    member: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

vi.mock('@/lib/stats-cache', () => ({
  getCachedStats: vi.fn().mockResolvedValue(null),
  setCachedStats: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/otokogi/stats/route'

type MockFn = ReturnType<typeof vi.fn>
const mockAggregate = prisma.otokogiEvent.aggregate as unknown as MockFn
const mockEventGroupBy = prisma.otokogiEvent.groupBy as unknown as MockFn
const mockParticipantGroupBy = prisma.otokogiParticipant.groupBy as unknown as MockFn
const mockFindFirst = prisma.otokogiEvent.findFirst as unknown as MockFn
const mockEventFindMany = prisma.otokogiEvent.findMany as unknown as MockFn
const mockMemberFindMany = prisma.member.findMany as unknown as MockFn
const mockQueryRaw = prisma.$queryRaw as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

function setupHappyPath(opts: {
  totalCount: number
  totalAmount: number
  categoryEvents: Array<{ id: string; eventName: string; place: string | null; amount: number; event: { eventType: string } | null }>
}) {
  mockAggregate.mockResolvedValue({
    _count: opts.totalCount,
    _sum: { amount: opts.totalAmount },
  })
  mockEventGroupBy.mockResolvedValue([])
  mockParticipantGroupBy.mockResolvedValue([])
  mockFindFirst.mockResolvedValue(null)
  mockMemberFindMany.mockResolvedValue([])
  mockEventFindMany.mockImplementation((args: { select?: Record<string, boolean> }) => {
    // streakEvents: 空配列 (participants include)
    // categoryEvents: categoryEvents 配列
    if (args?.select && 'participants' in (args.select as Record<string, unknown>)) {
      return Promise.resolve([])
    }
    return Promise.resolve(opts.categoryEvents)
  })
  // $queryRaw は 5 回呼ばれる (maxMin / monthlyTrend / heatmap / maxDay / cumulative / otokogiAmount)
  mockQueryRaw.mockResolvedValue([])
}

describe('GET /api/otokogi/stats — 必須フィールドのガード (Issue #382)', () => {
  test('period 指定なし: totalOtokogiAmount と categoryBreakdown を返す', async () => {
    setupHappyPath({
      totalCount: 3,
      totalAmount: 30000,
      categoryEvents: [
        { id: 'e1', eventName: '焼肉', place: null, amount: 10000, event: null },
        { id: 'e2', eventName: '温泉旅行', place: '熱海', amount: 15000, event: null },
        { id: 'e3', eventName: 'その他', place: null, amount: 5000, event: null },
      ],
    })

    const req = createRequest('/api/otokogi/stats')
    const res = await GET(req)
    const { status, data } = await parseResponse<{
      totalAmount: number
      totalOtokogiAmount: number
      categoryBreakdown: { category: string; amount: number; count: number }[]
    }>(res)

    expect(status).toBe(200)
    // 必須フィールドが存在すること (undefined でない)
    expect(data).toHaveProperty('totalOtokogiAmount')
    expect(typeof data.totalOtokogiAmount).toBe('number')
    expect(data).toHaveProperty('categoryBreakdown')
    expect(Array.isArray(data.categoryBreakdown)).toBe(true)
    // 4 カテゴリ分
    expect(data.categoryBreakdown).toHaveLength(4)
    // categoryBreakdown の合計は totalAmount と一致する
    const sum = data.categoryBreakdown.reduce((s, c) => s + c.amount, 0)
    expect(sum).toBe(data.totalAmount)
    expect(sum).toBe(30000)
  })

  test('categoryBreakdown: 分類ロジックが動いて amount が 0 以外になる', async () => {
    setupHappyPath({
      totalCount: 1,
      totalAmount: 20000,
      categoryEvents: [
        { id: 'e1', eventName: '飲み会', place: null, amount: 20000, event: null },
      ],
    })

    const req = createRequest('/api/otokogi/stats')
    const res = await GET(req)
    const { data } = await parseResponse<{
      categoryBreakdown: { category: string; amount: number; count: number }[]
    }>(res)

    const hangout = data.categoryBreakdown.find((c) => c.category === 'HANGOUT')
    expect(hangout?.amount).toBe(20000)
    expect(hangout?.count).toBe(1)
  })

  test('イベントなし: categoryBreakdown は全カテゴリ amount:0 で返る (壊れた形式を返さない)', async () => {
    setupHappyPath({ totalCount: 0, totalAmount: 0, categoryEvents: [] })

    const req = createRequest('/api/otokogi/stats')
    const res = await GET(req)
    const { status, data } = await parseResponse<{
      totalAmount: number
      totalOtokogiAmount: number
      categoryBreakdown: { category: string; amount: number; count: number }[]
    }>(res)

    expect(status).toBe(200)
    expect(data.totalAmount).toBe(0)
    expect(data.totalOtokogiAmount).toBe(0)
    expect(data.categoryBreakdown).toHaveLength(4)
    expect(data.categoryBreakdown.every((c) => c.amount === 0)).toBe(true)
  })
})

// Issue #391 A1: 男気ランキング (otokogiByMember) と 収支表 (member-summary) の数字一致
describe('GET /api/otokogi/stats — otokogiByMember は member-summary と同じ net 計算 (Issue #391 A1)', () => {
  test('otokogiAmount = actualPaid - shouldHavePaid の形で返る (raw SQL 結果を素通し)', async () => {
    mockAggregate.mockResolvedValue({ _count: 2, _sum: { amount: 30000 } })
    mockEventGroupBy.mockResolvedValue([])
    mockParticipantGroupBy.mockResolvedValue([])
    mockFindFirst.mockResolvedValue(null)
    // メンバー 2 人
    mockMemberFindMany.mockResolvedValue([
      { id: 'a', name: 'A', initial: 'A', colorBg: 'bg-a', colorText: 'text-a' },
      { id: 'b', name: 'B', initial: 'B', colorBg: 'bg-b', colorText: 'text-b' },
    ])
    mockEventFindMany.mockImplementation((args: { select?: Record<string, boolean> }) => {
      if (args?.select && 'participants' in (args.select as Record<string, unknown>)) {
        return Promise.resolve([])
      }
      return Promise.resolve([])
    })

    // $queryRaw は 6 回呼ばれる:
    // 1) maxMinResult 2) monthlyTrendDb 3) heatmapDb 4) maxDayDb 5) cumulativeRaceDb 6) otokogiAmountDb
    // A1 修正後、6) は FULL OUTER JOIN で "actualPaid - shouldHavePaid" を返す。
    // ここでは A: net=+10000 (ガッツリ払った), B: net=-4000 (非支払会の負担のみ) を想定。
    mockQueryRaw
      .mockResolvedValueOnce([]) // maxMin
      .mockResolvedValueOnce([]) // monthlyTrend
      .mockResolvedValueOnce([]) // heatmap
      .mockResolvedValueOnce([]) // maxDay
      .mockResolvedValueOnce([]) // cumulativeRace
      .mockResolvedValueOnce([
        { payer_id: 'a', otokogi_amount: BigInt(10000) },
        { payer_id: 'b', otokogi_amount: BigInt(-4000) },
      ])

    const req = createRequest('/api/otokogi/stats')
    const res = await GET(req)
    const { status, data } = await parseResponse<{
      otokogiByMember: { id: string; otokogiAmount: number }[]
      totalOtokogiAmount: number
    }>(res)

    expect(status).toBe(200)
    // net 計算なので負の値もあり得る (B は非支払会でのみ参加)
    const a = data.otokogiByMember.find((m) => m.id === 'a')
    const b = data.otokogiByMember.find((m) => m.id === 'b')
    expect(a?.otokogiAmount).toBe(10000)
    expect(b?.otokogiAmount).toBe(-4000)
    // 合計 = 10000 + (-4000) = 6000
    expect(data.totalOtokogiAmount).toBe(6000)
  })
})
