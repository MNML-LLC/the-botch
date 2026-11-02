/**
 * /api/otokogi/member-summary GET の単体テスト（じゃんけん勝率計算 重点）
 *
 * 実行: npx vitest run tests/otokogi-member-summary-route.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, parseResponse } from './helpers'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    member: {
      findMany: vi.fn(),
    },
    otokogiEvent: {
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    otokogiParticipant: {
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/otokogi/member-summary/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedMemberFindMany = prisma.member.findMany as unknown as MockFn
const mockedEventGroupBy = prisma.otokogiEvent.groupBy as unknown as MockFn
const mockedEventCount = prisma.otokogiEvent.count as unknown as MockFn
const mockedParticipantGroupBy = prisma.otokogiParticipant.groupBy as unknown as MockFn
const mockedQueryRaw = prisma.$queryRaw as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

/**
 * groupBy / count は複数の呼び出し順序に依存するため、
 * ルート内の Promise.all の順序に合わせて mockImplementationOnce で返り値を仕込む。
 *
 * ルート内の順序（member-summary/route.ts 参照）:
 *   otokogiEvent.groupBy:
 *     1) payerStats           (全体の payer 集計)
 *     2) jankenLostStats      (janken 対象のみ)
 *   otokogiParticipant.groupBy:
 *     1) participationStats   (全体の参加集計)
 *     2) jankenParticipationStats (janken 対象のみ)
 *   otokogiEvent.count:
 *     1) jankenEventCount
 *   $queryRaw:
 *     1) shouldHavePaidRows
 *     2) maxSingleOtokogiRows
 */
function setupMocks(options: {
  members?: Array<{ id: string; name: string }>
  payerStats?: Array<{ payerId: string; _count: number; _sum: { amount: number } }>
  participationStats?: Array<{ memberId: string; _count: number }>
  jankenParticipationStats?: Array<{ memberId: string; _count: number }>
  jankenLostStats?: Array<{ payerId: string; _count: number }>
  jankenEventCount?: number
}) {
  mockedMemberFindMany.mockResolvedValue(
    options.members ?? [
      { id: 'a', name: 'ゆうき' },
      { id: 'b', name: 'ゆうへい' },
      { id: 'c', name: 'たく' },
    ]
  )
  mockedEventGroupBy
    .mockResolvedValueOnce(options.payerStats ?? [])
    .mockResolvedValueOnce(options.jankenLostStats ?? [])
  mockedParticipantGroupBy
    .mockResolvedValueOnce(options.participationStats ?? [])
    .mockResolvedValueOnce(options.jankenParticipationStats ?? [])
  mockedEventCount.mockResolvedValue(options.jankenEventCount ?? 0)
  mockedQueryRaw
    .mockResolvedValueOnce([]) // shouldHavePaidRows
    .mockResolvedValueOnce([]) // maxSingleOtokogiRows
}

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('GET /api/otokogi/member-summary — じゃんけん勝率', () => {
  test('janken 対象イベントが 0 件なら hasJankenData=false、全員 jankenWinRate=null', async () => {
    setupMocks({ jankenEventCount: 0 })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { status, data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
      hasJankenData: boolean
    }>(res)

    expect(status).toBe(200)
    expect(data.hasJankenData).toBe(false)
    expect(data.members.every((m) => m.jankenWinRate === null)).toBe(true)
  })

  test('janken 参加 0 件のメンバーは jankenWinRate=null になる', async () => {
    setupMocks({
      jankenEventCount: 2,
      // a は 2 回参加 / 1 回負け、b は参加なし
      jankenParticipationStats: [{ memberId: 'a', _count: 2 }],
      jankenLostStats: [{ payerId: 'a', _count: 1 }],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
      hasJankenData: boolean
    }>(res)

    expect(data.hasJankenData).toBe(true)
    const a = data.members.find((m) => m.memberId === 'a')
    const b = data.members.find((m) => m.memberId === 'b')
    expect(a?.jankenWinRate).toBe(0.5) // (2 - 1) / 2
    expect(b?.jankenWinRate).toBeNull()
  })

  test('全勝: 参加 3 回 / 負け 0 回 → 1.0', async () => {
    setupMocks({
      jankenEventCount: 3,
      jankenParticipationStats: [{ memberId: 'a', _count: 3 }],
      jankenLostStats: [], // a は 1 度も payer にならなかった
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
    }>(res)

    expect(data.members.find((m) => m.memberId === 'a')?.jankenWinRate).toBe(1)
  })

  test('全敗: 参加 3 回 / 負け 3 回 → 0.0', async () => {
    setupMocks({
      jankenEventCount: 3,
      jankenParticipationStats: [{ memberId: 'a', _count: 3 }],
      jankenLostStats: [{ payerId: 'a', _count: 3 }],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
    }>(res)

    expect(data.members.find((m) => m.memberId === 'a')?.jankenWinRate).toBe(0)
  })

  test('半々: 参加 4 回 / 負け 2 回 → 0.5', async () => {
    setupMocks({
      jankenEventCount: 4,
      jankenParticipationStats: [{ memberId: 'a', _count: 4 }],
      jankenLostStats: [{ payerId: 'a', _count: 2 }],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
    }>(res)

    expect(data.members.find((m) => m.memberId === 'a')?.jankenWinRate).toBe(0.5)
  })

  test('複数メンバー同時: それぞれ独立に計算される', async () => {
    setupMocks({
      jankenEventCount: 6,
      // a: 6回参加/0敗 (全勝), b: 6回参加/6敗 (全敗), c: 6回参加/3敗 (半々)
      jankenParticipationStats: [
        { memberId: 'a', _count: 6 },
        { memberId: 'b', _count: 6 },
        { memberId: 'c', _count: 6 },
      ],
      jankenLostStats: [
        { payerId: 'b', _count: 6 },
        { payerId: 'c', _count: 3 },
      ],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
      hasJankenData: boolean
    }>(res)

    expect(data.hasJankenData).toBe(true)
    expect(data.members.find((m) => m.memberId === 'a')?.jankenWinRate).toBe(1)
    expect(data.members.find((m) => m.memberId === 'b')?.jankenWinRate).toBe(0)
    expect(data.members.find((m) => m.memberId === 'c')?.jankenWinRate).toBe(0.5)
  })
})
