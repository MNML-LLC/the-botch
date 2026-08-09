/**
 * 銀行口座機能テスト — The botch
 *
 * 正常系・異常系・境界値・認可（クロスリソースアクセス）を網羅。
 * ローカルDB（the_botch）を使用。テストデータは各テスト後にクリーンアップ。
 * 実行: npx vitest run tests/bank-account.test.ts
 */
import { describe, test, expect, afterAll, beforeAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createRequest, parseResponse, makeParams } from './helpers'

// --- API Route Handlers のインポート ---
import {
  GET as getBankAccount,
  PUT as putBankAccount,
  DELETE as deleteBankAccount,
} from '@/app/api/members/[id]/bank-account/route'
import {
  GET as getMembersAll,
  POST as createMember,
} from '@/app/api/members/route'

// --- テストデータ管理 ---
const createdMemberIds: string[] = []
let existingMemberId: string // 既存メンバー（テスト用）
let testMemberId: string // テスト専用メンバー

// テスト前にメンバーを準備
beforeAll(async () => {
  // 既存メンバーを取得
  const res = await getMembersAll()
  const { data: members } = await parseResponse<{ id: string; name: string }[]>(res)

  if (members.length > 0) {
    existingMemberId = members[0].id
  } else {
    // CI の新規 DB にメンバーがいない場合はシードメンバーを作成
    const seedRes = await createMember(
      createRequest('/api/members', {
        method: 'POST',
        body: {
          name: '田中',
          fullName: '田中一郎',
          initial: 'T',
          colorBg: 'bg-blue-100',
          colorText: 'text-blue-700',
        },
      })
    )
    const { data: seedMember } = await parseResponse<{ id: string }>(seedRes)
    existingMemberId = seedMember.id
    createdMemberIds.push(existingMemberId)
  }

  // テスト専用メンバーを作成
  const createRes = await createMember(
    createRequest('/api/members', {
      method: 'POST',
      body: {
        name: 'テスト口座_' + Date.now(),
        fullName: '口座テスト',
        initial: 'B',
        colorBg: 'bg-gray-100',
        colorText: 'text-gray-700',
      },
    })
  )
  const { data: member } = await parseResponse<{ id: string }>(createRes)
  testMemberId = member.id
  createdMemberIds.push(testMemberId)
})

// クリーンアップ
afterAll(async () => {
  // テスト用メンバーの口座を削除
  for (const id of createdMemberIds) {
    await prisma.bankAccount.delete({ where: { memberId: id } }).catch(() => {})
    await prisma.member.delete({ where: { id } }).catch(() => {})
  }
  await prisma.$disconnect()
})

// 有効な口座データ
const validBankData = {
  bankName: '三菱UFJ銀行',
  branchName: '渋谷支店',
  accountType: 'SAVINGS',
  accountNumber: '1234567',
  accountHolder: 'ウチヤマ ユウキ',
}

