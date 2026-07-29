/**
 * /api/warikan/member-summary GET の単体テスト
 *
 * WarikanSettlement を CLOSED イベントで集計し、ペア単位でネット化して返す
 * ロジックを DB なしで検証する。
 * 実行: npx vitest run tests/warikan-member-summary-route.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, parseResponse } from './helpers'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warikanSettlement: {
      groupBy: vi.fn(),
    },
    warikanEvent: {
      findMany: vi.fn(),
    },
    member: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/warikan/member-summary/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedGroupBy = prisma.warikanSettlement.groupBy as unknown as MockFn
const mockedEventFindMany = prisma.warikanEvent.findMany as unknown as MockFn
const mockedMemberFindMany = prisma.member.findMany as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

const makeMember = (id: string, name: string) => ({
  id,
  name,
  initial: name.charAt(0),
  colorBg: 'bg-gray-100',
  colorText: 'text-gray-700',
})

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('GET /api/warikan/member-summary', () => {
  test('フィルタなし → CLOSED イベントの settlement を集計', async () => {
    mockedGroupBy.mockResolvedValue([
      { fromMemberId: 'a', toMemberId: 'b', _sum: { amount: 1000 } },
      { fromMemberId: 'b', toMemberId: 'c', _sum: { amount: 500 } },
    ])
    // 1回目: eventCount 用、2回目: availableYears 用
    mockedEventFindMany
      .mockResolvedValueOnce([{ id: 'e1' }, { id: 'e2' }])
      .mockResolvedValueOnce([{ createdAt: new Date('2026-05-01') }])
    mockedMemberFindMany.mockResolvedValue([
      makeMember('a', 'A'),
      makeMember('b', 'B'),
      makeMember('c', 'C'),
    ])

    const res = await GET(createRequest('/api/warikan/member-summary'))
    const { status, data } = await parseResponse<{
      members: { id: string }[]
      balances: { fromMemberId: string; toMemberId: string; amount: number }[]
      eventCount: number
      totalAmount: number
      availableYears: number[]
    }>(res)

    expect(status).toBe(200)
    expect(data.eventCount).toBe(2)
    expect(data.totalAmount).toBe(1500)
    expect(data.availableYears).toEqual([2026])
    expect(data.balances).toEqual([
      { fromMemberId: 'a', toMemberId: 'b', amount: 1000 },
      { fromMemberId: 'b', toMemberId: 'c', amount: 500 },
    ])
    // groupBy には CLOSED フィルタが渡っている
    expect(mockedGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          warikanEvent: expect.objectContaining({ status: 'CLOSED' }),
        }),
      })
    )
  })

  test('往復送金は差し引きしてネット化される', async () => {
    // A→B: 1000, B→A: 300 → ネット A→B 700
    mockedGroupBy.mockResolvedValue([
      { fromMemberId: 'a', toMemberId: 'b', _sum: { amount: 1000 } },
      { fromMemberId: 'b', toMemberId: 'a', _sum: { amount: 300 } },
    ])
    mockedEventFindMany
      .mockResolvedValueOnce([{ id: 'e1' }])
      .mockResolvedValueOnce([])
    mockedMemberFindMany.mockResolvedValue([
      makeMember('a', 'A'),
      makeMember('b', 'B'),
    ])

    const res = await GET(createRequest('/api/warikan/member-summary'))
    const { data } = await parseResponse<{
      balances: { fromMemberId: string; toMemberId: string; amount: number }[]
    }>(res)

    expect(data.balances).toHaveLength(1)
    expect(data.balances[0]).toEqual({
      fromMemberId: 'a',
      toMemberId: 'b',
      amount: 700,
    })
  })

  test('ネット・ゼロのペアは balances に含まれない', async () => {
    // A→B: 500, B→A: 500 → ネット 0 → 除外
    mockedGroupBy.mockResolvedValue([
      { fromMemberId: 'a', toMemberId: 'b', _sum: { amount: 500 } },
      { fromMemberId: 'b', toMemberId: 'a', _sum: { amount: 500 } },
    ])
    mockedEventFindMany
      .mockResolvedValueOnce([{ id: 'e1' }])
      .mockResolvedValueOnce([])
    mockedMemberFindMany.mockResolvedValue([])

    const res = await GET(createRequest('/api/warikan/member-summary'))
    const { data } = await parseResponse<{
      balances: unknown[]
      totalAmount: number
    }>(res)

    expect(data.balances).toEqual([])
    expect(data.totalAmount).toBe(0)
  })

  test('ネットが逆方向 → from/to が入れ替わる', async () => {
    // A→B: 200, B→A: 700 → ネット B→A 500
    mockedGroupBy.mockResolvedValue([
      { fromMemberId: 'a', toMemberId: 'b', _sum: { amount: 200 } },
      { fromMemberId: 'b', toMemberId: 'a', _sum: { amount: 700 } },
    ])
    mockedEventFindMany
      .mockResolvedValueOnce([{ id: 'e1' }])
      .mockResolvedValueOnce([])
    mockedMemberFindMany.mockResolvedValue([
      makeMember('a', 'A'),
      makeMember('b', 'B'),
    ])

    const res = await GET(createRequest('/api/warikan/member-summary'))
    const { data } = await parseResponse<{
      balances: { fromMemberId: string; toMemberId: string; amount: number }[]
    }>(res)

    expect(data.balances).toEqual([
      { fromMemberId: 'b', toMemberId: 'a', amount: 500 },
    ])
  })

  test('複数ペアは amount 降順で返る', async () => {
    mockedGroupBy.mockResolvedValue([
      { fromMemberId: 'a', toMemberId: 'b', _sum: { amount: 100 } },
      { fromMemberId: 'c', toMemberId: 'd', _sum: { amount: 5000 } },
      { fromMemberId: 'e', toMemberId: 'f', _sum: { amount: 1200 } },
    ])
    mockedEventFindMany
      .mockResolvedValueOnce([{ id: 'e1' }])
      .mockResolvedValueOnce([])
    mockedMemberFindMany.mockResolvedValue([])

    const res = await GET(createRequest('/api/warikan/member-summary'))
    const { data } = await parseResponse<{
      balances: { amount: number }[]
    }>(res)

    expect(data.balances.map((b) => b.amount)).toEqual([5000, 1200, 100])
  })

  test('year 指定 → CLOSED + createdAt 範囲が where に反映される', async () => {
    mockedGroupBy.mockResolvedValue([])
    mockedEventFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mockedMemberFindMany.mockResolvedValue([])

    await GET(createRequest('/api/warikan/member-summary', { searchParams: { year: '2025' } }))

    const groupByArgs = mockedGroupBy.mock.calls[0][0] as {
      where: {
        warikanEvent: {
          status: string
          createdAt: { gte: Date; lt: Date }
        }
      }
    }
    expect(groupByArgs.where.warikanEvent.status).toBe('CLOSED')
    expect(groupByArgs.where.warikanEvent.createdAt.gte).toEqual(
      new Date('2025-01-01T00:00:00.000Z')
    )
    expect(groupByArgs.where.warikanEvent.createdAt.lt).toEqual(
      new Date('2026-01-01T00:00:00.000Z')
    )
  })

  test('year が不正 → 400', async () => {
    const res = await GET(
      createRequest('/api/warikan/member-summary', { searchParams: { year: 'abc' } })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toBeDefined()
  })

  test('availableYears は CLOSED イベントに現れた年の降順一意リスト', async () => {
    mockedGroupBy.mockResolvedValue([])
    mockedEventFindMany
      .mockResolvedValueOnce([]) // eventCount 用
      .mockResolvedValueOnce([
        { createdAt: new Date('2024-06-01T00:00:00.000Z') },
        { createdAt: new Date('2026-01-15T00:00:00.000Z') },
        { createdAt: new Date('2024-11-20T00:00:00.000Z') },
        { createdAt: new Date('2025-07-10T00:00:00.000Z') },
      ])
    mockedMemberFindMany.mockResolvedValue([])

    const res = await GET(createRequest('/api/warikan/member-summary'))
    const { data } = await parseResponse<{ availableYears: number[] }>(res)

    expect(data.availableYears).toEqual([2026, 2025, 2024])
  })

  test('members は balances に登場する ID のみ取得される', async () => {
    mockedGroupBy.mockResolvedValue([
      { fromMemberId: 'a', toMemberId: 'b', _sum: { amount: 1000 } },
    ])
    mockedEventFindMany
      .mockResolvedValueOnce([{ id: 'e1' }])
      .mockResolvedValueOnce([])
    mockedMemberFindMany.mockResolvedValue([
      makeMember('a', 'A'),
      makeMember('b', 'B'),
    ])

    await GET(createRequest('/api/warikan/member-summary'))

    const memberArgs = mockedMemberFindMany.mock.calls[0][0] as {
      where: { id: { in: string[] } }
    }
    expect(memberArgs.where.id.in.sort()).toEqual(['a', 'b'])
  })

  test('collections が空 → member.findMany は呼ばれない', async () => {
    mockedGroupBy.mockResolvedValue([])
    mockedEventFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await GET(createRequest('/api/warikan/member-summary'))
    const { status, data } = await parseResponse<{
      members: unknown[]
      balances: unknown[]
    }>(res)

    expect(status).toBe(200)
    expect(data.members).toEqual([])
    expect(data.balances).toEqual([])
    expect(mockedMemberFindMany).not.toHaveBeenCalled()
  })

  test('_sum.amount が null のペアはスキップされる', async () => {
    mockedGroupBy.mockResolvedValue([
      { fromMemberId: 'a', toMemberId: 'b', _sum: { amount: null } },
      { fromMemberId: 'c', toMemberId: 'd', _sum: { amount: 800 } },
    ])
    mockedEventFindMany
      .mockResolvedValueOnce([{ id: 'e1' }])
      .mockResolvedValueOnce([])
    mockedMemberFindMany.mockResolvedValue([
      makeMember('c', 'C'),
      makeMember('d', 'D'),
    ])

    const res = await GET(createRequest('/api/warikan/member-summary'))
    const { data } = await parseResponse<{
      balances: { fromMemberId: string; toMemberId: string; amount: number }[]
    }>(res)

    expect(data.balances).toEqual([
      { fromMemberId: 'c', toMemberId: 'd', amount: 800 },
    ])
  })

  test('groupBy が throw → 500 とエラーメッセージ', async () => {
    mockedGroupBy.mockRejectedValue(new Error('DB down'))
    mockedEventFindMany.mockResolvedValue([])

    const res = await GET(createRequest('/api/warikan/member-summary'))
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('累積サマリーの取得に失敗しました')
  })
})
