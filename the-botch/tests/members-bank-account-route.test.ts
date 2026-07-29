/**
 * /api/members/[id]/bank-account GET・PUT・DELETE の単体テスト
 *
 * Prisma クライアントを vi.mock でモックし、Route Handler の入出力・
 * バリデーション・エラーハンドリングを DB なしで検証する。
 * DB を必要とする統合テストは `tests/bank-account.test.ts` に別ファイルで存在するが、
 * こちらは vi.mock で完結する単体テスト（PR #169/#170 と同じ形式）。
 * 実行: npx vitest run tests/members-bank-account-route.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createRequest, parseResponse, makeParams } from './helpers'

// Prisma クライアントをモック（Route Handler のインポート前に定義。vi.mock は hoisting される）
vi.mock('@/lib/prisma', () => ({
  prisma: {
    member: {
      findUnique: vi.fn(),
    },
    bankAccount: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

// モック定義後にインポート
import { prisma } from '@/lib/prisma'
import { GET, PUT, DELETE } from '@/app/api/members/[id]/bank-account/route'

type MockFn = ReturnType<typeof vi.fn>
const mockedMemberFindUnique = prisma.member.findUnique as unknown as MockFn
const mockedBankFindUnique = prisma.bankAccount.findUnique as unknown as MockFn
const mockedBankUpsert = prisma.bankAccount.upsert as unknown as MockFn
const mockedBankDelete = prisma.bankAccount.delete as unknown as MockFn

const MEMBER_ID = '00000000-0000-0000-0000-000000000001'

const validPayload = {
  bankName: 'みずほ銀行',
  branchName: '渋谷支店',
  accountType: 'SAVINGS',
  accountNumber: '1234567',
  accountHolder: 'テスト タロウ',
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

// ============================================================
// GET /api/members/[id]/bank-account
// ============================================================
describe('GET /api/members/[id]/bank-account', () => {
  test('登録済みメンバー & 口座あり → 200 と口座情報を返す', async () => {
    mockedMemberFindUnique.mockResolvedValue({ id: MEMBER_ID })
    const fakeAccount = {
      id: 'bank-1',
      memberId: MEMBER_ID,
      bankName: 'みずほ銀行',
      branchName: '渋谷支店',
      accountType: 'SAVINGS',
      accountNumber: '1234567',
      accountHolder: 'テスト タロウ',
    }
    mockedBankFindUnique.mockResolvedValue(fakeAccount)

    const res = await GET(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<typeof fakeAccount>(res)

    expect(status).toBe(200)
    expect(data.bankName).toBe('みずほ銀行')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=600')
    expect(mockedMemberFindUnique).toHaveBeenCalledWith({ where: { id: MEMBER_ID } })
    expect(mockedBankFindUnique).toHaveBeenCalledWith({ where: { memberId: MEMBER_ID } })
  })

  test('登録済みメンバー & 口座なし → 200 と null を返す', async () => {
    mockedMemberFindUnique.mockResolvedValue({ id: MEMBER_ID })
    mockedBankFindUnique.mockResolvedValue(null)

    const res = await GET(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<null>(res)

    expect(status).toBe(200)
    expect(data).toBeNull()
  })

  test('存在しないメンバー ID → 404、bankAccount は問い合わせない', async () => {
    mockedMemberFindUnique.mockResolvedValue(null)

    const res = await GET(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(404)
    expect(data.error).toBe('メンバーが見つかりません')
    expect(mockedBankFindUnique).not.toHaveBeenCalled()
  })

  test('Prisma が例外を投げる → 500 + fallbackMessage', async () => {
    mockedMemberFindUnique.mockRejectedValue(new Error('DB error'))

    const res = await GET(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('口座情報の取得に失敗しました')
  })
})

// ============================================================
// PUT /api/members/[id]/bank-account（upsert）
// ============================================================
describe('PUT /api/members/[id]/bank-account', () => {
  test('正常系 → 200 と upsert が where / update / create すべて設定して呼ばれる', async () => {
    const fakeUpserted = { id: 'bank-1', memberId: MEMBER_ID, ...validPayload }
    mockedBankUpsert.mockResolvedValue(fakeUpserted)

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: validPayload,
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<typeof fakeUpserted>(res)

    expect(status).toBe(200)
    expect(data.bankName).toBe('みずほ銀行')

    const args = mockedBankUpsert.mock.calls[0][0] as {
      where: { memberId: string }
      update: Record<string, string>
      create: Record<string, string>
    }
    expect(args.where).toEqual({ memberId: MEMBER_ID })
    // update と create どちらにも同じ内容が入る（upsert）
    expect(args.update.bankName).toBe('みずほ銀行')
    expect(args.update.branchName).toBe('渋谷支店')
    expect(args.update.accountType).toBe('SAVINGS')
    expect(args.update.accountNumber).toBe('1234567')
    expect(args.update.accountHolder).toBe('テスト タロウ')
    expect(args.create.memberId).toBe(MEMBER_ID)
    expect(args.create.bankName).toBe('みずほ銀行')
  })

  test('accountType CHECKING → そのまま upsert に渡る', async () => {
    mockedBankUpsert.mockResolvedValue({ id: 'bank-1' })

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: { ...validPayload, accountType: 'CHECKING' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status } = await parseResponse(res)

    expect(status).toBe(200)
    const args = mockedBankUpsert.mock.calls[0][0] as {
      update: { accountType: string }
    }
    expect(args.update.accountType).toBe('CHECKING')
  })

  test('前後の空白は trim されて保存される', async () => {
    mockedBankUpsert.mockResolvedValue({ id: 'bank-1' })

    await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: {
          ...validPayload,
          bankName: '  みずほ銀行  ',
          branchName: '  渋谷支店  ',
          accountHolder: '  テスト タロウ  ',
        },
      }),
      makeParams({ id: MEMBER_ID })
    )

    const args = mockedBankUpsert.mock.calls[0][0] as {
      update: { bankName: string; branchName: string; accountHolder: string }
    }
    expect(args.update.bankName).toBe('みずほ銀行')
    expect(args.update.branchName).toBe('渋谷支店')
    expect(args.update.accountHolder).toBe('テスト タロウ')
  })

  test('bankName 欠損 → 400 + upsert は呼ばれない', async () => {
    const { bankName: _omit, ...body } = validPayload
    void _omit

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body,
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('銀行名')
    expect(mockedBankUpsert).not.toHaveBeenCalled()
  })

  test('bankName 空文字（trim 後空） → 400', async () => {
    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: { ...validPayload, bankName: '   ' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('銀行名')
    expect(mockedBankUpsert).not.toHaveBeenCalled()
  })

  test('accountNumber が 8 桁以上 → 400', async () => {
    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: { ...validPayload, accountNumber: '12345678' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('口座番号')
    expect(mockedBankUpsert).not.toHaveBeenCalled()
  })

  test('accountNumber に非数字が混在 → 400', async () => {
    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: { ...validPayload, accountNumber: '12a4567' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('口座番号')
    expect(mockedBankUpsert).not.toHaveBeenCalled()
  })

  test('accountType が不正な値 → 400', async () => {
    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: { ...validPayload, accountType: 'INVALID' },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('口座種別')
    expect(mockedBankUpsert).not.toHaveBeenCalled()
  })

  test('accountHolder が 101 文字以上 → 400', async () => {
    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: { ...validPayload, accountHolder: 'あ'.repeat(101) },
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(400)
    expect(data.error).toContain('口座名義')
    expect(mockedBankUpsert).not.toHaveBeenCalled()
  })

  test('存在しないメンバー ID（P2003） → 404', async () => {
    const err = Object.assign(new Error('FK violation'), { code: 'P2003' })
    mockedBankUpsert.mockRejectedValue(err)

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: validPayload,
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(404)
    expect(data.error).toBe('メンバーが見つかりません')
  })

  test('不正な JSON ボディ → 400', async () => {
    const rawReq = new NextRequest(
      `http://localhost:3000/api/members/${MEMBER_ID}/bank-account`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      }
    )
    const res = await PUT(rawReq, makeParams({ id: MEMBER_ID }))
    const { status } = await parseResponse(res)
    expect(status).toBe(400)
    expect(mockedBankUpsert).not.toHaveBeenCalled()
  })

  test('Prisma upsert が想定外エラーを投げる → 500', async () => {
    mockedBankUpsert.mockRejectedValue(new Error('DB error'))

    const res = await PUT(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'PUT',
        body: validPayload,
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('口座情報の更新に失敗しました')
  })
})

// ============================================================
// DELETE /api/members/[id]/bank-account
// ============================================================
describe('DELETE /api/members/[id]/bank-account', () => {
  test('正常系 → 200 と success:true', async () => {
    mockedBankDelete.mockResolvedValue({ id: 'bank-1' })

    const res = await DELETE(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'DELETE',
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ success: boolean }>(res)

    expect(status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockedBankDelete).toHaveBeenCalledWith({ where: { memberId: MEMBER_ID } })
  })

  test('口座未登録（P2025） → 404', async () => {
    const err = Object.assign(new Error('Record not found'), { code: 'P2025' })
    mockedBankDelete.mockRejectedValue(err)

    const res = await DELETE(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'DELETE',
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(404)
    expect(data.error).toBe('口座情報が登録されていません')
  })

  test('Prisma delete が想定外エラーを投げる → 500', async () => {
    mockedBankDelete.mockRejectedValue(new Error('DB error'))

    const res = await DELETE(
      createRequest(`/api/members/${MEMBER_ID}/bank-account`, {
        method: 'DELETE',
      }),
      makeParams({ id: MEMBER_ID })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)

    expect(status).toBe(500)
    expect(data.error).toBe('口座情報の削除に失敗しました')
  })
})