// ============================================================
// 正常系テスト（ハッピーパス）
// ============================================================
describe('口座情報: 正常系', () => {
  test('PUT — 新規口座登録', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: validBankData,
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{
      bankName: string
      branchName: string
      accountType: string
      accountNumber: string
      accountHolder: string
      memberId: string
    }>(res)
    expect(status).toBe(200)
    expect(data.bankName).toBe('三菱UFJ銀行')
    expect(data.branchName).toBe('渋谷支店')
    expect(data.accountType).toBe('SAVINGS')
    expect(data.accountNumber).toBe('1234567')
    expect(data.accountHolder).toBe('ウチヤマ ユウキ')
    expect(data.memberId).toBe(testMemberId)
  })

  test('GET — 登録済み口座の取得', async () => {
    const res = await getBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{
      bankName: string
      accountNumber: string
    }>(res)
    expect(status).toBe(200)
    expect(data.bankName).toBe('三菱UFJ銀行')
    expect(data.accountNumber).toBe('1234567')
  })

  test('PUT — 口座情報更新（upsert）', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: {
          ...validBankData,
          bankName: 'みずほ銀行',
          branchName: '新宿支店',
          accountType: 'CHECKING',
          accountNumber: '7654321',
          accountHolder: 'ウチヤマ ユキ',
        },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{
      bankName: string
      branchName: string
      accountType: string
      accountNumber: string
      accountHolder: string
    }>(res)
    expect(status).toBe(200)
    expect(data.bankName).toBe('みずほ銀行')
    expect(data.branchName).toBe('新宿支店')
    expect(data.accountType).toBe('CHECKING')
    expect(data.accountNumber).toBe('7654321')
    expect(data.accountHolder).toBe('ウチヤマ ユキ')
  })

  test('DELETE — 口座情報削除', async () => {
    const res = await deleteBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, { method: 'DELETE' }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ success: boolean }>(res)
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  test('GET — 削除後はnullが返る', async () => {
    const res = await getBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<null>(res)
    expect(status).toBe(200)
    expect(data).toBeNull()
  })

  test('PUT — 前後の空白がトリムされる', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: {
          bankName: '  三菱UFJ銀行  ',
          branchName: '  渋谷支店  ',
          accountType: 'SAVINGS',
          accountNumber: '1234567',
          accountHolder: '  ウチヤマ ユウキ  ',
        },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{
      bankName: string
      branchName: string
      accountHolder: string
    }>(res)
    expect(status).toBe(200)
    expect(data.bankName).toBe('三菱UFJ銀行')
    expect(data.branchName).toBe('渋谷支店')
    expect(data.accountHolder).toBe('ウチヤマ ユウキ')
  })
})

// ============================================================
// 異常系テスト（バリデーション）
// ============================================================
describe('口座情報: 異常系', () => {
  test('PUT — 銀行名なし → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, bankName: '' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('銀行名')
  })

  test('PUT — 銀行名が空白のみ → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, bankName: '   ' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('銀行名')
  })

  test('PUT — 支店名なし → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, branchName: '' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('支店名')
  })

  test('PUT — 口座番号なし → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountNumber: '' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('口座番号')
  })

  test('PUT — 口座番号に文字列 → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountNumber: 'abcdefg' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('口座番号')
  })

  test('PUT — 口座番号に記号・小数 → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountNumber: '123.456' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('口座番号')
  })

  test('PUT — 口座番号が8桁以上 → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountNumber: '12345678' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('口座番号')
  })

  test('PUT — 口座名義なし → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountHolder: '' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('口座名義')
  })

  test('PUT — 口座種別が不正 → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountType: 'INVALID' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('口座種別')
  })

  test('PUT — 口座種別なし → 400', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountType: undefined },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('口座種別')
  })

  test('GET — 存在しないメンバーID → 404', async () => {
    const res = await getBankAccount(
      createRequest('/api/members/nonexistent-member-id/bank-account'),
      makeParams({ id: 'nonexistent-member-id' })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(404)
    expect(data.error).toBeTruthy()
  })

  test('PUT — 存在しないメンバーID → 404', async () => {
    const res = await putBankAccount(
      createRequest('/api/members/nonexistent-member-id/bank-account', {
        method: 'PUT',
        body: validBankData,
      }),
      makeParams({ id: 'nonexistent-member-id' })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(404)
    expect(data.error).toBeTruthy()
  })

  test('DELETE — 存在しないメンバーID → 404', async () => {
    const res = await deleteBankAccount(
      createRequest('/api/members/nonexistent-member-id/bank-account', { method: 'DELETE' }),
      makeParams({ id: 'nonexistent-member-id' })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(404)
    expect(data.error).toBeTruthy()
  })

  test('DELETE — 口座未登録のメンバーで削除 → 404', async () => {
    // 口座がない状態で削除を試みる（正常系で削除済み or 未登録）
    // まずクリーンアップ
    await prisma.bankAccount.delete({ where: { memberId: testMemberId } }).catch(() => {})

    const res = await deleteBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, { method: 'DELETE' }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(404)
    expect(data.error).toContain('登録されていません')
  })

  test('PUT — エラーレスポンスが { error: "メッセージ" } 形式（スタックトレース漏洩なし）', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, bankName: '' },
      }),
      makeParams({ id: testMemberId })
    )
    const { data } = await parseResponse<Record<string, unknown>>(res)
    // error キーのみ存在すること（stackTrace等が漏洩していないこと）
    expect(data).toHaveProperty('error')
    expect(typeof data.error).toBe('string')
    expect(data).not.toHaveProperty('stack')
    expect(data).not.toHaveProperty('stackTrace')
    expect(data).not.toHaveProperty('message') // Prisma内部メッセージが漏れていない
  })
})

