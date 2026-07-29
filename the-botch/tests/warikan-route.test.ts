/**
 * /api/warikan GET・POST の単体テスト
 *
 * Prisma クライアントを vi.mock でモックし、Route Handler の入出力・
 * バリデーション・エラーハンドリングを DB なしで検証する。
 * 実行: npx vitest run tests/warikan-route.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createRequest, parseResponse } from './helpers'

// Prisma クライアントをモック（Route Handler のインポート前に定義。vi.mock は hoisting される）
vi.mock('@/lib/prisma', () => ({
  prisma: {
    warikanEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

// モック定義後にインポート
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/warikan/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedFindMany = prisma.warikanEvent.findMany as unknown as MockFn
const mockedCreate = prisma.warikanEvent.create as unknown as MockFn

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  // handleApiError は 500 パスで console.error を呼ぶので抑制する
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

// ============================================================
// GET /api/warikan
// ============================================================
describe('GET /api/warikan', () => {
  test('フィルタなし → 200 と data / nextCursor:null を返す', async () => {
    const fakeEvents = [
      { id: 'e1', eventName: 'イベント1', createdAt: new Date('2026-01-01') },
      { id: 'e2', eventName: 'イベント2', createdAt: new Date('2026-02-01') },
    ]
    mockedFindMany.mockResolvedValue(fakeEvents)

    const res = await GET(createRequest('/api/warikan'))
    const { status, data } = await parseResponse<{
      data: typeof fakeEvents
      nextCursor: string | null
    }>(res)

    expect(status).toBe(200)
    expect(data.data).toHaveLength(2)
    expect(data.nextCursor).toBeNull()
    expect(mockedFindMany).toHaveBeenCalledTimes(1)
    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        take: 21, // 次ページ判定用に take+1
        orderBy: { createdAt: 'desc' },
      })
    )
  })

  test('status フィルタ (ENTERING) → where.status に反映される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/warikan', { searchParams: { status: 'ENTERING' } }))

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ENTERING' } })
    )
  })

  test('status フィルタ (PAYING) → where.status に反映される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/warikan', { searchParams: { status: 'PAYING' } }))

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PAYING' } })
    )
  })

  test('status フィルタ (CLOSED) → where.status に反映される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/warikan', { searchParams: { status: 'CLOSED' } }))

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'CLOSED' } })
    )
  })

  test('不正な status → where.status は設定されない（無視される）', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/warikan', { searchParams: { status: 'INVALID_STATUS' } }))

    expect(mockedFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
  })

  test('year フィルタ → where.createdAt に指定年の範囲が設定される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/warikan', { searchParams: { year: '2026' } }))

    const callArgs = mockedFindMany.mock.calls[0][0] as {
      where: { createdAt: { gte: Date; lt: Date } }
    }
    expect(callArgs.where.createdAt.gte).toEqual(new Date('2026-01-01'))
    expect(callArgs.where.createdAt.lt).toEqual(new Date('2027-01-01'))
  })

  test('status + year 併用 → 両方が where に反映される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(
      createRequest('/api/warikan', { searchParams: { status: 'CLOSED', year: '2025' } })
    )

    const callArgs = mockedFindMany.mock.calls[0][0] as {
      where: { status: string; createdAt: { gte: Date; lt: Date } }
    }
    expect(callArgs.where.status).toBe('CLOSED')
    expect(callArgs.where.createdAt.gte).toEqual(new Date('2025-01-01'))
    expect(callArgs.where.createdAt.lt).toEqual(new Date('2026-01-01'))
  })

  test('cursor 指定 → skip:1 と cursor:{id} が設定される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/warikan', { searchParams: { cursor: 'cursor-id-1' } }))

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 1,
        cursor: { id: 'cursor-id-1' },
      })
    )
  })

  test('cursor なし → skip / cursor は付与されない', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/warikan'))

    const callArgs = mockedFindMany.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.skip).toBeUndefined()
    expect(callArgs.cursor).toBeUndefined()
  })

  test('take+1 (=21) 件返却 → data は 20 件、nextCursor は 21 番目の id', async () => {
    const fakeEvents = Array.from({ length: 21 }, (_, i) => ({
      id: `evt-${i}`,
      eventName: `イベント${i}`,
      createdAt: new Date('2026-01-01'),
    }))
    mockedFindMany.mockResolvedValue(fakeEvents)

    const res = await GET(createRequest('/api/warikan'))
    const { status, data } = await parseResponse<{
      data: { id: string }[]
      nextCursor: string | null
    }>(res)

    expect(status).toBe(200)
    expect(data.data).toHaveLength(20)
    expect(data.nextCursor).toBe('evt-20')
    // 20 番目までがレスポンスに含まれる
    expect(data.data[0].id).toBe('evt-0')
    expect(data.data[19].id).toBe('evt-19')
  })

  test('20 件以下返却 → nextCursor は null', async () => {
    const fakeEvents = Array.from({ length: 10 }, (_, i) => ({
      id: `evt-${i}`,
      createdAt: new Date('2026-01-01'),
    }))
    mockedFindMany.mockResolvedValue(fakeEvents)

    const res = await GET(createRequest('/api/warikan'))
    const { data } = await parseResponse<{
      data: unknown[]
      nextCursor: string | null
    }>(res)

    expect(data.data).toHaveLength(10)
    expect(data.nextCursor).toBeNull()
  })

  test('Prisma が例外を投げる → 500 + fallbackMessage', async () => {
    mockedFindMany.mockRejectedValue(new Error('DB error'))

    const res = await GET(createRequest('/api/warikan'))
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('割り勘イベント一覧の取得に失敗しました')
  })
})

// ============================================================
// POST /api/warikan
// ============================================================
describe('POST /api/warikan', () => {
  const validPayload = {
    eventName: 'テスト割り勘',
    participantIds: ['00000000-0000-0000-0000-000000000001'],
  }

  test('正常系（最小ボディ） → 201 と作成イベントを返す', async () => {
    const fakeCreated = {
      id: 'created-id',
      eventName: 'テスト割り勘',
      participants: [{ member: { id: 'x', name: 'テスト' } }],
    }
    mockedCreate.mockResolvedValue(fakeCreated)

    const res = await POST(
      createRequest('/api/warikan', { method: 'POST', body: validPayload })
    )
    const { status, data } = await parseResponse<{ id: string }>(res)

    expect(status).toBe(201)
    expect(data.id).toBe('created-id')
    expect(mockedCreate).toHaveBeenCalledTimes(1)

    const args = mockedCreate.mock.calls[0][0] as {
      data: {
        eventName: string
        managerId: string | null
        detailDeadline: Date | null
        paymentDeadline: Date | null
        displayDate: Date | null
        memo: string | null
        walicaUrl: string | null
        eventId: string | null
        participants: { create: { memberId: string }[] }
      }
    }
    expect(args.data.eventName).toBe('テスト割り勘')
    expect(args.data.managerId).toBeNull()
    expect(args.data.detailDeadline).toBeNull()
    expect(args.data.paymentDeadline).toBeNull()
    expect(args.data.displayDate).toBeNull()
    expect(args.data.memo).toBeNull()
    expect(args.data.walicaUrl).toBeNull()
    expect(args.data.eventId).toBeNull()
    expect(args.data.participants.create).toEqual([
      { memberId: '00000000-0000-0000-0000-000000000001' },
    ])
  })

  test('全フィールド指定 → Date 変換・displayDate の算出が反映される', async () => {
    mockedCreate.mockResolvedValue({ id: 'full-created' })

    const res = await POST(
      createRequest('/api/warikan', {
        method: 'POST',
        body: {
          // 先頭 8 桁 YYYYMMDD → displayDate はここから算出される（最優先）
          eventName: '20260401_花見',
          managerId: '00000000-0000-0000-0000-000000000010',
          detailDeadline: '2026-04-05',
          paymentDeadline: '2026-04-10',
          memo: 'テストメモ',
          walicaUrl: 'https://walica.jp/xxx',
          eventId: '00000000-0000-0000-0000-000000000020',
          participantIds: [
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
          ],
        },
      })
    )
    const { status } = await parseResponse(res)

    expect(status).toBe(201)
    const args = mockedCreate.mock.calls[0][0] as {
      data: {
        eventName: string
        managerId: string | null
        detailDeadline: Date | null
        paymentDeadline: Date | null
        displayDate: Date | null
        memo: string | null
        walicaUrl: string | null
        eventId: string | null
        participants: { create: { memberId: string }[] }
      }
    }
    expect(args.data.eventName).toBe('20260401_花見')
    expect(args.data.managerId).toBe('00000000-0000-0000-0000-000000000010')
    expect(args.data.detailDeadline).toEqual(new Date('2026-04-05'))
    expect(args.data.paymentDeadline).toEqual(new Date('2026-04-10'))
    // eventName 先頭 YYYYMMDD が最優先で displayDate に反映
    expect(args.data.displayDate).toEqual(new Date('2026-04-01'))
    expect(args.data.memo).toBe('テストメモ')
    expect(args.data.walicaUrl).toBe('https://walica.jp/xxx')
    expect(args.data.eventId).toBe('00000000-0000-0000-0000-000000000020')
    expect(args.data.participants.create).toEqual([
      { memberId: '00000000-0000-0000-0000-000000000001' },
      { memberId: '00000000-0000-0000-0000-000000000002' },
    ])
  })

  test('eventName 欠損 → 400 + Prisma は呼ばれない', async () => {
    const res = await POST(
      createRequest('/api/warikan', {
        method: 'POST',
        body: { participantIds: ['00000000-0000-0000-0000-000000000001'] },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('イベント名')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('eventName 空文字 → 400', async () => {
    const res = await POST(
      createRequest('/api/warikan', {
        method: 'POST',
        body: {
          eventName: '',
          participantIds: ['00000000-0000-0000-0000-000000000001'],
        },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('イベント名')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('participantIds 欠損 → 400', async () => {
    const res = await POST(
      createRequest('/api/warikan', {
        method: 'POST',
        body: { eventName: 'テスト' },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('参加メンバー')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('participantIds が空配列 → 400', async () => {
    const res = await POST(
      createRequest('/api/warikan', {
        method: 'POST',
        body: { eventName: 'テスト', participantIds: [] },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('参加メンバー')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('ボディが空オブジェクト → 400（必須項目欠損）', async () => {
    const res = await POST(
      createRequest('/api/warikan', { method: 'POST', body: {} })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('不正な JSON ボディ → 400', async () => {
    const rawReq = new NextRequest('http://localhost:3000/api/warikan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json',
    })
    const res = await POST(rawReq)
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('Prisma create が例外を投げる → 500 + fallbackMessage', async () => {
    mockedCreate.mockRejectedValue(new Error('DB error'))

    const res = await POST(
      createRequest('/api/warikan', { method: 'POST', body: validPayload })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('割り勘イベントの作成に失敗しました')
  })
})
