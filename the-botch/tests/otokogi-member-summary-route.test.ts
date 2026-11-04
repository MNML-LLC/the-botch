/**
 * /api/otokogi/member-summary GET の単体テスト（じゃんけん勝率計算 重点）
 *
 * 実行: npx vitest run tests/otokogi-member-summary-route.test.ts
 *
 * Issue #393: 「勝った人が奢る」ルールに合わせて、勝率 formula を反転。
 *   - 旧式: (participation - payerInJanken) / participation = 「負けなかった率」
 *   - 新式: payerInJanken / participation = 「勝って奢った率」
 *   変数名 `jankenLostStats` は route 内で `jankenPayerStats` にリネーム済み。
 *   ここでは mock セット名として旧名 (jankenLostStats) を残しても
 *   セマンティクスは「janken 対象イベントの payer 集計 = 勝ってた回数」。
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
 *     1) payerStats            (全体の payer 集計)
 *     2) jankenPayerStats      (janken 対象のみ。「勝って奢った回数」/ Issue #393)
 *     3) clutchStats           (¥50,000 以上の payer 集計、Issue #354)
 *   otokogiParticipant.groupBy:
 *     1) participationStats     (全体の参加集計)
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
  jankenPayerStats?: Array<{ payerId: string; _count: number }>
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
    .mockResolvedValueOnce(options.jankenPayerStats ?? [])
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

describe('GET /api/otokogi/member-summary — じゃんけん勝率 (Issue #393: 勝って奢った率)', () => {
  // 「勝った人が奢る」ルール下では、janken 参加のうち payer になった回数 = 勝った回数。
  // jankenWinRate = jankenPayerCount / jankenParticipation。

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
      // a は 2 回参加のうち 1 回勝って奢った、b は参加なし
      jankenParticipationStats: [{ memberId: 'a', _count: 2 }],
      jankenPayerStats: [{ payerId: 'a', _count: 1 }],
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

  test('全勝 (毎回 payer): 参加 3 / 勝ち 3 → 1.0', async () => {
    setupMocks({
      jankenEventCount: 3,
      jankenParticipationStats: [{ memberId: 'a', _count: 3 }],
      jankenPayerStats: [{ payerId: 'a', _count: 3 }],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
    }>(res)

    expect(data.members.find((m) => m.memberId === 'a')?.jankenWinRate).toBe(1)
  })

  test('全敗 (1 度も payer にならず): 参加 3 / 勝ち 0 → 0.0', async () => {
    setupMocks({
      jankenEventCount: 3,
      jankenParticipationStats: [{ memberId: 'a', _count: 3 }],
      jankenPayerStats: [],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
    }>(res)

    expect(data.members.find((m) => m.memberId === 'a')?.jankenWinRate).toBe(0)
  })

  test('半々: 参加 4 / 勝ち 2 → 0.5', async () => {
    setupMocks({
      jankenEventCount: 4,
      jankenParticipationStats: [{ memberId: 'a', _count: 4 }],
      jankenPayerStats: [{ payerId: 'a', _count: 2 }],
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
      // a: 6参加/6勝 (全勝), b: 6参加/0勝 (全敗), c: 6参加/3勝 (半々)
      jankenParticipationStats: [
        { memberId: 'a', _count: 6 },
        { memberId: 'b', _count: 6 },
        { memberId: 'c', _count: 6 },
      ],
      jankenPayerStats: [
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

  test('Issue #393 回帰防止: formula 反転確認 (CEO の例 — 奢り多数の人は高く出る)', async () => {
    // ゆうき相当: 多くの janken に参加しつつ約半分で奢ってる (= 高勝率)
    setupMocks({
      jankenEventCount: 23,
      jankenParticipationStats: [{ memberId: 'a', _count: 23 }],
      jankenPayerStats: [{ payerId: 'a', _count: 10 }],
    })

    const res = await GET(createRequest('/api/otokogi/member-summary'))
    const { data } = await parseResponse<{
      members: Array<{ memberId: string; jankenWinRate: number | null }>
    }>(res)

    const a = data.members.find((m) => m.memberId === 'a')
    // 10 / 23 ≒ 0.4347... (= 43.5%)。旧 formula なら 13/23 ≒ 0.5652 (= 56.5%)。
    expect(a?.jankenWinRate).toBeCloseTo(10 / 23, 10)
    expect(a?.jankenWinRate).toBeLessThan(0.5)
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
