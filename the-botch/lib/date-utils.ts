// 日付・期間表示ユーティリティ
//
// MNML the-botch の全画面で日時/期間ラベルに絶対参照 (年 / 年度) を併記するための共通関数。
//
// 「年度」の定義: 4月〜翌年3月 (日本の会計年度)
// - 2026/4/1〜2027/3/31 → 「2026年度」
// - 2026/1/1〜2026/12/31 → 「2026年」(カレンダー年、年度と区別)

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

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

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * 指定日の属する年度（4月開始）を返す
 * - 2026/3/31 → 2025 (2025年度)
 * - 2026/4/1  → 2026 (2026年度)
 */
export function getFiscalYear(date: Date | string = new Date()): number {
  const d = toDate(date)
  const year = d.getFullYear()
  // 月は 0 始まり。1〜3月(0〜2)は前年度扱い
  return d.getMonth() < 3 ? year - 1 : year
}

/**
 * 指定した年度（4月開始）の開始日・終了日を返す
 */
export function getFiscalYearRange(fiscalYear: number): { from: Date; to: Date } {
  return {
    from: new Date(fiscalYear, 3, 1), // 4/1
    to: new Date(fiscalYear + 1, 2, 31, 23, 59, 59, 999), // 翌年3/31
  }
}

/**
 * 「今月 (2026年11月)」「今年 (2026年)」「今年度 (2026年度 = 2026/4〜2027/3)」等
 * 期間プリセットのラベルに絶対参照を併記する
 */
export function formatPeriodLabel(
  period: 'month' | 'year' | 'fiscal_year',
  refDate: Date = new Date(),
): string {
  const d = toDate(refDate)
  const year = d.getFullYear()
  const month = d.getMonth() + 1

  if (period === 'month') {
    return `今月 (${year}年${month}月)`
  }
  if (period === 'year') {
    return `今年 (${year}年)`
  }
  // fiscal_year
  const fy = getFiscalYear(d)
  return `今年度 (${fy}年度 = ${fy}/4〜${fy + 1}/3)`
}

/**
 * 「2026/11/1(金)」形式。年含み・曜日付き
 */
export function formatDateWithYear(date: Date | string): string {
  const d = toDate(date)
  const w = WEEKDAYS[d.getDay()]
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${w})`
}

/**
 * 「2026/11/1」形式。年含み・曜日なし（コンパクト）
 */
export function formatShortDateWithYear(date: Date | string): string {
  const d = toDate(date)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 「2026年11月」形式。月単位のラベル
 */
export function formatMonthWithYear(date: Date | string): string {
  const d = toDate(date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

/**
 * チャート軸向け「2026/11」形式。短めだが年を落とさない
 */
export function formatMonthShort(date: Date | string): string {
  const d = toDate(date)
  return `${d.getFullYear()}/${d.getMonth() + 1}`
}

/**
 * "YYYY-MM" または "YYYY-MM-xx..." を "2026/11" に変換（チャート軸ラベル用）
 */
export function formatYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  if (!y || !m) return yearMonth
  return `${y}/${parseInt(m, 10)}`
}

/**
 * "YYYY-MM" を "2026年11月" に変換（Tooltip 等の冗長ラベル用）
 */
export function formatYearMonthFull(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  if (!y || !m) return yearMonth
  return `${y}年${parseInt(m, 10)}月`
}

export function isCurrentMonth(date: Date | string, now: Date = new Date()): boolean {
  const d = toDate(date)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export function isCurrentYear(date: Date | string, now: Date = new Date()): boolean {
  const d = toDate(date)
  return d.getFullYear() === now.getFullYear()
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * 直近 7 日以内は「今日」「昨日」「3日前」等 + 絶対日付（小さく併記向け）
 * 1 年以上前なら年含み。それ以外は月日 + 曜日。
 * 返り値は { primary, absolute } で、呼び出し側がレイアウトを選べる。
 */
export function formatRelativeDate(
  date: Date | string,
  now: Date = new Date(),
): { primary: string; absolute: string } {
  const d = toDate(date)
  const today = startOfDay(now)
  const target = startOfDay(d)
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000)
  const absolute = formatDateWithYear(d)

  if (diffDays === 0) return { primary: '今日', absolute }
  if (diffDays === 1) return { primary: '昨日', absolute }
  if (diffDays === -1) return { primary: '明日', absolute }
  if (diffDays > 0 && diffDays <= 7) return { primary: `${diffDays}日前`, absolute }
  if (diffDays < 0 && diffDays >= -7) return { primary: `${Math.abs(diffDays)}日後`, absolute }

  // 7 日より外: 年を含めた絶対表示を primary に
  return { primary: absolute, absolute }
}

/**
 * 絶対参照付きの期間タイトル
 * - 「今月のランキング (2026年11月)」等、ランキング・サマリ見出しで使う
 */
export function formatRangeTitle(
  period: 'month' | 'year' | 'fiscal_year' | 'all' | 'custom',
  options: {
    refDate?: Date
    customFrom?: string
    customTo?: string
    label?: string
  } = {},
): string {
  const { refDate = new Date(), customFrom, customTo, label = '対象期間' } = options
  if (period === 'all') return `${label}: 全期間`
  if (period === 'custom') {
    const from = customFrom ? customFrom : '―'
    const to = customTo ? customTo : '―'
    return `${label}: ${from} 〜 ${to}`
  }
  if (period === 'month') {
    return `${label}: ${formatMonthWithYear(refDate)}`
  }
  if (period === 'year') {
    return `${label}: ${refDate.getFullYear()}年`
  }
  // fiscal_year
  const fy = getFiscalYear(refDate)
  return `${label}: ${fy}年度 (${fy}/4〜${fy + 1}/3)`
}
