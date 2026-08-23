/**
 * lib/line/lineService の単体テスト
 *
 * LINE_CHANNEL_ACCESS_TOKEN 未設定でも sendIndividualMessage が
 * 例外を投げず { sent: false } を返すことを検証する。
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// @line/bot-sdk 依存を回避するためモック（実 SDK は Node 用に外部通信を試みるため）
const pushMessageMock = vi.fn()
vi.mock('@line/bot-sdk', () => ({
  messagingApi: {
    MessagingApiClient: class {
      pushMessage = pushMessageMock
    },
  },
}))

import {
  sendIndividualMessage,
  isLineMessagingEnabled,
  _resetLineClient,
} from '@/lib/line/lineService'

let consoleWarnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  _resetLineClient()
  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  delete process.env.LINE_CHANNEL_ACCESS_TOKEN
})

afterEach(() => {
  consoleWarnSpy.mockRestore()
  delete process.env.LINE_CHANNEL_ACCESS_TOKEN
})

describe('sendIndividualMessage', () => {
  test('LINE_CHANNEL_ACCESS_TOKEN 未設定 → 送信スキップして { sent: false }', async () => {
    const result = await sendIndividualMessage('U-1', 'hello')
    expect(result.sent).toBe(false)
    expect(pushMessageMock).not.toHaveBeenCalled()
  })

  test('TOKEN 設定済み → pushMessage が呼ばれて { sent: true }', async () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'dummy'
    pushMessageMock.mockResolvedValue({})
    const result = await sendIndividualMessage('U-2', 'hi')
    expect(result.sent).toBe(true)
    expect(pushMessageMock).toHaveBeenCalledWith({
      to: 'U-2',
      messages: [{ type: 'text', text: 'hi' }],
    })
  })
})

describe('isLineMessagingEnabled', () => {
  test('LINE_CHANNEL_ACCESS_TOKEN 未設定 → false', () => {
    expect(isLineMessagingEnabled()).toBe(false)
  })

  test('LINE_CHANNEL_ACCESS_TOKEN 設定済み → true', () => {
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'set'
    expect(isLineMessagingEnabled()).toBe(true)
  })
})
