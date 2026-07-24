/**
 * API リクエストボディ検証テスト — The botch
 *
 * ボディサイズ制限（1MB）・文字列長上限・配列件数上限を検証。
 * バリデーションで 400 が返るケースのみを対象とするため DB 接続は不要。
 * 実行: npx vitest run tests/api-validation.test.ts
 */
import { describe, test, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { readJsonBody, MAX_BODY_BYTES, MAX_PARTICIPANTS } from '@/lib/api-validation'
import { createRequest, parseResponse, makeParams } from './helpers'

import { POST as createOtokogi } from '@/app/api/otokogi/route'
import { POST as createWarikan } from '@/app/api/warikan/route'
import { POST as createMember } from '@/app/api/members/route'
import { PUT as putBankAccount } from '@/app/api/members/[id]/bank-account/route'

/** 生ボディ文字列から NextRequest を生成する（サイズ制限テスト用） */
function createRawRequest(rawBody: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  })
}

describe('readJsonBody — ボディサイズ制限', () => {
  test('1MB 超過のボディ → 400', async () => {
    // JSON 文字列として 1MB を超えるボディ
    const rawBody = '"' + 'x'.repeat(MAX_BODY_BYTES) + '"'
    const result = await readJsonBody(createRawRequest(rawBody))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      const { status, data } = await parseResponse<{ error: string }>(result.response)
      expect(status).toBe(400)
      expect(data.error).toContain('大きすぎます')
    }
  })

  test('Content-Length ヘッダーが上限超過 → 400（ボディを読まずに拒否）', async () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(MAX_BODY_BYTES + 1),
      },
      body: '{}',
    })
    const result = await readJsonBody(request)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
    }
  })

  test('不正な JSON → 400', async () => {
    const result = await readJsonBody(createRawRequest('{invalid json'))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      const { status, data } = await parseResponse<{ error: string }>(result.response)
      expect(status).toBe(400)
      expect(data.error).toContain('JSON')
    }
  })

  test('上限以内の正常な JSON → パース成功', async () => {
    const result = await readJsonBody(createRawRequest('{"name":"テスト"}'))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.body).toEqual({ name: 'テスト' })
    }
  })
})

describe('participantIds — 最大件数バリデーション', () => {
  const basePayload = {
    eventDate: '2026-07-24',
    eventName: 'テストイベント',
    payerId: '00000000-0000-0000-0000-000000000000',
    amount: 1000,
  }

  test(`POST /api/otokogi — participantIds ${MAX_PARTICIPANTS + 1}件 → 400`, async () => {
    const participantIds = Array.from({ length: MAX_PARTICIPANTS + 1 }, (_, i) => `member-${i}`)
    const res = await createOtokogi(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: { ...basePayload, participantIds },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain(`最大${MAX_PARTICIPANTS}件`)
  })

  test(`POST /api/warikan — participantIds ${MAX_PARTICIPANTS + 1}件 → 400`, async () => {
    const participantIds = Array.from({ length: MAX_PARTICIPANTS + 1 }, (_, i) => `member-${i}`)
    const res = await createWarikan(
      createRequest('/api/warikan', {
        method: 'POST',
        body: { eventName: 'テスト割り勘', participantIds },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain(`最大${MAX_PARTICIPANTS}件`)
  })

  test('POST /api/otokogi — participantIds 空配列 → 400', async () => {
    const res = await createOtokogi(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: { ...basePayload, participantIds: [] },
      })
    )
    const { status } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
  })
})

describe('文字列フィールド — 最大長バリデーション', () => {
  test('POST /api/otokogi — eventName 101文字 → 400', async () => {
    const res = await createOtokogi(
      createRequest('/api/otokogi', {
        method: 'POST',
        body: {
          eventDate: '2026-07-24',
          eventName: 'あ'.repeat(101),
          payerId: '00000000-0000-0000-0000-000000000000',
          amount: 1000,
          participantIds: ['00000000-0000-0000-0000-000000000000'],
        },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('100文字')
  })

  test('POST /api/warikan — eventName 201文字 → 400', async () => {
    const res = await createWarikan(
      createRequest('/api/warikan', {
        method: 'POST',
        body: {
          eventName: 'あ'.repeat(201),
          participantIds: ['00000000-0000-0000-0000-000000000000'],
        },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('200文字')
  })

  test('POST /api/members — name 101文字 → 400', async () => {
    const res = await createMember(
      createRequest('/api/members', {
        method: 'POST',
        body: { name: 'あ'.repeat(101), fullName: 'テスト', initial: 'T' },
      })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('100文字')
  })

  test('PUT /api/members/[id]/bank-account — 銀行名51文字 → 400', async () => {
    const res = await putBankAccount(
      createRequest('/api/members/dummy-id/bank-account', {
        method: 'PUT',
        body: {
          bankName: 'あ'.repeat(51),
          branchName: 'テスト支店',
          accountType: 'SAVINGS',
          accountNumber: '1234567',
          accountHolder: 'テスト太郎',
        },
      }),
      makeParams({ id: 'dummy-id' })
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('50文字')
  })

  test('POST /api/otokogi — ボディ 1MB 超過 → 400', async () => {
    const res = await createOtokogi(
      createRawRequest('{"memo":"' + 'x'.repeat(MAX_BODY_BYTES) + '"}')
    )
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toContain('大きすぎます')
  })
})
