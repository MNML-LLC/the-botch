/**
 * handleApiError（API Route 共通エラーハンドリング）のテスト
 *
 * DB 不要のユニットテスト。
 * 実行: npx vitest run tests/api-utils.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { handleApiError } from '@/lib/api-utils'
import { parseResponse } from './helpers'

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('handleApiError', () => {
  test('想定外エラーは 500 + fallbackMessage を返す', async () => {
    const res = handleApiError(new Error('boom'), {
      logLabel: 'テストエラー',
      fallbackMessage: '処理に失敗しました',
    })
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(500)
    expect(data.error).toBe('処理に失敗しました')
  })

  test('logLabel 付きで console.error にログ出力する', () => {
    const error = new Error('boom')
    handleApiError(error, {
      logLabel: 'テストエラー',
      fallbackMessage: '処理に失敗しました',
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith('テストエラー:', error)
  })

  test('P2002（一意制約違反）は 409 + 指定メッセージを返す', async () => {
    const res = handleApiError({ code: 'P2002' }, {
      logLabel: 'テストエラー',
      fallbackMessage: '処理に失敗しました',
      prismaMessages: { P2002: 'その名前は既に使用されています' },
    })
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(409)
    expect(data.error).toBe('その名前は既に使用されています')
  })

  test('P2025（対象レコードなし）は 404 + 指定メッセージを返す', async () => {
    const res = handleApiError({ code: 'P2025' }, {
      logLabel: 'テストエラー',
      fallbackMessage: '処理に失敗しました',
      prismaMessages: { P2025: 'レコードが見つかりません' },
    })
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(404)
    expect(data.error).toBe('レコードが見つかりません')
  })

  test('P2003（FK制約違反）は 404 + 指定メッセージを返す', async () => {
    const res = handleApiError({ code: 'P2003' }, {
      logLabel: 'テストエラー',
      fallbackMessage: '処理に失敗しました',
      prismaMessages: { P2003: 'メンバーが見つかりません' },
    })
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(404)
    expect(data.error).toBe('メンバーが見つかりません')
  })

  test('prismaMessages に未指定のコードは 500 フォールバック', async () => {
    const res = handleApiError({ code: 'P2002' }, {
      logLabel: 'テストエラー',
      fallbackMessage: '処理に失敗しました',
      prismaMessages: { P2025: 'レコードが見つかりません' },
    })
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(500)
    expect(data.error).toBe('処理に失敗しました')
  })

  test('ZodError は 400 + 先頭 issue のメッセージを返す', async () => {
    const result = z.object({ name: z.string({ error: 'name は必須です' }) }).safeParse({})
    expect(result.success).toBe(false)
    if (result.success) return

    const res = handleApiError(result.error, {
      logLabel: 'テストエラー',
      fallbackMessage: '処理に失敗しました',
    })
    const { status, data } = await parseResponse<{ error: string }>(res)
    expect(status).toBe(400)
    expect(data.error).toBe('name は必須です')
  })

  test('null / 文字列など非オブジェクトのエラーでも 500 を返す（クラッシュしない）', async () => {
    for (const error of [null, undefined, 'boom', 42]) {
      const res = handleApiError(error, {
        logLabel: 'テストエラー',
        fallbackMessage: '処理に失敗しました',
        prismaMessages: { P2025: 'レコードが見つかりません' },
      })
      const { status } = await parseResponse(res)
      expect(status).toBe(500)
    }
  })
})
