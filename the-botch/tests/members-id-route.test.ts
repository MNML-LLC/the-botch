/**
 * /api/members/[id] GET・PUT・DELETE の単体テスト
 *
 * Prisma クライアントを vi.mock でモックし、Route Handler の入出力・
 * バリデーション・エラーハンドリングを DB なしで検証する。
 * 実行: npx vitest run tests/members-id-route.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createRequest, parseResponse, makeParams } from './helpers'

// Prisma クライアントをモック（Route Handler のインポート前に定義。vi.mock は hoisting される）
vi.mock('@/lib/prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    otokogiEvent: {
      aggregate: vi.fn(),
    },
    warikanExpense: {
      aggregate: vi.fn(),
    },
  },
}))

// モック定義後にインポート
import { prisma } from '@/lib/prisma'
import { GET, PUT, DELETE } from '@/app/api/members/[id]/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedFindUnique = prisma.member.findUnique as unknown as MockFn
const mockedUpdate = prisma.member.update as unknown as MockFn
const mockedOtokogiAggregate = prisma.otokogiEvent.aggregate as unknown as MockFn
const mockedWarikanExpenseAggregate = prisma.warikanExpense.aggregate as unknown as MockFn

const emptyAgg = { _sum: { amount: null }, _count: 0 }

const MEMBER_ID = '00000000-0000-0000-0000-000000000001'

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

// ============================================================
// GET /api/members/[id]
// ============================================================
describe('GET /api/members/[id]', () => {
  test('存在するメンバー → 200 と参加履歴・統計を含む、Cache-Control:private,max-age=600', async () => {
    const fakeMember = {
      id: MEMBER_ID,
      name: 'あ',
      fullName: 'あさん',
      isActive: true,
      otokogiParticipations: [
        {
          otokogiEvent: {
            id: 'ot-1',
            eventDate: new Date('2026-01-15'),
            eventName: '新年会',
            amount: 12000,
            place: '渋谷',
            payer: {
              id: MEMBER_ID,
              name: 'あ',
              initial: 'A',
              colorBg: 'bg-red-100',
              colorText: 'text-red-700',
            },
          },
        },
      ],
      warikanParticipations: [
        {
          warikanEvent: {
            id: 'wk-1',
            eventName: '合宿',
            status: 'CLOSED',
            detailDeadline: null,
            paymentDeadline: null,
            displayDate: new Date('2026-02-01'),
            createdAt: new Date('2026-02-05'),
          },
        },
      ],
    }
    mockedFindUnique.mockResolvedValue(fakeMember)
    mockedOtokogiAggregate.mockResolvedValue({ _sum: { amount: 30000 }, _count: 2 })
    mockedWarikanExpenseAggregate.mockResolvedValue({ _sum: { amount: 5000 }, _count: 1 })

    const res = await GET(
      createRequest(`/api/members/${MEMBER_ID}`),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{
      id: string
      stats: {
        otokogiParticipationCount: number
        warikanParticipationCount: number
        otokogiPaidCount: number
        otokogiPaidTotal: number
        warikanPaidCount: number
        warikanPaidTotal: number
        totalPaid: number
      }
      otokogiParticipations: unknown[]
      warikanParticipations: unknown[]
    }>(res)

    expect(status).toBe(200)
    expect(data.id).toBe(MEMBER_ID)
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=600')
    expect(data.stats).toEqual({
      otokogiParticipationCount: 1,
      warikanParticipationCount: 1,
      otokogiPaidCount: 2,
      otokogiPaidTotal: 30000,
      warikanPaidCount: 1,
      warikanPaidTotal: 5000,
      totalPaid: 35000,
    })
    expect(data.otokogiParticipations).toHaveLength(1)
    expect(data.warikanParticipations).toHaveLength(1)

    const findUniqueArgs = mockedFindUnique.mock.calls[0][0] as { where: { id: string } }
    expect(findUniqueArgs.where).toEqual({ id: MEMBER_ID })
    expect(mockedOtokogiAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { payerId: MEMBER_ID } })
    )
    expect(mockedWarikanExpenseAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { payerId: MEMBER_ID } })
    )
  })

  test('参加履歴なし・支払い実績なし → 統計は 0 埋め', async () => {
    mockedFindUnique.mockResolvedValue({
      id: MEMBER_ID,
      name: 'あ',
      otokogiParticipations: [],
      warikanParticipations: [],
    })
    mockedOtokogiAggregate.mockResolvedValue(emptyAgg)
    mockedWarikanExpenseAggregate.mockResolvedValue(emptyAgg)

    const res = await GET(
      createRequest(`/api/members/${MEMBER_ID}`),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{
      stats: {
        otokogiParticipationCount: number
        warikanParticipationCount: number
        otokogiPaidTotal: number
        warikanPaidTotal: number
        totalPaid: number
      }
    }>(res)

    expect(status).toBe(200)
    expect(data.stats.otokogiParticipationCount).toBe(0)
    expect(data.stats.warikanParticipationCount).toBe(0)
    expect(data.stats.otokogiPaidTotal).toBe(0)
    expect(data.stats.warikanPaidTotal).toBe(0)
    expect(data.stats.totalPaid).toBe(0)
  })

  test('存在しないメンバー → 404（aggregate は呼ばれない）', async () => {
    mockedFindUnique.mockResolvedValue(null)

    const res = await GET(
      createRequest(`/api/members/${MEMBER_ID}`),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(404)
    expect(data.error).toBe('メンバーが見つかりません')
    expect(mockedOtokogiAggregate).not.toHaveBeenCalled()
    expect(mockedWarikanExpenseAggregate).not.toHaveBeenCalled()
  })

  test('Prisma が例外を投げる → 500 + fallbackMessage', async () => {
    mockedFindUnique.mockRejectedValue(new Error('DB error'))

    const res = await GET(
      createRequest(`/api/members/${MEMBER_ID}`),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('メンバー詳細の取得に失敗しました')
  })
})

// ============================================================
// PUT /api/members/[id]
// ============================================================
describe('PUT /api/members/[id]', () => {
  test('部分更新（name のみ） → 200 と update が指定フィールドのみで呼ばれる', async () => {
    const fakeUpdated = { id: MEMBER_ID, name: '新しい名前' }
    mockedUpdate.mockResolvedValue(fakeUpdated)

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}`, {
        method: 'PUT',
        body: { name: '新しい名前' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ id: string; name: string }>(res)

    expect(status).toBe(200)
    expect(data.name).toBe('新しい名前')

    const args = mockedUpdate.mock.calls[0][0] as {
      where: { id: string }
      data: Record<string, unknown>
    }
    expect(args.where).toEqual({ id: MEMBER_ID })
    // 指定した name のみが data に含まれる（他のフィールドは undefined のまま送られない）
    expect(args.data).toEqual({ name: '新しい名前' })
  })

  test('全フィールド更新 → data に全項目が反映される', async () => {
    mockedUpdate.mockResolvedValue({ id: MEMBER_ID })

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}`, {
        method: 'PUT',
        body: {
          name: 'あ',
          fullName: 'あさん',
          initial: 'A',
          colorBg: 'bg-red-100',
          colorText: 'text-red-700',
          paypayId: 'paypay-id-1',
          isActive: false,
        },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status } = await parseResponse(res)

    expect(status).toBe(200)
    const args = mockedUpdate.mock.calls[0][0] as {
      data: {
        name: string
        fullName: string
        initial: string
        colorBg: string
        colorText: string
        paypayId: string | null
        isActive: boolean
      }
    }
    expect(args.data.name).toBe('あ')
    expect(args.data.fullName).toBe('あさん')
    expect(args.data.initial).toBe('A')
    expect(args.data.colorBg).toBe('bg-red-100')
    expect(args.data.colorText).toBe('text-red-700')
    expect(args.data.paypayId).toBe('paypay-id-1')
    expect(args.data.isActive).toBe(false)
  })

  test('paypayId に null を明示指定 → data.paypayId は null', async () => {
    mockedUpdate.mockResolvedValue({ id: MEMBER_ID })

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}`, {
        method: 'PUT',
        body: { paypayId: null },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status } = await parseResponse(res)

    expect(status).toBe(200)
    const args = mockedUpdate.mock.calls[0][0] as {
      data: { paypayId: string | null }
    }
    expect(args.data.paypayId).toBeNull()
  })

  test('name 空文字 → 400 + Prisma は呼ばれない', async () => {
    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}`, {
        method: 'PUT',
        body: { name: '' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('ニックネーム')
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  test('isActive が非 boolean → 400', async () => {
    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}`, {
        method: 'PUT',
        body: { isActive: 'yes' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('有効/無効')
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  test('存在しないメンバー ID（P2025） → 404', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'P2025' })
    mockedUpdate.mockRejectedValue(err)

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}`, {
        method: 'PUT',
        body: { name: '新しい名前' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(404)
    expect(data.error).toBe('メンバーが見つかりません')
  })

  test('不正な JSON ボディ → 400', async () => {
    const rawReq = new NextRequest(
      `http://localhost:3000/api/members/${MEMBER_ID}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      }
    )
    const res = await PUT(rawReq, makeParams({ id: MEMBER_ID }))
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  test('Prisma update が想定外エラーを投げる → 500 + fallbackMessage', async () => {
    mockedUpdate.mockRejectedValue(new Error('DB error'))

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}`, {
        method: 'PUT',
        body: { name: 'x' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('メンバーの更新に失敗しました')
  })
})

// ============================================================
// DELETE /api/members/[id]（論理削除）
// ============================================================
describe('DELETE /api/members/[id]', () => {
  test('正常系 → 200 と isActive:false で update される', async () => {
    mockedUpdate.mockResolvedValue({ id: MEMBER_ID, isActive: false })

    const res = await DELETE(
      createRequest(`/api/members/${MEMBER_ID}`, { method: 'DELETE' }),
      makeParams({ id: MEMBER_ID })
    )
    const { status } = await parseResponse(res)

    expect(status).toBe(200)
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: { isActive: false },
    })
  })

  test('存在しないメンバー ID（P2025） → 404', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'P2025' })
    mockedUpdate.mockRejectedValue(err)

    const res = await DELETE(
      createRequest(`/api/members/${MEMBER_ID}`, { method: 'DELETE' }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(404)
    expect(data.error).toBe('メンバーが見つかりません')
  })

  test('Prisma update が想定外エラーを投げる → 500', async () => {
    mockedUpdate.mockRejectedValue(new Error('DB error'))

    const res = await DELETE(
      createRequest(`/api/members/${MEMBER_ID}`, { method: 'DELETE' }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('メンバーの削除に失敗しました')
  })
})
