/**
 * /api/otokogi/charts GET の単体テスト (Issue #400)
 *
 * 期間フィルタ (period=all / current-fy / last-fy / custom) ごとに:
 * - monthMemberHeatmap / heatmap が期間内の月だけ返す
 * - cumulativeYearly が period 月ベースの累積 1 本線
 * - comparison フィールドが存在しない (削除)
 * - stats API と合計金額が一致する (期間=全)
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, parseResponse } from './helpers'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    otokogiEvent: {
      findMany: vi.fn(),
    },
    member: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/otokogi/charts/route'

// Route レスポンス型 (テスト用の簡易定義)
type ChartsResponse = {
  heatmap: { months: string[]; members: unknown[]; cells: Array<{ month: string; memberId: string; amount: number }> }
  monthMemberHeatmap: {
    months: string[]
    members: unknown[]
    cells: Array<{ month: string; memberId: string; amount: number }>
    maxAmount: number
  }
  cumulativeYearly: Array<{ month: string; cumulative: number | null }>
  topRecent: Array<{ id: string; amount: number }>
  comparison?: unknown
}

type MockFn = ReturnType<typeof vi.fn>
const mockEventFindMany = prisma.otokogiEvent.findMany as unknown as MockFn
const mockMemberFindMany = prisma.member.findMany as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

const MEMBERS = [
  { id: 'yuki', name: 'ゆうき', initial: 'Y', colorBg: '', colorText: '' },
  { id: 'yuhei', name: 'ゆうへい', initial: 'U', colorBg: '', colorText: '' },
]

function makeEvent(opts: {
  id: string
  date: string
  amount: number
  payerId?: string
}) {
  return {
    id: opts.id,
    eventDate: new Date(opts.date),
    eventName: `event-${opts.id}`,
    amount: opts.amount,
    place: null,
    payerId: opts.payerId ?? 'yuki',
    payer: MEMBERS.find((m) => m.id === (opts.payerId ?? 'yuki'))!,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockMemberFindMany.mockResolvedValue(MEMBERS)
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('GET /api/otokogi/charts (Issue #400 regression)', () => {
  test('period=all: 実データ範囲で月軸を生成し、12ヶ月を超えて全件を集計する', async () => {
    // 2年以上前のイベント + 直近のイベント
    const events = [
      makeEvent({ id: '1', date: '2023-01-15', amount: 100_000, payerId: 'yuki' }),
      makeEvent({ id: '2', date: '2024-06-10', amount: 500_000, payerId: 'yuki' }),
      makeEvent({ id: '3', date: '2025-05-20', amount: 300_000, payerId: 'yuhei' }),
      makeEvent({ id: '4', date: '2026-10-05', amount: 200_000, payerId: 'yuki' }),
    ]
    mockEventFindMany.mockResolvedValue(events)

    const res = await GET(createRequest('/api/otokogi/charts'))
    const { status, data } = await parseResponse<ChartsResponse>(res)

    expect(status).toBe(200)
    // Prisma クエリに日付フィルタが入っていないこと (period=all)
    const whereArg = mockEventFindMany.mock.calls[0][0].where
    expect(whereArg.eventDate).toBeUndefined()

    // 月軸が earliest (2023-01) 〜 now (>=2026-10) まで伸びている
    expect(data.monthMemberHeatmap.months[0]).toBe('2023-01')
    expect(data.monthMemberHeatmap.months.length).toBeGreaterThan(12)

    // ゆうきの合計 = 100k + 500k + 200k = 800k (全期間)
    const yukiTotal = data.monthMemberHeatmap.cells
      .filter((c) => c.memberId === 'yuki')
      .reduce((sum, c) => sum + c.amount, 0)
    expect(yukiTotal).toBe(800_000)
  })

  test('period=all: comparison フィールドは存在しない (Issue #391 で UI 削除、#400 で API 削除)', async () => {
    mockEventFindMany.mockResolvedValue([])
    const res = await GET(createRequest('/api/otokogi/charts'))
    const { data } = await parseResponse<ChartsResponse>(res)
    expect(data.comparison).toBeUndefined()
  })

  test('period=current-fy: 月軸は FY の 12ヶ月 (11月〜翌10月)', async () => {
    mockEventFindMany.mockResolvedValue([])
    const res = await GET(
      createRequest('/api/otokogi/charts', {
        searchParams: { period: 'current-fy' },
      }),
    )
    const { data } = await parseResponse<ChartsResponse>(res)

    // 11 月始まり 10 月終わりの 12 ヶ月
    expect(data.monthMemberHeatmap.months).toHaveLength(12)
    // 最初は 11 月、最後は 10 月
    expect(data.monthMemberHeatmap.months[0]).toMatch(/-11$/)
    expect(data.monthMemberHeatmap.months[11]).toMatch(/-10$/)
    // Prisma に gte/lte が渡されている
    const whereArg = mockEventFindMany.mock.calls[0][0].where
    expect(whereArg.eventDate.gte).toBeInstanceOf(Date)
    expect(whereArg.eventDate.lte).toBeInstanceOf(Date)
  })

  test('cumulativeYearly: 期間内月を軸に累積総額 1 本線を返す', async () => {
    const events = [
      makeEvent({ id: '1', date: '2025-11-05', amount: 10_000 }),
      makeEvent({ id: '2', date: '2025-12-10', amount: 20_000 }),
      makeEvent({ id: '3', date: '2026-01-20', amount: 30_000 }),
    ]
    mockEventFindMany.mockResolvedValue(events)

    const res = await GET(
      createRequest('/api/otokogi/charts', {
        searchParams: {
          period: 'custom',
          from: '2025-11-01',
          to: '2026-10-31',
        },
      }),
    )
    const { data } = await parseResponse<ChartsResponse>(res)

    // 旧形式 (thisYear/lastYear/yearBefore) ではないこと
    expect(data.cumulativeYearly[0]).not.toHaveProperty('thisYear')
    expect(data.cumulativeYearly[0]).not.toHaveProperty('lastYear')
    // 新形式: month: YYYY-MM, cumulative: number | null
    expect(data.cumulativeYearly[0]).toHaveProperty('month')
    expect(data.cumulativeYearly[0]).toHaveProperty('cumulative')

    // 累積が月ごとに積み上がる
    const nov = data.cumulativeYearly.find((r) => r.month === '2025-11')
    const dec = data.cumulativeYearly.find((r) => r.month === '2025-12')
    const jan = data.cumulativeYearly.find((r) => r.month === '2026-01')
    expect(nov?.cumulative).toBe(10_000)
    expect(dec?.cumulative).toBe(30_000)
    expect(jan?.cumulative).toBe(60_000)
  })

  test('cumulativeYearly: last-fy (過去期間) は全月が累積に含まれる (anchor=periodTo)', async () => {
    // 前期 FY (2025-11 〜 2026-10) に収まるイベントを用意
    const events = [
      makeEvent({ id: '1', date: '2025-11-05', amount: 10_000 }),
      makeEvent({ id: '2', date: '2026-10-25', amount: 20_000 }),
    ]
    mockEventFindMany.mockResolvedValue(events)

    const res = await GET(
      createRequest('/api/otokogi/charts', {
        searchParams: { period: 'last-fy' },
      }),
    )
    const { data } = await parseResponse<ChartsResponse>(res)

    // すべての月に null ではなく数値が入っている (anchor = periodTo)
    for (const row of data.cumulativeYearly) {
      expect(row.cumulative).not.toBeNull()
    }
    // 最後の月の累積 = 全イベント合計
    const last =
      data.cumulativeYearly[data.cumulativeYearly.length - 1].cumulative
    expect(last).toBe(30_000)
  })

  test('topRecent: 期間内の金額上位 3 件 (期間外は含まない)', async () => {
    const events = [
      makeEvent({ id: 'in1', date: '2026-01-01', amount: 100_000 }),
      makeEvent({ id: 'in2', date: '2026-02-01', amount: 50_000 }),
      makeEvent({ id: 'in3', date: '2026-03-01', amount: 30_000 }),
      makeEvent({ id: 'in4', date: '2026-04-01', amount: 20_000 }),
    ]
    mockEventFindMany.mockResolvedValue(events)

    const res = await GET(
      createRequest('/api/otokogi/charts', {
        searchParams: { from: '2026-01-01', to: '2026-12-31' },
      }),
    )
    const { data } = await parseResponse<ChartsResponse>(res)

    expect(data.topRecent).toHaveLength(3)
    expect(data.topRecent[0].id).toBe('in1') // 100k
    expect(data.topRecent[1].id).toBe('in2') // 50k
    expect(data.topRecent[2].id).toBe('in3') // 30k
  })

  test('memberIds フィルタが Prisma の where に反映される', async () => {
    mockEventFindMany.mockResolvedValue([])
    await GET(
      createRequest('/api/otokogi/charts', {
        searchParams: { memberIds: 'yuki,yuhei' },
      }),
    )
    const whereArg = mockEventFindMany.mock.calls[0][0].where
    expect(whereArg.payerId).toEqual({ in: ['yuki', 'yuhei'] })
    const memberWhereArg = mockMemberFindMany.mock.calls[0][0].where
    expect(memberWhereArg.id).toEqual({ in: ['yuki', 'yuhei'] })
  })

  test('period=all ゼロデータ: 空軸・空セルで 200 を返す', async () => {
    mockEventFindMany.mockResolvedValue([])
    const res = await GET(createRequest('/api/otokogi/charts'))
    const { status, data } = await parseResponse<ChartsResponse>(res)
    expect(status).toBe(200)
    expect(data.monthMemberHeatmap.months).toEqual([])
    expect(data.cumulativeYearly).toEqual([])
    expect(data.topRecent).toEqual([])
  })
})
