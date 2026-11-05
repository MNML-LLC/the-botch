/**
 * /api/otokogi/member-summary GET の単体テスト（じゃんけん勝率計算 重点）
 *
 * CEO ルール「勝った人が奢る」:
 *   jankenWinRate = payerCount (じゃんけん勝利 = 支払い) / jankenParticipation
 *   Issue #407 で (participated - lost) / participated から反転
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
 *     3) clutchStats          (¥50,000 以上の payer 集計、Issue #354)
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
  clutchStats?: Array<{ payerId: string; _count: number; _sum: { amount: number } }>
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
    .mockResolvedValueOnce(options.clutchStats ?? [])
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
      // a は 2 回参加 / 1 回 payer (= 1 勝)、b は参加なし
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
    expect(a?.jankenWinRate).toBe(0.5) // 1 / 2
    expect(b?.jankenWinRate).toBeNull()
  })

  test('全勝: 参加 3 回 / payer 3 回 → 1.0 (CEO ルール: 勝った人が奢る)', async () => {
    setupMocks({
      jankenEventCount: 3,
      jankenParticipationStats: [{ memberId: 'a', _count: 3 }],
      jankenLostStats: [{ payerId: 'a', _count: 3 }], // 3 回全部勝って奢った
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
    }>(res)

    expect(data.members.find((m) => m.memberId === 'a')?.jankenWinRate).toBe(1)
  })

  test('全敗: 参加 3 回 / payer 0 回 → 0.0 (CEO ルール: 一度も勝って奢っていない)', async () => {
    setupMocks({
      jankenEventCount: 3,
      jankenParticipationStats: [{ memberId: 'a', _count: 3 }],
      jankenLostStats: [], // a は 1 度も payer にならなかった = 全敗
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
    }>(res)

    expect(data.members.find((m) => m.memberId === 'a')?.jankenWinRate).toBe(0)
  })

  test('半々: 参加 4 回 / payer 2 回 → 0.5', async () => {
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
      // a: 6回参加/6回 payer (全勝), b: 6回参加/0回 payer (全敗), c: 6回参加/3回 payer (半々)
      jankenParticipationStats: [
        { memberId: 'a', _count: 6 },
        { memberId: 'b', _count: 6 },
        { memberId: 'c', _count: 6 },
      ],
      jankenLostStats: [
        { payerId: 'a', _count: 6 },
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

  // Issue #407: 本番 member-summary の値再現 (CEO ルール「勝った人が奢る」)
  test('本番値: おかじ 17.3% / ゆうき 43.5% (payer / participation)', async () => {
    setupMocks({
      members: [
        { id: 'okaji', name: 'おかじ' },
        { id: 'yuuki', name: 'ゆうき' },
      ],
      jankenEventCount: 100,
      jankenParticipationStats: [
        { memberId: 'okaji', _count: 1000 },
        { memberId: 'yuuki', _count: 1000 },
      ],
      jankenLostStats: [
        { payerId: 'okaji', _count: 173 }, // 173 / 1000 = 17.3%
        { payerId: 'yuuki', _count: 435 }, // 435 / 1000 = 43.5%
      ],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
    }>(res)

    const okaji = data.members.find((m) => m.memberId === 'okaji')
    const yuuki = data.members.find((m) => m.memberId === 'yuuki')
    expect(okaji?.jankenWinRate).toBeCloseTo(0.173, 3)
    expect(yuuki?.jankenWinRate).toBeCloseTo(0.435, 3)
  })
})

// Issue #354: ¥50,000 以上の男気 (= クラッチ) の集計
describe('GET /api/otokogi/member-summary — クラッチ集計', () => {
  test('clutchStats が無ければ全員 clutchCount=0 / clutchTotal=0 / clutchRate=0', async () => {
    setupMocks({})

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { status, data } = await parseResponse<{
      members: Array<{
        memberId: string
        clutchCount: number
        clutchTotal: number
        clutchRate: number
      }>
    }>(res)

    expect(status).toBe(200)
    for (const m of data.members) {
      expect(m.clutchCount).toBe(0)
      expect(m.clutchTotal).toBe(0)
      expect(m.clutchRate).toBe(0)
    }
  })

  test('clutchStats が返ったメンバーに count / total が反映される', async () => {
    setupMocks({
      // a は payer として 4 回支払って内 2 回がクラッチ、合計 ¥150,000
      payerStats: [
        { payerId: 'a', _count: 4, _sum: { amount: 200_000 } },
      ],
      clutchStats: [
        { payerId: 'a', _count: 2, _sum: { amount: 150_000 } },
      ],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{
        memberId: string
        payerCount: number
        clutchCount: number
        clutchTotal: number
        clutchRate: number
      }>
    }>(res)

    const a = data.members.find((m) => m.memberId === 'a')
    expect(a?.payerCount).toBe(4)
    expect(a?.clutchCount).toBe(2)
    expect(a?.clutchTotal).toBe(150_000)
    expect(a?.clutchRate).toBe(0.5) // 2/4

    const b = data.members.find((m) => m.memberId === 'b')
    expect(b?.clutchCount).toBe(0)
    expect(b?.clutchTotal).toBe(0)
    expect(b?.clutchRate).toBe(0)
  })

  test('_sum.amount が null の場合は 0 に正規化される', async () => {
    setupMocks({
      payerStats: [
        { payerId: 'a', _count: 1, _sum: { amount: 10_000 } },
      ],
      // 件数は 0 だが Prisma の仕様で _sum.amount が null になる可能性があるケース
      clutchStats: [
        { payerId: 'a', _count: 0, _sum: { amount: null as unknown as number } },
      ],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; clutchTotal: number }>
    }>(res)

    expect(data.members.find((m) => m.memberId === 'a')?.clutchTotal).toBe(0)
  })

  test('payerCount=0 なら clutchRate=0 (0 除算を避ける)', async () => {
    setupMocks({
      payerStats: [], // 誰も支払っていない
      clutchStats: [],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; clutchRate: number }>
    }>(res)

    for (const m of data.members) {
      expect(m.clutchRate).toBe(0)
    }
  })
})