// ============================================================
// 境界値テスト
// ============================================================
describe('口座情報: 境界値', () => {
  test('PUT — 口座番号1桁（最小桁数） → 200', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountNumber: '1' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ accountNumber: string }>(res)
    expect(status).toBe(200)
    expect(data.accountNumber).toBe('1')
  })

  test('PUT — 口座番号7桁（最大桁数） → 200', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountNumber: '1234567' },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ accountNumber: string }>(res)
    expect(status).toBe(200)
    expect(data.accountNumber).toBe('1234567')
  })

  test('PUT — 銀行名50文字（上限ちょうど） → 200', async () => {
    const bankName50 = 'あ'.repeat(50)
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, bankName: bankName50 },
      }),
      makeParams({ id: testMemberId })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(200)
  })

  test('PUT — 銀行名51文字（上限超過） → 400', async () => {
    const bankName51 = 'あ'.repeat(51)
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, bankName: bankName51 },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('50文字')
  })

  test('PUT — 支店名50文字（上限ちょうど） → 200', async () => {
    const branchName50 = 'い'.repeat(50)
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, branchName: branchName50 },
      }),
      makeParams({ id: testMemberId })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(200)
  })

  test('PUT — 支店名51文字（上限超過） → 400', async () => {
    const branchName51 = 'い'.repeat(51)
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, branchName: branchName51 },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('50文字')
  })

  test('PUT — 口座名義100文字（上限ちょうど） → 200', async () => {
    const holder100 = 'ア'.repeat(100)
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountHolder: holder100 },
      }),
      makeParams({ id: testMemberId })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(200)
  })

  test('PUT — 口座名義101文字（上限超過） → 400', async () => {
    const holder101 = 'ア'.repeat(101)
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: { ...validBankData, accountHolder: holder101 },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('100文字')
  })

  test('PUT — 口座名義にカタカナ・全角文字対応', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: {
          ...validBankData,
          accountHolder: 'カ）ウチヤマ　ユウキ',
        },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ accountHolder: string }>(res)
    expect(status).toBe(200)
    expect(data.accountHolder).toBe('カ）ウチヤマ　ユウキ')
  })
})

