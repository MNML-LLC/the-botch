/**
 * POST /api/warikan/[id]/settlements/bulk-complete の単体テスト
 *
 * Prisma クライアントを vi.mock でモックし、Route Handler の入出力・
 * ステータス検証・エラーハンドリングを DB なしで検証する。
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequest, makeParams, parseResponse } from './helpers'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    warikanEvent: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    warikanSettlement: {
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/warikan/[id]/settlements/bulk-complete/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedFindUnique = prisma.warikanEvent.findUnique as unknown as MockFn
const mockedUpdate = prisma.warikanEvent.update as unknown as MockFn
const mockedCount = prisma.warikanSettlement.count as unknown as MockFn
const mockedUpdateMany = prisma.warikanSettlement.updateMany as unknown as MockFn
const mockedTransaction = prisma.$transaction as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  // デフォルトで $transaction はコールバックをそのまま実行し、tx として prisma を渡す
  mockedTransaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma))
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('POST /api/warikan/[id]/settlements/bulk-complete', () => {
  test('PAYING & 精算あり → 200 と updatedCount / CLOSED 更新を返す', async () => {
    mockedFindUnique.mockResolvedValue({ id: 'evt-1', status: 'PAYING' })
    mockedCount.mockResolvedValue(3)
    mockedUpdateMany.mockResolvedValue({ count: 3 })
    mockedUpdate.mockResolvedValue({ id: 'evt-1', status: 'CLOSED' })

    const res = await POST(
      createRequest('/api/warikan/evt-1/settlements/bulk-complete', { method: 'POST' }),
      makeParams({ id: 'evt-1' })
    )
    const { status, data } = await parseResponse<{
      event: { id: string; status: string }
      updatedCount: number
    }>(res)

    expect(status).toBe(200)
    expect(data.updatedCount).toBe(3)
    expect(data.event.status).toBe('CLOSED')

    // updateMany が isPaid / isReceived の 2 回呼ばれる
    expect(mockedUpdateMany).toHaveBeenCalledTimes(2)
    expect(mockedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { warikanEventId: 'evt-1', isPaid: false },
        data: expect.objectContaining({ isPaid: true }),
      })
    )
    expect(mockedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { warikanEventId: 'evt-1', isReceived: false },
        data: expect.objectContaining({ isReceived: true }),
      })
    )

    // イベントを CLOSED に更新
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { status: 'CLOSED' },
    })
  })

  test('イベント未存在 → 404', async () => {
    mockedFindUnique.mockResolvedValue(null)

    const res = await POST(
      createRequest('/api/warikan/missing/settlements/bulk-complete', { method: 'POST' }),
      makeParams({ id: 'missing' })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(404)
    expect(data.error).toContain('見つかりません')
    expect(mockedUpdateMany).not.toHaveBeenCalled()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  test('ENTERING ステータス → 400（PAYING のみ許可）', async () => {
    mockedFindUnique.mockResolvedValue({ id: 'evt-1', status: 'ENTERING' })

    const res = await POST(
      createRequest('/api/warikan/evt-1/settlements/bulk-complete', { method: 'POST' }),
      makeParams({ id: 'evt-1' })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('送金中のイベントのみ')
    expect(mockedUpdateMany).not.toHaveBeenCalled()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  test('CLOSED ステータス → 400', async () => {
    mockedFindUnique.mockResolvedValue({ id: 'evt-1', status: 'CLOSED' })

    const res = await POST(
      createRequest('/api/warikan/evt-1/settlements/bulk-complete', { method: 'POST' }),
      makeParams({ id: 'evt-1' })
    )
    const { status } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(mockedUpdateMany).not.toHaveBeenCalled()
  })

  test('精算レコード 0 件 → 400', async () => {
    mockedFindUnique.mockResolvedValue({ id: 'evt-1', status: 'PAYING' })
    mockedCount.mockResolvedValue(0)

    const res = await POST(
      createRequest('/api/warikan/evt-1/settlements/bulk-complete', { method: 'POST' }),
      makeParams({ id: 'evt-1' })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('精算レコードが存在しません')
    expect(mockedUpdateMany).not.toHaveBeenCalled()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  test('Prisma が例外を投げる → 500 + fallbackMessage', async () => {
    mockedFindUnique.mockRejectedValue(new Error('DB error'))

    const res = await POST(
      createRequest('/api/warikan/evt-1/settlements/bulk-complete', { method: 'POST' }),
      makeParams({ id: 'evt-1' })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('精算の一括完了に失敗しました')
  })
})
