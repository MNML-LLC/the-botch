/**
 * GET /api/warikan/[id]/export の単体テスト
 *
 * Prisma クライアントを vi.mock でモックし、CSV レスポンスの
 * 内容・ヘッダ・エラーハンドリングを DB なしで検証する。
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, makeParams } from './helpers'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warikanEvent: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/warikan/[id]/export/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedFindUnique = prisma.warikanEvent.findUnique as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

const buildEvent = () => ({
  id: 'evt-1',
  eventName: 'テニス 6月分',
  status: 'PAYING' as const,
  detailDeadline: new Date('2026-06-10T00:00:00Z'),
  paymentDeadline: new Date('2026-06-20T00:00:00Z'),
  manager: { id: 'm1', name: 'ゆうき' },
  participants: [
    { memberId: 'm1', member: { id: 'm1', name: 'ゆうき', fullName: '内山' } },
    { memberId: 'm2', member: { id: 'm2', name: 'ゆうへい', fullName: '大崎' } },
    { memberId: 'm3', member: { id: 'm3', name: 'たかし', fullName: '田中' } },
  ],
  expenses: [
    {
      id: 'e1',
      amount: 3000,
      description: 'コート代',
      payer: { id: 'm1', name: 'ゆうき' },
      debtors: [
        { memberId: 'm1', member: { id: 'm1', name: 'ゆうき' } },
        { memberId: 'm2', member: { id: 'm2', name: 'ゆうへい' } },
        { memberId: 'm3', member: { id: 'm3', name: 'たかし' } },
      ],
    },
    {
      id: 'e2',
      amount: 1500,
      description: 'ボール, 消耗品',
      payer: { id: 'm2', name: 'ゆうへい' },
      debtors: [
        { memberId: 'm1', member: { id: 'm1', name: 'ゆうき' } },
        { memberId: 'm2', member: { id: 'm2', name: 'ゆうへい' } },
      ],
    },
  ],
  settlements: [
    {
      id: 's1',
      amount: 1250,
      isPaid: true,
      isReceived: false,
      fromMember: { id: 'm3', name: 'たかし' },
      toMember: { id: 'm1', name: 'ゆうき' },
    },
    {
      id: 's2',
      amount: 250,
      isPaid: false,
      isReceived: false,
      fromMember: { id: 'm3', name: 'たかし' },
      toMember: { id: 'm2', name: 'ゆうへい' },
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('GET /api/warikan/[id]/export', () => {
  test('存在するイベント → 200 + text/csv + BOM + Content-Disposition', async () => {
    mockedFindUnique.mockResolvedValue(buildEvent())

    const res = await GET(
      createRequest('/api/warikan/evt-1/export'),
      makeParams({ id: 'evt-1' })
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')

    const cd = res.headers.get('Content-Disposition') ?? ''
    expect(cd).toContain('attachment;')
    expect(cd).toMatch(/filename\*=UTF-8''/)
    // ファイル名にイベント名と日付が含まれる（percent-encoded）
    expect(cd).toContain(encodeURIComponent('warikan_テニス 6月分_'))

    // レスポンスのバイト列に UTF-8 BOM (EF BB BF) が含まれる
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes[0]).toBe(0xef)
    expect(bytes[1]).toBe(0xbb)
    expect(bytes[2]).toBe(0xbf)

    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    // CRLF 改行
    expect(text).toContain('\r\n')
  })

  test('CSV 本文にイベント情報・立替明細・精算フローが含まれる', async () => {
    mockedFindUnique.mockResolvedValue(buildEvent())

    const res = await GET(
      createRequest('/api/warikan/evt-1/export'),
      makeParams({ id: 'evt-1' })
    )
    const text = await res.text()

    // イベント情報
    expect(text).toContain('# イベント情報')
    expect(text).toContain('イベント名,テニス 6月分')
    expect(text).toContain('ステータス,支払待ち')
    expect(text).toContain('管理者,ゆうき')
    expect(text).toContain('明細追加期日,2026-06-')
    expect(text).toContain('参加者,ゆうき、ゆうへい、たかし')
    expect(text).toContain('合計金額,4500')
    expect(text).toContain('1人あたり,1500')

    // 立替明細
    expect(text).toContain('# 立替明細')
    expect(text).toContain('No,立替者,内容,金額,対象者')
    expect(text).toContain('1,ゆうき,コート代,3000,全員')
    // カンマ入り description はクォートされる
    expect(text).toContain('2,ゆうへい,"ボール, 消耗品",1500,ゆうき、ゆうへい')

    // 精算フロー
    expect(text).toContain('# 精算フロー（送金指示）')
    expect(text).toContain('No,From,To,金額,送金済み,受領済み')
    expect(text).toContain('1,たかし,ゆうき,1250,済,')
    expect(text).toContain('2,たかし,ゆうへい,250,,')
  })

  test('精算 0 件・明細 0 件 → 「精算不要」「明細なし」プレースホルダを含む', async () => {
    const event = buildEvent()
    event.expenses = []
    event.settlements = []
    mockedFindUnique.mockResolvedValue(event)

    const res = await GET(
      createRequest('/api/warikan/evt-1/export'),
      makeParams({ id: 'evt-1' })
    )
    const text = await res.text()

    expect(text).toContain('明細なし')
    expect(text).toContain('精算不要')
    expect(text).toContain('合計金額,0')
    expect(text).toContain('1人あたり,0')
  })

  test('イベント未存在 → 404 JSON', async () => {
    mockedFindUnique.mockResolvedValue(null)

    const res = await GET(
      createRequest('/api/warikan/missing/export'),
      makeParams({ id: 'missing' })
    )

    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain('見つかりません')
  })

  test('Prisma が例外 → 500 fallbackMessage', async () => {
    mockedFindUnique.mockRejectedValue(new Error('DB error'))

    const res = await GET(
      createRequest('/api/warikan/evt-1/export'),
      makeParams({ id: 'evt-1' })
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('割り勘 CSV のエクスポートに失敗しました')
  })
})
