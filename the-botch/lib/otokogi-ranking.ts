// 男気ランキングの指標計算（pure 関数）
//
// Issue #335 で導入: 従来の total_paid 絶対額ランキングに加えて以下 4 指標を算出する。
//   1. 男気率 (otokogi_rate): 自分が払った額 ÷ 自分が参加した会の総額
//   2. クラッチ力 (clutch_rate): 高額イベント（amount >= OTOKOGI_CLUTCH_THRESHOLD, 既定 50,000円）での payer 率
//   3. 最長 / 現在ストリーク (max_streak / current_streak): 同じ人が連続で払った回数
//   4. 気前度 (generosity): 1回あたりの平均 payer 額
//
// Route Handler から DB 由来の素データを渡し、本モジュールで純関数的に集計する。

export type RankingMetric = 'total' | 'rate' | 'clutch' | 'streak' | 'generosity'

export const RANKING_METRICS: readonly RankingMetric[] = [
  'total',
  'rate',
  'clutch',
  'streak',
  'generosity',
] as const

export function isRankingMetric(value: string | null | undefined): value is RankingMetric {
  return typeof value === 'string' && (RANKING_METRICS as readonly string[]).includes(value)
}

export type MemberBase = {
  id: string
  name: string
  initial: string
  colorBg: string
  colorText: string
}

export type OtokogiEventInput = {
  id: string
  eventDate: Date
  payerId: string
  amount: number
  /** 参加メンバー ID（payer を含むかは呼び出し側の DB スキーマに合わせる） */
  participantIds: string[]
}

export type RankingEntry = {
  rank: number
  memberId: string
  name: string
  initial: string
  colorBg: string
  colorText: string
  // 既存指標（下位互換）
  count: number
  totalPaid: number
  // 新指標
  participatedCount: number
  participatedTotal: number
  otokogiRate: number | null
  clutchParticipatedCount: number
  clutchPaidCount: number
  clutchRate: number | null
  maxStreak: number
  currentStreak: number
  generosity: number | null
}

type Accumulator = {
  member: MemberBase
  paidCount: number
  totalPaid: number
  participatedCount: number
  participatedTotal: number
  clutchParticipatedCount: number
  clutchPaidCount: number
}

/**
 * イベント一覧を日時昇順でソートし、連続支払いの (最長, 現在) ストリークを算出する。
 *
 * - 「同じ人が n 回連続で支払った」が最長ストリーク
 * - 「配列末尾から見て、payerId が同じまま続いている連続回数」が現在のストリーク
 *   （直近のイベント = 最も最近払った人）
 */
function computeStreaks(sortedEvents: OtokogiEventInput[]): Map<string, { max: number; current: number }> {
  const streaks = new Map<string, { max: number; current: number }>()
  if (sortedEvents.length === 0) return streaks

  // 最長ストリーク
  let runPayer: string | null = null
  let runLen = 0
  for (const ev of sortedEvents) {
    if (ev.payerId === runPayer) {
      runLen += 1
    } else {
      runPayer = ev.payerId
      runLen = 1
    }
    const existing = streaks.get(ev.payerId) ?? { max: 0, current: 0 }
    if (runLen > existing.max) {
      existing.max = runLen
    }
    streaks.set(ev.payerId, existing)
  }

  // 現在ストリーク: 末尾の払い手が何回連続で続いているか
  const lastPayerId = sortedEvents[sortedEvents.length - 1].payerId
  let currentRun = 0
  for (let i = sortedEvents.length - 1; i >= 0; i -= 1) {
    if (sortedEvents[i].payerId === lastPayerId) currentRun += 1
    else break
  }
  const lastEntry = streaks.get(lastPayerId) ?? { max: 0, current: 0 }
  lastEntry.current = currentRun
  streaks.set(lastPayerId, lastEntry)

  return streaks
}

/** 指定 metric の降順ソート値を返す（null は常に末尾に送るため -Infinity 相当として扱う） */
function sortValue(entry: RankingEntry, metric: RankingMetric): number {
  switch (metric) {
    case 'total':
      return entry.totalPaid
    case 'rate':
      return entry.otokogiRate ?? Number.NEGATIVE_INFINITY
    case 'clutch':
      return entry.clutchRate ?? Number.NEGATIVE_INFINITY
    case 'streak':
      return entry.maxStreak
    case 'generosity':
      return entry.generosity ?? Number.NEGATIVE_INFINITY
  }
}

