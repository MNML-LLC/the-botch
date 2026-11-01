// カレンダー表示用日付ユーティリティ

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

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

function toDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * 絶対日付（例: `2026/11/2(日)`）
 */
export function formatDateAbs(date: Date | string): string {
  const d = toDate(date)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS_JA[d.getDay()]})`
}

/**
 * 相対日付（例: `今日` / `昨日` / `3日前` / `明日` / `3日後`）
 * `now` を指定しない場合は `new Date()` を使用。
 */
export function formatDateRel(date: Date | string, now: Date = new Date()): string {
  const target = startOfDay(toDate(date))
  const base = startOfDay(now)
  const diff = Math.round((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return '今日'
  if (diff === -1) return '昨日'
  if (diff === 1) return '明日'
  if (diff < 0) return `${-diff}日前`
  return `${diff}日後`
}

/**
 * 相対日付 + 絶対日付（例: `3日前 · 2026/11/2(日)`）
 */
export function formatDateBoth(date: Date | string, now: Date = new Date()): string {
  return `${formatDateRel(date, now)} · ${formatDateAbs(date)}`
}

/**
 * 会計年度（Fiscal Year, 11月始まり - MNML運用に合わせる）
 * - FY26 は 2026/11〜2027/10
 * - Q1=11〜1, Q2=2〜4, Q3=5〜7, Q4=8〜10
 * - 境界: 10/31 は FY(y-1) Q4、11/1 は FY(y) Q1
 */
export function getFiscalYear(date: Date | string): {
  label: string
  from: Date
  to: Date
  fy: number
  quarter: 1 | 2 | 3 | 4
} {
  const d = toDate(date)
  const month = d.getMonth() + 1 // 1-12
  const year = d.getFullYear()
  // FY = カレンダー年。ただし 1〜10 月なら前年始まりの FY に属する
  const fy = month >= 11 ? year : year - 1
  const from = new Date(fy, 10, 1) // 11/1
  const to = new Date(fy + 1, 9, 31) // 10/31
  // Quarter: 11,12,1 → Q1 ; 2,3,4 → Q2 ; 5,6,7 → Q3 ; 8,9,10 → Q4
  let quarter: 1 | 2 | 3 | 4
  if (month === 11 || month === 12 || month === 1) quarter = 1
  else if (month >= 2 && month <= 4) quarter = 2
  else if (month >= 5 && month <= 7) quarter = 3
  else quarter = 4
  const fyShort = fy % 100
  const label = `FY${fyShort.toString().padStart(2, '0')} Q${quarter} (${fy}/11〜${fy + 1}/10)`
  return { label, from, to, fy, quarter }
}

/**
 * 月次チャート軸ラベル（例: `2026/11`）
 */
export function formatMonthLabel(date: Date | string): string {
  const d = toDate(date)
  return `${d.getFullYear()}/${d.getMonth() + 1}`
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
