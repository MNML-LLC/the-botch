// LINE ID Token 検証ユーティリティ
//
// LIFF (`liff.getIDToken()`) が発行した ID Token を LINE Platform に問い合わせ、
// `sub`（LINE User ID）と `name`（表示名）を取り出す。
//
// 参考: https://developers.line.biz/ja/reference/line-login/#verify-id-token
// エンドポイント: POST https://api.line.me/oauth2/v2.1/verify
// 必須パラメータ: id_token / client_id（LINE Login チャネル ID）

const VERIFY_ENDPOINT = 'https://api.line.me/oauth2/v2.1/verify'

export interface LineIdTokenPayload {
  sub: string
  name?: string
  picture?: string
  email?: string
}

export class LineTokenVerifyError extends Error {
  constructor(
    message: string,
    readonly reason:
      | 'missing_secret'
      | 'invalid_token'
      | 'network_error'
      | 'invalid_payload',
  ) {
    super(message)
    this.name = 'LineTokenVerifyError'
  }
}

/**
 * `client_id` に指定するチャネル ID を環境変数から解決する。
 * 優先順位:
 *   1. `LINE_LOGIN_CHANNEL_ID` (明示指定があればこれを使う)
 *   2. `NEXT_PUBLIC_LIFF_ID` の "-" より前 (`{channelId}-{liffAppId}` 形式)
 *   3. `LINE_CHANNEL_SECRET` を fallback として（同一チャネルの Login 設定で ID を使う場合）
 */
function resolveClientId(): string | null {
  const explicit = process.env.LINE_LOGIN_CHANNEL_ID
  if (explicit) return explicit

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID
  if (liffId && liffId.includes('-')) {
    const [channelId] = liffId.split('-')
    if (channelId) return channelId
  }

  return null
}

/**
 * LINE ID Token を検証し、ペイロード（sub / name 等）を返す。
 *
 * - `LINE_CHANNEL_SECRET` (もしくは `LINE_LOGIN_CHANNEL_ID` / `NEXT_PUBLIC_LIFF_ID`)
 *   が未設定の場合は `LineTokenVerifyError('missing_secret')` を投げる。
 * - トークン検証に失敗した場合は `invalid_token` を投げる。
 */
export async function verifyLineIdToken(
  idToken: string,
): Promise<LineIdTokenPayload> {
  const clientId = resolveClientId()
  if (!clientId) {
    throw new LineTokenVerifyError(
      'LINE Login チャネル ID が未設定です',
      'missing_secret',
    )
  }

  const body = new URLSearchParams({
    id_token: idToken,
    client_id: clientId,
  })

  let response: Response
  try {
    response = await fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch (error) {
    throw new LineTokenVerifyError(
      `LINE 検証エンドポイントに接続できませんでした: ${String(error)}`,
      'network_error',
    )
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new LineTokenVerifyError(
      `LINE ID Token の検証に失敗しました (status=${response.status}): ${detail}`,
      'invalid_token',
    )
  }

  const payload = (await response.json().catch(() => null)) as
    | LineIdTokenPayload
    | null
  if (!payload || typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new LineTokenVerifyError(
      'LINE 検証レスポンスに sub が含まれていません',
      'invalid_payload',
    )
  }

  return payload
}
