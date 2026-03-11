// カレンダー表示用日付ユーティリティ

/**
 * イベント名から日付をパース（例: "20260207_テニス" → "2026-02-07"）
 * 先頭8桁が YYYYMMDD パターンの場合のみ抽出
 */
export function parseEventDate(eventName: string): string | null {
  const match = eventName.match(/^(\d{4})(\d{2})(\d{2})/)
  if (match) {
    const [, y, m, d] = match
    return `${y}-${m}-${d}`
  }
  return null
}

/**
 * WarikanEvent の displayDate を算出する
 * 優先順: eventName先頭YYYYMMDD → paymentDeadline → detailDeadline → null
 */
export function computeDisplayDate(
  eventName: string,
  paymentDeadline: Date | string | null,
  detailDeadline: Date | string | null,
): Date | null {
  // 1. eventName の先頭8桁が YYYYMMDD パターン
  const parsed = parseEventDate(eventName)
  if (parsed) {
    return new Date(parsed)
  }

  // 2. paymentDeadline
  if (paymentDeadline) {
    return paymentDeadline instanceof Date ? paymentDeadline : new Date(paymentDeadline)
  }

  // 3. detailDeadline
  if (detailDeadline) {
    return detailDeadline instanceof Date ? detailDeadline : new Date(detailDeadline)
  }

  return null
}