// ============================================================
// 認可テスト（クロスリソースアクセス防止 — 前回の教訓）
// ============================================================
describe('口座情報: 認可・リソース検証', () => {
  test('GET — 別メンバーIDでのアクセスは自身の口座ではなくそのメンバーの口座が返る', async () => {
    // testMemberId に口座を登録
    await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: validBankData,
      }),
      makeParams({ id: testMemberId })
    )

    // existingMemberId（別メンバー）でGETしても testMemberId の口座は返らない
    const res = await getBankAccount(
      createRequest(`/api/members/${existingMemberId}/bank-account`),
      makeParams({ id: existingMemberId })
    )
    const { status, data } = await parseResponse<{ memberId?: string } | null>(res)
    expect(status).toBe(200)
    // 返るデータがある場合、memberId が existingMemberId であること
    if (data && data.memberId) {
      expect(data.memberId).toBe(existingMemberId)
      expect(data.memberId).not.toBe(testMemberId)
    }
    // null の場合は口座未登録で正常
  })

  test('PUT — bank-accountのmemberIdはURL paramsから取得（リクエストボディで上書き不可）', async () => {
    // リクエストボディに memberId を含めてもURLのIDが使われることを確認
    const res = await putBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`, {
        method: 'PUT',
        body: {
          ...validBankData,
          memberId: existingMemberId, // 別メンバーのIDを注入
        },
      }),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ memberId: string }>(res)
    expect(status).toBe(200)
    // URLのパラメータ（testMemberId）で登録されていること
    expect(data.memberId).toBe(testMemberId)
  })

  test('DELETE — 別メンバーIDで削除しても自分の口座は影響を受けない', async () => {
    // testMemberId に口座がある状態
    // existingMemberId の口座を削除しようとする（口座があってもなくてもtestMemberIdの口座に影響しない）
    await deleteBankAccount(
      createRequest(`/api/members/${existingMemberId}/bank-account`, { method: 'DELETE' }),
      makeParams({ id: existingMemberId })
    ).catch(() => {})

    // testMemberId の口座は残っている
    const res = await getBankAccount(
      createRequest(`/api/members/${testMemberId}/bank-account`),
      makeParams({ id: testMemberId })
    )
    const { status, data } = await parseResponse<{ memberId: string } | null>(res)
    expect(status).toBe(200)
    if (data) {
      expect(data.memberId).toBe(testMemberId)
    }
  })
})

// ============================================================
// ライフサイクルテスト（E2Eフロー: 登録→更新→削除）
// ============================================================
describe('口座情報: ライフサイクル（登録→更新→取得→削除→取得）', () => {
  let lifecycleMemberId: string

  beforeAll(async () => {
    // ライフサイクルテスト専用メンバー
    const createRes = await createMember(
      createRequest('/api/members', {
        method: 'POST',
        body: {
          name: 'テスト_ライフサイクル_' + Date.now(),
          fullName: 'ライフサイクル',
          initial: 'L',
          colorBg: 'bg-blue-100',
          colorText: 'text-blue-700',
        },
      })
    )
    const { data } = await parseResponse<{ id: string }>(createRes)
    lifecycleMemberId = data.id
    createdMemberIds.push(lifecycleMemberId)
  })

  test('1. 口座未登録の状態でGET → null', async () => {
    const res = await getBankAccount(
      createRequest(`/api/members/${lifecycleMemberId}/bank-account`),
      makeParams({ id: lifecycleMemberId })
    )
    const { status, data } = await parseResponse<null>(res)
    expect(status).toBe(200)
    expect(data).toBeNull()
  })

  test('2. 口座登録（PUT）', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${lifecycleMemberId}/bank-account`, {
        method: 'PUT',
        body: validBankData,
      }),
      makeParams({ id: lifecycleMemberId })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(200)
  })

  test('3. 口座取得（GET）で登録内容を確認', async () => {
    const res = await getBankAccount(
      createRequest(`/api/members/${lifecycleMemberId}/bank-account`),
      makeParams({ id: lifecycleMemberId })
    )
    const { status, data } = await parseResponse<{
      bankName: string
      accountNumber: string
    }>(res)
    expect(status).toBe(200)
    expect(data.bankName).toBe('三菱UFJ銀行')
    expect(data.accountNumber).toBe('1234567')
  })

  test('4. 口座更新（PUT upsert）', async () => {
    const res = await putBankAccount(
      createRequest(`/api/members/${lifecycleMemberId}/bank-account`, {
        method: 'PUT',
        body: {
          ...validBankData,
          bankName: 'りそな銀行',
          accountNumber: '9999999',
        },
      }),
      makeParams({ id: lifecycleMemberId })
    )
    const { status, data } = await parseResponse<{
      bankName: string
      accountNumber: string
    }>(res)
    expect(status).toBe(200)
    expect(data.bankName).toBe('りそな銀行')
    expect(data.accountNumber).toBe('9999999')
  })

  test('5. 口座削除（DELETE）', async () => {
    const res = await deleteBankAccount(
      createRequest(`/api/members/${lifecycleMemberId}/bank-account`, { method: 'DELETE' }),
      makeParams({ id: lifecycleMemberId })
    )
    const { status } = await parseResponse(res)
    expect(status).toBe(200)
  })

  test('6. 削除後にGET → null', async () => {
    const res = await getBankAccount(
      createRequest(`/api/members/${lifecycleMemberId}/bank-account`),
      makeParams({ id: lifecycleMemberId })
    )
    const { status, data } = await parseResponse<null>(res)
    expect(status).toBe(200)
    expect(data).toBeNull()
  })
})
