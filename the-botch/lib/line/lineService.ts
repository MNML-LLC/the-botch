// LINE Messaging API 送信ユーティリティ
//
// `LINE_CHANNEL_ACCESS_TOKEN` が未設定の場合は送信を試みず、
// 呼び出し側にはエラーではなく「送信スキップ」として扱えるフラグを返す。
// これにより、LINE チャネル未整備の段階でも notify-unpaid 等の呼び出しが
// 500 でクラッシュせず、運用開始前でも API を稼働させておける。
import { messagingApi } from '@line/bot-sdk'

let cachedClient: messagingApi.MessagingApiClient | null = null

function getClient(): messagingApi.MessagingApiClient | null {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return null
  if (!cachedClient) {
    cachedClient = new messagingApi.MessagingApiClient({
      channelAccessToken: token,
    })
  }
  return cachedClient
}

/** テスト用: モジュールキャッシュされたクライアントを破棄する */
export function _resetLineClient(): void {
  cachedClient = null
}

export interface SendResult {
  /** 実際に LINE API を呼んだか（false の場合は環境変数未設定でスキップ） */
  sent: boolean
}

/**
 * 単一ユーザーに LINE メッセージを送信する。
 * `LINE_CHANNEL_ACCESS_TOKEN` 未設定なら `{ sent: false }` を返し、
 * API 呼び出しは行わない（例外も投げない）。
 */
export async function sendIndividualMessage(
  userId: string,
  message: string,
): Promise<SendResult> {
  const client = getClient()
  if (!client) {
    console.warn(
      '[line/lineService] LINE_CHANNEL_ACCESS_TOKEN 未設定のため送信をスキップ',
      { userId },
    )
    return { sent: false }
  }

  await client.pushMessage({
    to: userId,
    messages: [{ type: 'text', text: message }],
  })
  return { sent: true }
}

/** LINE Messaging API が利用可能か（環境変数の設定有無で判定） */
export function isLineMessagingEnabled(): boolean {
  return Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN)
}
