// Slack Incoming Webhook 送信ユーティリティ
//
// `SLACK_WEBHOOK_URL` が未設定の場合は送信を試みず、
// 呼び出し側にはエラーではなく「送信スキップ」として扱えるフラグを返す。
// 未設定でも 500 でクラッシュせず、Slack 未整備の段階でも API を稼働させておける。

/** Slack Block Kit で受け付ける Block（最低限の型付け） */
export type SlackBlock = Record<string, unknown>

export interface SlackMessagePayload {
  /** プレーンテキストのフォールバック（通知プレビュー用） */
  text: string
  /** Block Kit の blocks */
  blocks?: SlackBlock[]
}

export interface SlackSendResult {
  /** 実際に Slack Webhook を叩いたか（false の場合は環境変数未設定でスキップ） */
  sent: boolean
}

/** Slack Incoming Webhook が利用可能か（環境変数の設定有無で判定） */
export function isSlackWebhookEnabled(): boolean {
  return Boolean(process.env.SLACK_WEBHOOK_URL)
}

/**
 * Slack Incoming Webhook にメッセージを送信する。
 * `SLACK_WEBHOOK_URL` 未設定なら `{ sent: false }` を返し、
 * HTTP 呼び出しは行わない（例外も投げない）。
 * Webhook が失敗した場合は Error を throw する（呼び出し側で catch する想定）。
 */
export async function sendSlackMessage(
  payload: SlackMessagePayload,
): Promise<SlackSendResult> {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) {
    console.warn(
      '[slack/slackService] SLACK_WEBHOOK_URL 未設定のため送信をスキップ',
    )
    return { sent: false }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw new Error(
      `Slack Webhook 送信に失敗しました: HTTP ${res.status} ${bodyText}`,
    )
  }

  return { sent: true }
}
