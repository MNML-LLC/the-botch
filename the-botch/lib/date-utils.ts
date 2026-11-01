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
 * 期間フィルタ値（UI/API 共通）
 * - current-month: 今月（月初〜現在時刻）
 * - current-fy:    今期（会計年度 11 月始まり）
 * - last-fy:       前期（1 つ前の会計年度）
 * - all:           全期間
 * - custom:        カスタム範囲（from/to を併用）
 */
export type PeriodValue =
  | 'current-month'
  | 'current-fy'
  | 'last-fy'
  | 'all'
  | 'custom'

/**
 * 期間フィルタ状態（コンポーネントが保持する値）
 */
export interface PeriodState {
  period: PeriodValue
  from?: string
  to?: string
}

/**
 * 指定日が属する会計年度の範囲を offset 分ずらして返す
 * offset=0 → 今期、offset=-1 → 前期、offset=1 → 次期
 * 会計年度: 11月1日 00:00 〜 翌年10月31日 23:59:59.999
 */
export function getFiscalYearRange(
  ref: Date | string = new Date(),
  offset: number = 0,
): { from: Date; to: Date; label: string; fy: number } {
  const d = toDate(ref)
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  const baseFy = month >= 11 ? year : year - 1
  const fy = baseFy + offset
  const from = new Date(fy, 10, 1, 0, 0, 0, 0) // 11月1日
  const to = new Date(fy + 1, 9, 31, 23, 59, 59, 999) // 翌年10月31日
  const fyShort = fy % 100
  const label = `FY${fyShort.toString().padStart(2, '0')} (${fy}/11〜${fy + 1}/10)`
  return { from, to, label, fy }
}

/**
 * 指定日が属する「月初から現在時刻まで」の範囲
 */
export function getCurrentMonthRange(ref: Date = new Date()): {
  from: Date
  to: Date
  label: string
} {
  const from = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0)
  const to = new Date(
    ref.getFullYear(),
    ref.getMonth(),
    ref.getDate(),
    23,
    59,
    59,
    999,
  )
  const label = `${ref.getFullYear()}/${ref.getMonth() + 1}月`
  return { from, to, label }
}

/**
 * PeriodValue を日付範囲に変換（all / custom は null を返す場合あり）
 */
export function getPeriodRange(
  period: PeriodValue,
  ref: Date = new Date(),
  custom?: { from?: string; to?: string },
): { from: Date | null; to: Date | null; label: string } {
  switch (period) {
    case 'current-month': {
      const r = getCurrentMonthRange(ref)
      return { from: r.from, to: r.to, label: '今月' }
    }
    case 'current-fy': {
      const r = getFiscalYearRange(ref, 0)
      return { from: r.from, to: r.to, label: '今期' }
    }
    case 'last-fy': {
      const r = getFiscalYearRange(ref, -1)
      return { from: r.from, to: r.to, label: '前期' }
    }
    case 'all':
      return { from: null, to: null, label: '全期間' }
    case 'custom': {
      const f = custom?.from ? new Date(custom.from) : null
      const t = custom?.to ? new Date(custom.to) : null
      return { from: f, to: t, label: 'カスタム' }
    }
  }
}

/**
 * PeriodState を URLSearchParams 系クエリに書き出す
 * - all: 何も書かない
 * - current-month / current-fy / last-fy: period=... のみ
 * - custom: period=custom + from/to
 */
export function appendPeriodSearchParams(
  params: URLSearchParams,
  state: PeriodState,
): void {
  if (state.period === 'all') return
  params.set('period', state.period)
  if (state.period === 'custom') {
    if (state.from) params.set('from', state.from)
    if (state.to) params.set('to', state.to)
  }
}

/**
 * サーバー側: SearchParams から期間フィルタを解釈して Date 範囲を返す
 * 優先順: period > from/to > year（後方互換）
 */
export function parsePeriodFromSearchParams(
  searchParams: URLSearchParams,
  now: Date = new Date(),
): { from: Date | null; to: Date | null } {
  const periodParam = searchParams.get('period') as PeriodValue | null
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const yearParam = searchParams.get('year')

  if (periodParam) {
    const range = getPeriodRange(periodParam, now, {
      from: fromParam ?? undefined,
      to: toParam ?? undefined,
    })
    return { from: range.from, to: range.to }
  }
  if (fromParam || toParam) {
    return {
      from: fromParam ? new Date(fromParam) : null,
      to: toParam ? new Date(toParam) : null,
    }
  }
  if (yearParam) {
    const n = Number(yearParam)
    if (Number.isFinite(n)) {
      // 既存の year=YYYY は会計年度（前年11月〜当年10月）として扱う。
      // 旧実装と同じ ISO 日付文字列ベースの Date を返して後方互換を維持する。
      return {
        from: new Date(`${n - 1}-11-01`),
        to: new Date(`${n}-10-31`),
      }
    }
  }
  return { from: null, to: null }
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