/**
 * 男気ランキングの全指標を算出し、指定 metric 順でソートして返す。
 *
 * @param members 対象メンバー一覧（アクティブメンバー想定）
 * @param events  期間フィルタ済みの男気イベント一覧
 * @param options.metric ソート基準となる指標（default: 'total'）
 * @param options.clutchThreshold クラッチ判定閾値（default: lib/constants の OTOKOGI_CLUTCH_THRESHOLD）
 * @returns ランキング配列（rank 付き）
 */
export function computeRanking(
  members: MemberBase[],
  events: OtokogiEventInput[],
  options: { metric?: RankingMetric; clutchThreshold: number }
): RankingEntry[] {
  const metric: RankingMetric = options.metric ?? 'total'
  const threshold = options.clutchThreshold

  const accById = new Map<string, Accumulator>()
  for (const m of members) {
    accById.set(m.id, {
      member: m,
      paidCount: 0,
      totalPaid: 0,
      participatedCount: 0,
      participatedTotal: 0,
      clutchParticipatedCount: 0,
      clutchPaidCount: 0,
    })
  }

  // 1 イベントごとに payer / participants を集計
  for (const ev of events) {
    const isClutch = ev.amount >= threshold
    const payerAcc = accById.get(ev.payerId)
    if (payerAcc) {
      payerAcc.paidCount += 1
      payerAcc.totalPaid += ev.amount
      if (isClutch) payerAcc.clutchPaidCount += 1
    }

    // participants は重複を排除（同じメンバーが二重登録されていても1回でカウント）
    const uniqueParticipantIds = new Set<string>(ev.participantIds)
    for (const pid of uniqueParticipantIds) {
      const pAcc = accById.get(pid)
      if (!pAcc) continue
      pAcc.participatedCount += 1
      pAcc.participatedTotal += ev.amount
      if (isClutch) pAcc.clutchParticipatedCount += 1
    }
  }

  // ストリーク算出のためイベントを時系列ソート（eventDate 昇順, 同日は id 昇順で安定化）
  const sortedEvents = [...events].sort((a, b) => {
    const da = a.eventDate.getTime()
    const db = b.eventDate.getTime()
    if (da !== db) return da - db
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const streaks = computeStreaks(sortedEvents)

  // メンバーごとに RankingEntry を組み立てる
  const entries: RankingEntry[] = []
  for (const acc of accById.values()) {
    const streak = streaks.get(acc.member.id) ?? { max: 0, current: 0 }
    const otokogiRate =
      acc.participatedTotal > 0 ? acc.totalPaid / acc.participatedTotal : null
    const clutchRate =
      acc.clutchParticipatedCount > 0
        ? acc.clutchPaidCount / acc.clutchParticipatedCount
        : null
    const generosity = acc.paidCount > 0 ? Math.round(acc.totalPaid / acc.paidCount) : null

    entries.push({
      rank: 0, // ソート後に付与
      memberId: acc.member.id,
      name: acc.member.name,
      initial: acc.member.initial,
      colorBg: acc.member.colorBg,
      colorText: acc.member.colorText,
      count: acc.paidCount,
      totalPaid: acc.totalPaid,
      participatedCount: acc.participatedCount,
      participatedTotal: acc.participatedTotal,
      otokogiRate,
      clutchParticipatedCount: acc.clutchParticipatedCount,
      clutchPaidCount: acc.clutchPaidCount,
      clutchRate,
      maxStreak: streak.max,
      currentStreak: streak.current,
      generosity,
    })
  }

  // 参加・支払いが共に 0 のメンバーは除外（ノイズになるため）
  const filtered = entries.filter(
    (e) => e.participatedCount > 0 || e.count > 0
  )

  // 指定 metric の降順でソート。null / 0 は後ろ、同値は name の昇順で安定化
  filtered.sort((a, b) => {
    const va = sortValue(a, metric)
    const vb = sortValue(b, metric)
    if (vb !== va) return vb - va
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })

  return filtered.map((e, i) => ({ ...e, rank: i + 1 }))
}

/**
 * fiscal year (11月開始〜翌年10月末) を Date 範囲に変換する。
 *
 * - 年度表記: 2026年度 = 2025-11-01 〜 2026-10-31
 * - UTC で解釈して DB の `event_date`（date 型）との境界ずれを避ける。
 */
export function fiscalYearRange(year: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year - 1, 10, 1)) // 11月は month index 10
  const to = new Date(Date.UTC(year, 9, 31, 23, 59, 59, 999)) // 10月は month index 9
  return { from, to }
}
