/**
 * /api/members GET・POST の単体テスト
 *
 * Prisma クライアントを vi.mock でモックし、Route Handler の入出力・
 * バリデーション・エラーハンドリングを DB なしで検証する。
 * 実行: npx vitest run tests/members-route.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createRequest, parseResponse } from './helpers'

// Prisma クライアントをモック（Route Handler のインポート前に定義。vi.mock は hoisting される）
vi.mock('@/lib/prisma', () => ({
  prisma: {
    member: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

// モック定義後にインポート
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/members/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedFindMany = prisma.member.findMany as unknown as MockFn
const mockedCreate = prisma.member.create as unknown as MockFn

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
// GET /api/members
// ============================================================
describe('GET /api/members', () => {
  test('正常系 → 200 と isActive:true のメンバー一覧を返す', async () => {
    const fakeMembers = [
      { id: 'm1', name: 'あ', fullName: 'あさん', bankAccount: { id: 'b1' } },
      { id: 'm2', name: 'い', fullName: 'いさん', bankAccount: null },
    ]
    mockedFindMany.mockResolvedValue(fakeMembers)

    const res = await GET(createRequest('/api/members'))
    const { status, data } = await parseResponse<typeof fakeMembers>(res)

    expect(status).toBe(200)
    expect(data).toHaveLength(2)
    expect(data[0].id).toBe('m1')
    expect(data[1].id).toBe('m2')
    expect(mockedFindMany).toHaveBeenCalledTimes(1)
    expect(mockedFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { bankAccount: { select: { id: true } } },
    })
  })

  test('Cache-Control ヘッダーが private, max-age=300 で返る', async () => {
    mockedFindMany.mockResolvedValue([])

    const res = await GET(createRequest('/api/members'))

    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300')
  })

  test('メンバーが 0 件でも 200 と空配列を返す', async () => {
    mockedFindMany.mockResolvedValue([])

    const res = await GET(createRequest('/api/members'))
    const { status, data } = await parseResponse<unknown[]>(res)

    expect(status).toBe(200)
    expect(data).toEqual([])
  })

  test('Prisma が例外を投げる → 500 + fallbackMessage', async () => {
    mockedFindMany.mockRejectedValue(new Error('DB error'))

    const res = await GET(createRequest('/api/members'))
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('メンバー一覧の取得に失敗しました')
  })
})

// ============================================================
// POST /api/members
// ============================================================
describe('POST /api/members', () => {
  const validPayload = {
    name: 'テスト',
    fullName: 'テスト太郎',
    initial: 'T',
  }

  test('正常系（最小ボディ） → 201 と作成メンバーを返し、色はデフォルト、paypayId は null', async () => {
    const fakeCreated = {
      id: 'created-id',
      name: 'テスト',
      fullName: 'テスト太郎',
      initial: 'T',
      colorBg: 'bg-gray-100',
      colorText: 'text-gray-700',
      paypayId: null,
    }
    mockedCreate.mockResolvedValue(fakeCreated)

    const res = await POST(
      createRequest('/api/members', { method: 'POST', body: validPayload })
    )
    const { status, data } = await parseResponse<{ id: string }>(res)

    expect(status).toBe(201)
    expect(data.id).toBe('created-id')
    expect(mockedCreate).toHaveBeenCalledTimes(1)

    const args = mockedCreate.mock.calls[0][0] as {
      data: {
        name: string
        fullName: string
        initial: string
        colorBg: string
        colorText: string
        paypayId: string | null
      }
    }
    expect(args.data.name).toBe('テスト')
    expect(args.data.fullName).toBe('テスト太郎')
    expect(args.data.initial).toBe('T')
    // colorBg / colorText 未指定 → デフォルト
    expect(args.data.colorBg).toBe('bg-gray-100')
    expect(args.data.colorText).toBe('text-gray-700')
    // paypayId 未指定 → null
    expect(args.data.paypayId).toBeNull()
  })

  test('全フィールド指定 → 指定値がそのまま反映される', async () => {
    mockedCreate.mockResolvedValue({ id: 'full-created' })

    const res = await POST(
      createRequest('/api/members', {
        method: 'POST',
        body: {
          name: 'あ',
          fullName: 'あさん',
          initial: 'A',
          colorBg: 'bg-red-100',
          colorText: 'text-red-700',
          paypayId: 'paypay-id-1',
        },
      })
    )
    const { status } = await parseResponse(res)

    expect(status).toBe(201)
    const args = mockedCreate.mock.calls[0][0] as {
      data: {
        name: string
        fullName: string
        initial: string
        colorBg: string
        colorText: string
        paypayId: string | null
      }
    }
    expect(args.data.name).toBe('あ')
    expect(args.data.fullName).toBe('あさん')
    expect(args.data.initial).toBe('A')
    expect(args.data.colorBg).toBe('bg-red-100')
    expect(args.data.colorText).toBe('text-red-700')
    expect(args.data.paypayId).toBe('paypay-id-1')
  })

  test('paypayId に null を明示指定 → null で保存される', async () => {
    mockedCreate.mockResolvedValue({ id: 'null-paypay' })

    const res = await POST(
      createRequest('/api/members', {
        method: 'POST',
        body: { ...validPayload, paypayId: null },
      })
    )
    const { status } = await parseResponse(res)

    expect(status).toBe(201)
    const args = mockedCreate.mock.calls[0][0] as {
      data: { paypayId: string | null }
    }
    expect(args.data.paypayId).toBeNull()
  })

  test('重複 name（P2002） → 409 + ユーザー向けメッセージ', async () => {
    // Prisma の一意制約違反エラーを模擬
    const err = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    })
    mockedCreate.mockRejectedValue(err)

    const res = await POST(
      createRequest('/api/members', { method: 'POST', body: validPayload })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(409)
    expect(data.error).toBe('その名前は既に使用されています')
  })

  test('name 欠損 → 400 + Prisma は呼ばれない', async () => {
    const { name: _omit, ...body } = validPayload
    void _omit
    const res = await POST(
      createRequest('/api/members', { method: 'POST', body })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('ニックネーム')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('name 空文字 → 400', async () => {
    const res = await POST(
      createRequest('/api/members', {
        method: 'POST',
        body: { ...validPayload, name: '' },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('ニックネーム')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('fullName 欠損 → 400', async () => {
    const { fullName: _omit, ...body } = validPayload
    void _omit
    const res = await POST(
      createRequest('/api/members', { method: 'POST', body })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('フルネーム')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('initial 欠損 → 400', async () => {
    const { initial: _omit, ...body } = validPayload
    void _omit
    const res = await POST(
      createRequest('/api/members', { method: 'POST', body })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('イニシャル')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('initial が 2 文字以上 → 400（Char(1) の DB 制約に対応）', async () => {
    const res = await POST(
      createRequest('/api/members', {
        method: 'POST',
        body: { ...validPayload, initial: 'AB' },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('イニシャル')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('ボディが空オブジェクト → 400（必須項目欠損）', async () => {
    const res = await POST(
      createRequest('/api/members', { method: 'POST', body: {} })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('不正な JSON ボディ → 400', async () => {
    const rawReq = new NextRequest('http://localhost:3000/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json',
    })
    const res = await POST(rawReq)
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  test('Prisma create が想定外エラーを投げる → 500 + fallbackMessage', async () => {
    mockedCreate.mockRejectedValue(new Error('DB error'))

    const res = await POST(
      createRequest('/api/members', { method: 'POST', body: validPayload })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('メンバーの作成に失敗しました')
  })
})
