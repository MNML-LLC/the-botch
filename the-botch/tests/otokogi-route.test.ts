/**
 * /api/otokogi GET・POST の単体テスト
 *
 * Prisma クライアントおよび stats-cache を vi.mock でモックし、
 * Route Handler の入出力・バリデーション・エラーハンドリング・キャッシュ無効化を
 * DB なしで検証する。
 * 実行: npx vitest run tests/otokogi-route.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createRequest, parseResponse } from './helpers'

// Prisma クライアントをモック（Route Handler のインポート前に定義。vi.mock は hoisting される）
vi.mock('@/lib/prisma', () => ({
  prisma: {
    otokogiEvent: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

// 統計キャッシュ無効化の呼び出し検証用にモック
vi.mock('@/lib/stats-cache', () => ({
  invalidateStatsCache: vi.fn(),
  getCachedStats: vi.fn(),
  setCachedStats: vi.fn(),
}))

// モック定義後にインポート
import { prisma } from '@/lib/prisma'
import { invalidateStatsCache } from '@/lib/stats-cache'
import { GET, POST } from '@/app/api/otokogi/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedFindMany = prisma.otokogiEvent.findMany as unknown as MockFn
const mockedCreate = prisma.otokogiEvent.create as unknown as MockFn
const mockedInvalidateStatsCache = invalidateStatsCache as unknown as MockFn

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
// GET /api/otokogi
// ============================================================
describe('GET /api/otokogi', () => {
  test('フィルタなし → 200 と data / nextCursor:null を返す', async () => {
    const fakeEvents = [
      { id: 'e1', eventName: '男気1', eventDate: new Date('2026-01-01') },
      { id: 'e2', eventName: '男気2', eventDate: new Date('2026-02-01') },
    ]
    mockedFindMany.mockResolvedValue(fakeEvents)

    const res = await GET(createRequest('/api/otokogi'))
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
        orderBy: { eventDate: 'desc' },
      })
    )
  })

  test('year フィルタ → where.eventDate に指定年の範囲が設定される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/otokogi', { searchParams: { year: '2026' } }))

    const callArgs = mockedFindMany.mock.calls[0][0] as {
      where: { eventDate: { gte: Date; lt: Date } }
    }
    expect(callArgs.where.eventDate.gte).toEqual(new Date('2026-01-01'))
    expect(callArgs.where.eventDate.lt).toEqual(new Date('2027-01-01'))
  })

  test('payer フィルタ → where.payerId に反映される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(
      createRequest('/api/otokogi', {
        searchParams: { payer: '00000000-0000-0000-0000-000000000010' },
      })
    )

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { payerId: '00000000-0000-0000-0000-000000000010' },
      })
    )
  })

  test('year + payer 併用 → 両方が where に反映される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(
      createRequest('/api/otokogi', {
        searchParams: {
          year: '2025',
          payer: '00000000-0000-0000-0000-000000000010',
        },
      })
    )

    const callArgs = mockedFindMany.mock.calls[0][0] as {
      where: { payerId: string; eventDate: { gte: Date; lt: Date } }
    }
    expect(callArgs.where.payerId).toBe('00000000-0000-0000-0000-000000000010')
    expect(callArgs.where.eventDate.gte).toEqual(new Date('2025-01-01'))
    expect(callArgs.where.eventDate.lt).toEqual(new Date('2026-01-01'))
  })

  test('cursor 指定 → skip:1 と cursor:{id} が設定される', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/otokogi', { searchParams: { cursor: 'cursor-id-1' } }))

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 1,
        cursor: { id: 'cursor-id-1' },
      })
    )
  })

  test('cursor なし → skip / cursor は付与されない', async () => {
    mockedFindMany.mockResolvedValue([])
    await GET(createRequest('/api/otokogi'))

    const callArgs = mockedFindMany.mock.calls[0][0] as Record<string, unknown>
    expect(callArgs.skip).toBeUndefined()
    expect(callArgs.cursor).toBeUndefined()
  })

  test('take+1 (=21) 件返却 → data は 20 件、nextCursor は 21 番目の id', async () => {
    const fakeEvents = Array.from({ length: 21 }, (_, i) => ({
      id: `evt-${i}`,
      eventName: `男気${i}`,
      eventDate: new Date('2026-01-01'),
    }))
    mockedFindMany.mockResolvedValue(fakeEvents)

    const res = await GET(createRequest('/api/otokogi'))
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
      eventDate: new Date('2026-01-01'),
    }))
    mockedFindMany.mockResolvedValue(fakeEvents)

    const res = await GET(createRequest('/api/otokogi'))
    const { data } = await parseResponse<{
      data: unknown[]
      nextCursor: string | null
    }>(res)

    expect(data.data).toHaveLength(10)
    expect(data.nextCursor).toBeNull()
  })

  test('Prisma が例外を投げる → 500 + fallbackMessage', async () => {
    mockedFindMany.mockRejectedValue(new Error('DB error'))

    const res = await GET(createRequest('/api/otokogi'))
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('男気イベント一覧の取得に失敗しました')
  })
})

// ============================================================
// POST /api/otokogi
// ============================================================
describe('POST /api/otokogi', () => {
  const validPayload = {
    eventDate: '2026-04-01',
    eventName: 'テスト男気',
    payerId: '00000000-0000-0000-0000-000000000010',
    amount: 5000,
    participantIds: ['00000000-0000-0000-0000-000000000001'],
  }

  test('正常系（最小ボディ） → 201 と作成イベントを返し、キャッシュを無効化する', async () => {
    const fakeCreated = {
      id: 'created-id',
      eventName: 'テスト男気',
      payer: { id: 'x', name: '支払者' },
      participants: [{ member: { id: 'x', name: 'テスト' } }],
    }
    mockedCreate.mockResolvedValue(fakeCreated)

    const res = await POST(
      createRequest('/api/otokogi', { method: 'POST', body: validPayload })
    )
    const { status, data } = await parseResponse<{ id: string }>(res)

    expect(status).toBe(201)
    expect(data.id).toBe('created-id')
    expect(mockedCreate).toHaveBeenCalledTimes(1)

    const args = mockedCreate.mock.calls[0][0] as {
      data: {
        eventDate: Date
        eventName: string
        payerId: string
        amount: number
        place: string | null
        hasAlbum: boolean
        memo: string | null
        eventId: string | null
        participants: { create: { memberId: string }[] }
      }
    }
    expect(args.data.eventDate).toEqual(new Date('2026-04-01'))
    expect(args.data.eventName).toBe('テスト男気')
    expect(args.data.payerId).toBe('00000000-0000-0000-0000-000000000010')
    expect(args.data.amount).toBe(5000)
    expect(args.data.place).toBeNull()
    expect(args.data.hasAlbum).toBe(false)
    expect(args.data.memo).toBeNull()
    expect(args.data.eventId).toBeNull()
    expect(args.data.participants.create).toEqual([
      { memberId: '00000000-0000-0000-0000-000000000001' },
    ])

    // 統計キャッシュ無効化が呼ばれる
    expect(mockedInvalidateStatsCache).toHaveBeenCalledTimes(1)
  })

  test('全フィールド指定 → Date 変換・全項目が反映される', async () => {
    mockedCreate.mockResolvedValue({ id: 'full-created' })

    const res = await POST(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: {
          eventDate: '2026-05-15',
          eventName: '花見男気',
          payerId: '00000000-0000-0000-0000-000000000010',
          amount: 12000,
          place: '新宿御苑',
          hasAlbum: true,
          memo: 'テストメモ',
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
        eventDate: Date
        eventName: string
        payerId: string
        amount: number
        place: string | null
        hasAlbum: boolean
        memo: string | null
        eventId: string | null
        participants: { create: { memberId: string }[] }
      }
    }
    expect(args.data.eventDate).toEqual(new Date('2026-05-15'))
    expect(args.data.eventName).toBe('花見男気')
    expect(args.data.payerId).toBe('00000000-0000-0000-0000-000000000010')
    expect(args.data.amount).toBe(12000)
    expect(args.data.place).toBe('新宿御苑')
    expect(args.data.hasAlbum).toBe(true)
    expect(args.data.memo).toBe('テストメモ')
    expect(args.data.eventId).toBe('00000000-0000-0000-0000-000000000020')
    expect(args.data.participants.create).toEqual([
      { memberId: '00000000-0000-0000-0000-000000000001' },
      { memberId: '00000000-0000-0000-0000-000000000002' },
    ])

    expect(mockedInvalidateStatsCache).toHaveBeenCalledTimes(1)
  })

  test('eventDate 欠損 → 400 + Prisma / キャッシュ無効化は呼ばれない', async () => {
    const { eventDate: _omit, ...body } = validPayload
    void _omit
    const res = await POST(
      createRequest('/api/otokogi', { method: 'POST', body })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('イベント日')
    expect(mockedCreate).not.toHaveBeenCalled()
    expect(mockedInvalidateStatsCache).not.toHaveBeenCalled()
  })

  test('eventName 欠損 → 400', async () => {
    const { eventName: _omit, ...body } = validPayload
    void _omit
    const res = await POST(
      createRequest('/api/otokogi', { method: 'POST', body })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('イベント名')
    expect(mockedCreate).not.toHaveBeenCalled()
    expect(mockedInvalidateStatsCache).not.toHaveBeenCalled()
  })

  test('eventName 空文字 → 400', async () => {
    const res = await POST(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: { ...validPayload, eventName: '' },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('イベント名')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('payerId 欠損 → 400', async () => {
    const { payerId: _omit, ...body } = validPayload
    void _omit
    const res = await POST(
      createRequest('/api/otokogi', { method: 'POST', body })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('支払い担当')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('amount 欠損 → 400', async () => {
    const { amount: _omit, ...body } = validPayload
    void _omit
    const res = await POST(
      createRequest('/api/otokogi', { method: 'POST', body })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('金額')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('amount が負数 → 400', async () => {
    const res = await POST(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: { ...validPayload, amount: -100 },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('金額')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('amount が 0 → 400（positive でない）', async () => {
    const res = await POST(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: { ...validPayload, amount: 0 },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('金額')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('amount が小数 → 400（int でない）', async () => {
    const res = await POST(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: { ...validPayload, amount: 100.5 },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('金額')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('participantIds 欠損 → 400', async () => {
    const { participantIds: _omit, ...body } = validPayload
    void _omit
    const res = await POST(
      createRequest('/api/otokogi', { method: 'POST', body })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('参加メンバー')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('participantIds が空配列 → 400', async () => {
    const res = await POST(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: { ...validPayload, participantIds: [] },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('参加メンバー')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('ボディが空オブジェクト → 400（必須項目欠損）', async () => {
    const res = await POST(
      createRequest('/api/otokogi', { method: 'POST', body: {} })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedCreate).not.toHaveBeenCalled()
    expect(mockedInvalidateStatsCache).not.toHaveBeenCalled()
  })

  test('不正な JSON ボディ → 400', async () => {
    const rawReq = new NextRequest('http://localhost:3000/api/otokogi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json',
    })
    const res = await POST(rawReq)
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedCreate).not.toHaveBeenCalled()
    expect(mockedInvalidateStatsCache).not.toHaveBeenCalled()
  })

  test('Prisma create が例外を投げる → 500 + fallbackMessage、キャッシュも無効化されない', async () => {
    mockedCreate.mockRejectedValue(new Error('DB error'))

    const res = await POST(
      createRequest('/api/otokogi', { method: 'POST', body: validPayload })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('男気イベントの作成に失敗しました')
    expect(mockedInvalidateStatsCache).not.toHaveBeenCalled()
  })
})
