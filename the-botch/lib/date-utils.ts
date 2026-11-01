// カレンダー表示用日付ユーティリティ

/**
 * 指定日時点の fiscal year（11月開始〜翌年10月末）を返す。
 *
 * - 11月〜12月: 翌年を返す（例: 2026-11-01 → 2027）
 * - 1月〜10月: その年を返す（例: 2026-02-01 → 2026）
 *
 * @param now 判定基準日（省略時は現在時刻）
 */
export function getCurrentFiscalYear(now: Date = new Date()): number {
  return now.getMonth() >= 10 ? now.getFullYear() + 1 : now.getFullYear()
}

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
