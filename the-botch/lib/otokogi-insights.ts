// 男気 Auto-Insights (Issue #404)
//
// 統計タブの 7 層構造のうち Layer 6 — "分析の核" となる自動洞察ロジック。
// `/api/otokogi/stats` と `/api/otokogi/member-summary` のレスポンスを
// 合成し、事前定義された判定ロジックを一度に走らせて "narrative" (文章) 形式の
// 洞察を優先度順に返す。
//
// ロジックは全て純関数 (DB アクセスなし / 時間依存なし)。追加・テストしやすい。
//
// Insight の `priority` は 1-10 の整数 (10 が最優先)。
//   - 10: 期間全体の "大枠" に関わる事実 (前期比の大変動など)
//   - 7-9: 個別メンバーに関する強い事実 (MVP 確定、カテゴリ偏り)
//   - 4-6: 局所的な事実 (ストリーク、不運期間、ピーク月)
//   - 1-3: 補助情報 (最高額、量産型など)
//
// UI 側は上位 3-5 件をデフォルト表示し、「もっと見る」で全件展開する。

import { CLUTCH_THRESHOLD, MIN_OTOKOGI_AMOUNT } from '@/lib/constants'

export type InsightKind =
  | 'period-growth-total'
  | 'period-growth-count'
  | 'mvp-near-locked'
  | 'tight-race'
  | 'current-streak'
  | 'max-streak'
  | 'clutch-bias'
  | 'clutch-absent'
  | 'clutch-cluster'
  | 'no-pay-streak'
  | 'category-bias'
  | 'peak-month'
  | 'single-high-record'
  | 'janken-bias'
  | 'generosity-bias'

export type Insight = {
  kind: InsightKind
  // 安定した ID (同じ条件で同じ値が返るよう kind + 対象 で合成)
  id: string
  // 1-10, 大きいほど優先 (UI 表示順)
  priority: number
  // 絵文字 (半角スペース許容、1 グリフを推奨)
  icon: string
  // 本文 (narrative)。1 文で結論を示す。
  text: string
  // 関連メンバー (任意、複数は代表 1 人)
  memberId?: string
}

// --- 入力型 (呼び出し側 API の最小サブセット) ---

export type InsightsMemberSummary = {
  memberId: string
  memberName: string
  participationCount: number
  payerCount: number
  actualPaid: number
  shouldHavePaid: number
  otokogiAmount: number
  averagePaymentAmount: number
  maxSingleOtokogi: number
  clutchCount: number
  jankenWinRate: number | null
  jankenParticipationCount: number
}

export type InsightsStreakEntry = {
  id: string
  name: string
  // 期間を通じての最大連続男気回数
  maxStreak: number
  // 期間末時点の "現在" 連続男気回数 (最後の参加会が自分の支払だった場合に加算)
  currentStreak: number
}

export type InsightsMonthlyEntry = { month: string; amount: number }

export type InsightsCategoryEntry = {
  // 'TRIP' | 'HANGOUT' | 'ACTIVITY' | 'OTHER'
  category: string
  amount: number
  count: number
}

export type InsightsPeriodSummary = {
  totalCount: number
  totalAmount: number
  // CLUTCH 発動回数 (全メンバー合算)
  clutchCount: number
}

export type InsightsContext = {
  // 現期間
  summary: InsightsPeriodSummary
  memberSummaries: InsightsMemberSummary[]
  streaks: InsightsStreakEntry[]
  monthlyTrend: InsightsMonthlyEntry[]
  categoryBreakdown: InsightsCategoryEntry[]
  // 前期間 (比較対象)。null なら比較系 insight はスキップ。
  previous: InsightsPeriodSummary | null
  // 表示ラベル ("今期", "FY26", "2026/11" 等)
  periodLabel?: string
}

// ===== しきい値 (export して UI 側からも参照可能に) =====

export const INSIGHT_GROWTH_THRESHOLD = 0.2 // 20% 超の変動で洞察化
export const INSIGHT_CURRENT_STREAK_MIN = 3
export const INSIGHT_MAX_STREAK_MIN = 5
export const INSIGHT_CLUTCH_BIAS_SHARE = 0.4
export const INSIGHT_CLUTCH_BIAS_MIN_TOTAL = 3
export const INSIGHT_CLUTCH_ABSENT_MIN_EVENTS = 10
export const INSIGHT_CLUTCH_CLUSTER_MIN = 5
export const INSIGHT_NO_PAY_MIN_PARTICIPATIONS = 10
export const INSIGHT_CATEGORY_BIAS_SHARE = 0.6
export const INSIGHT_CATEGORY_BIAS_MIN_COUNT = 5
export const INSIGHT_PEAK_MONTH_SHARE = 0.4
export const INSIGHT_PEAK_MONTH_MIN_MONTHS = 2
export const INSIGHT_MVP_LEAD_FACTOR = 0.5
export const INSIGHT_TIGHT_RACE_MAX_GAP = 0.05
export const INSIGHT_SINGLE_HIGH_RECORD = 100_000
export const INSIGHT_JANKEN_GAMES_MIN = 10
export const INSIGHT_JANKEN_HIGH_RATE = 0.75
export const INSIGHT_JANKEN_LOW_RATE = 0.25
export const INSIGHT_GENEROSITY_FACTOR = 2.0
export const INSIGHT_GENEROSITY_MIN_PAYERS = 2

// --- 共通ヘルパ ---

function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString('ja-JP')}`
}

function pct(ratio: number): string {
  const v = Math.round(ratio * 100)
  return `${v > 0 ? '+' : ''}${v}%`
}

function monthLabel(month: string): string {
  // "2026-11" → "2026/11"
  const [y, m] = month.split('-')
  if (!y || !m) return month
  return `${y}/${parseInt(m, 10)}月`
}

function categoryLabel(c: string): string {
  switch (c) {
    case 'TRIP':
      return '旅行'
    case 'HANGOUT':
      return '飲み'
    case 'ACTIVITY':
      return 'アクティビティ'
    case 'OTHER':
    default:
      return 'その他'
  }
}

// ===== 1. 期間総額成長 =====
function detectPeriodGrowthTotal(ctx: InsightsContext): Insight | null {
  if (!ctx.previous) return null
  const cur = ctx.summary.totalAmount
  const prev = ctx.previous.totalAmount
  // 前期が 0 の場合、割合計算できない。代わりに "初計上" として扱う。
  if (prev === 0) {
    if (cur > 0) {
      return {
        kind: 'period-growth-total',
        id: 'period-growth-total:zero-to-pos',
        priority: 9,
        icon: '📈',
        text: `前期は男気 0 円。今期は累計 ${yen(cur)} まで積み上がった。`,
      }
    }
    return null
  }
  const growth = (cur - prev) / prev
  if (Math.abs(growth) < INSIGHT_GROWTH_THRESHOLD) return null
  const up = growth > 0
  return {
    kind: 'period-growth-total',
    id: 'period-growth-total:cmp',
    priority: 10,
    icon: up ? '📈' : '📉',
    text: `期間総額は前期比 ${pct(growth)} で${up ? '成長中' : '減少中'} (${yen(prev)} → ${yen(cur)})。`,
  }
}

// ===== 2. 期間件数成長 =====
function detectPeriodGrowthCount(ctx: InsightsContext): Insight | null {
  if (!ctx.previous) return null
  const cur = ctx.summary.totalCount
  const prev = ctx.previous.totalCount
  const diff = cur - prev
  if (prev === 0) {
    if (cur >= 3) {
      return {
        kind: 'period-growth-count',
        id: 'period-growth-count:zero-to-pos',
        priority: 8,
        icon: '📊',
        text: `前期は男気発動なし。今期は ${cur} 回発動。`,
      }
    }
    return null
  }
  const growth = diff / prev
  if (Math.abs(growth) < INSIGHT_GROWTH_THRESHOLD && Math.abs(diff) < 5) return null
  const up = diff > 0
  return {
    kind: 'period-growth-count',
    id: 'period-growth-count:cmp',
    priority: 9,
    icon: up ? '📊' : '📉',
    text: `男気発動は前期比 ${diff > 0 ? '+' : ''}${diff} 回 (${prev} → ${cur}) で${up ? '活性化' : '沈静化'}。`,
  }
}

// ===== 3. MVP ほぼ確定 =====
function detectMvpNearLocked(ctx: InsightsContext): Insight | null {
  const sorted = [...ctx.memberSummaries]
    .filter((m) => m.actualPaid > 0)
    .sort((a, b) => b.actualPaid - a.actualPaid)
  if (sorted.length < 2) return null
  const top = sorted[0]
  const second = sorted[1]
  const lead = top.actualPaid - second.actualPaid
  if (second.actualPaid > 0 && lead > second.actualPaid * INSIGHT_MVP_LEAD_FACTOR) {
    return {
      kind: 'mvp-near-locked',
      id: `mvp-near-locked:${top.memberId}`,
      priority: 8,
      icon: '👑',
      text: `${top.memberName} が MVP 候補をほぼ確定 (2 位との差 ${yen(lead)})。`,
      memberId: top.memberId,
    }
  }
  return null
}

// ===== 4. 接戦 =====
function detectTightRace(ctx: InsightsContext): Insight | null {
  const sorted = [...ctx.memberSummaries]
    .filter((m) => m.actualPaid > 0)
    .sort((a, b) => b.actualPaid - a.actualPaid)
  if (sorted.length < 2) return null
  const top = sorted[0]
  const second = sorted[1]
  if (top.actualPaid === 0) return null
  const gap = (top.actualPaid - second.actualPaid) / top.actualPaid
  if (gap <= INSIGHT_TIGHT_RACE_MAX_GAP) {
    return {
      kind: 'tight-race',
      id: `tight-race:${top.memberId}:${second.memberId}`,
      priority: 8,
      icon: '⚔️',
      text: `${top.memberName} と ${second.memberName} が MVP を接戦中 (差 ${yen(top.actualPaid - second.actualPaid)}, ${Math.round(gap * 100)}% 以内)。`,
      memberId: top.memberId,
    }
  }
  return null
}

// ===== 5. 現在ストリーク =====
function detectCurrentStreaks(ctx: InsightsContext): Insight[] {
  const found: Insight[] = []
  for (const s of ctx.streaks) {
    if (s.currentStreak >= INSIGHT_CURRENT_STREAK_MIN) {
      found.push({
        kind: 'current-streak',
        id: `current-streak:${s.id}`,
        priority: 7 + Math.min(s.currentStreak - INSIGHT_CURRENT_STREAK_MIN, 2),
        icon: '🔥',
        text: `${s.name} は直近 ${s.currentStreak} 回連続で男気発動中 (ストリーク +${s.currentStreak})。`,
        memberId: s.id,
      })
    }
  }
  return found
}

// ===== 6. 最大ストリーク (期間内の最長) =====
function detectMaxStreak(ctx: InsightsContext): Insight | null {
  const sorted = [...ctx.streaks].sort((a, b) => b.maxStreak - a.maxStreak)
  const top = sorted[0]
  if (!top || top.maxStreak < INSIGHT_MAX_STREAK_MIN) return null
  return {
    kind: 'max-streak',
    id: `max-streak:${top.id}`,
    priority: 5,
    icon: '🏅',
    text: `${top.name} が期間最長ストリーク ${top.maxStreak} 連勝を記録。`,
    memberId: top.id,
  }
}

// ===== 7. CLUTCH 偏り =====
function detectClutchBias(ctx: InsightsContext): Insight | null {
  const total = ctx.summary.clutchCount
  if (total < INSIGHT_CLUTCH_BIAS_MIN_TOTAL) return null
  const sorted = [...ctx.memberSummaries]
    .filter((m) => m.clutchCount > 0)
    .sort((a, b) => b.clutchCount - a.clutchCount)
  const top = sorted[0]
  if (!top) return null
  const share = top.clutchCount / total
  if (share > INSIGHT_CLUTCH_BIAS_SHARE) {
    return {
      kind: 'clutch-bias',
      id: `clutch-bias:${top.memberId}`,
      priority: 7,
      icon: '⚡',
      text: `${top.memberName} は CLUTCH の ${Math.round(share * 100)}% (${top.clutchCount}/${total} 回) を 1 人で引き受けている。`,
      memberId: top.memberId,
    }
  }
  return null
}

// ===== 8. CLUTCH 不在 =====
function detectClutchAbsent(ctx: InsightsContext): Insight | null {
  if (ctx.summary.clutchCount > 0) return null
  if (ctx.summary.totalCount < INSIGHT_CLUTCH_ABSENT_MIN_EVENTS) return null
  return {
    kind: 'clutch-absent',
    id: 'clutch-absent',
    priority: 5,
    icon: '🍺',
    text: `今期 CLUTCH 0 件、全 ${ctx.summary.totalCount} 件が ${yen(CLUTCH_THRESHOLD)} 未満の小額男気主体の期。`,
  }
}

// ===== 9. CLUTCH 密集 =====
function detectClutchCluster(ctx: InsightsContext): Insight | null {
  if (ctx.summary.clutchCount < INSIGHT_CLUTCH_CLUSTER_MIN) return null
  return {
    kind: 'clutch-cluster',
    id: 'clutch-cluster',
    priority: 7,
    icon: '⚡',
    text: `CLUTCH 発動 ${ctx.summary.clutchCount} 回 (${yen(CLUTCH_THRESHOLD)}+ の大型男気が集中した期)。`,
  }
}

// ===== 10. 不運期間 (参加多数, 支払 0) =====
function detectNoPayStreak(ctx: InsightsContext): Insight[] {
  const found: Insight[] = []
  for (const m of ctx.memberSummaries) {
    if (
      m.participationCount >= INSIGHT_NO_PAY_MIN_PARTICIPATIONS &&
      m.payerCount === 0
    ) {
      found.push({
        kind: 'no-pay-streak',
        id: `no-pay-streak:${m.memberId}`,
        priority: 6,
        icon: '🌧️',
        text: `${m.memberName} は期間内 ${m.participationCount} 回参加して 0 回支払、ラッキー期間。`,
        memberId: m.memberId,
      })
    }
  }
  return found
}

// ===== 11. カテゴリ偏り =====
function detectCategoryBias(ctx: InsightsContext): Insight | null {
  if (ctx.summary.totalCount < INSIGHT_CATEGORY_BIAS_MIN_COUNT) return null
  const totalAmt = ctx.categoryBreakdown.reduce((s, c) => s + c.amount, 0)
  if (totalAmt <= 0) return null
  const sorted = [...ctx.categoryBreakdown].sort((a, b) => b.amount - a.amount)
  const top = sorted[0]
  const share = top.amount / totalAmt
  if (share > INSIGHT_CATEGORY_BIAS_SHARE) {
    return {
      kind: 'category-bias',
      id: `category-bias:${top.category}`,
      priority: 6,
      icon: '🎯',
      text: `支払総額の ${Math.round(share * 100)}% が「${categoryLabel(top.category)}」(${yen(top.amount)}) に集中している。`,
    }
  }
  return null
}

// ===== 12. ピーク月 =====
function detectPeakMonth(ctx: InsightsContext): Insight | null {
  if (ctx.monthlyTrend.length < INSIGHT_PEAK_MONTH_MIN_MONTHS) return null
  const total = ctx.monthlyTrend.reduce((s, m) => s + m.amount, 0)
  if (total <= 0) return null
  const sorted = [...ctx.monthlyTrend].sort((a, b) => b.amount - a.amount)
  const top = sorted[0]
  const share = top.amount / total
  if (share > INSIGHT_PEAK_MONTH_SHARE) {
    return {
      kind: 'peak-month',
      id: `peak-month:${top.month}`,
      priority: 5,
      icon: '📅',
      text: `${monthLabel(top.month)} に総額の ${Math.round(share * 100)}% (${yen(top.amount)}) が集中した。`,
    }
  }
  return null
}

// ===== 13. 単発高額記録 =====
function detectSingleHighRecord(ctx: InsightsContext): Insight | null {
  const sorted = [...ctx.memberSummaries]
    .filter((m) => m.maxSingleOtokogi > 0)
    .sort((a, b) => b.maxSingleOtokogi - a.maxSingleOtokogi)
  const top = sorted[0]
  if (!top || top.maxSingleOtokogi < INSIGHT_SINGLE_HIGH_RECORD) return null
  return {
    kind: 'single-high-record',
    id: `single-high-record:${top.memberId}`,
    priority: 4,
    icon: '💎',
    text: `${top.memberName} の単発フェアシェア超過最大 ${yen(top.maxSingleOtokogi)}、記録級の男気。`,
    memberId: top.memberId,
  }
}

// ===== 14. じゃんけん勝率偏り =====
function detectJankenBias(ctx: InsightsContext): Insight[] {
  const found: Insight[] = []
  for (const m of ctx.memberSummaries) {
    if (
      m.jankenWinRate === null ||
      m.jankenParticipationCount < INSIGHT_JANKEN_GAMES_MIN
    ) {
      continue
    }
    if (m.jankenWinRate >= INSIGHT_JANKEN_HIGH_RATE) {
      found.push({
        kind: 'janken-bias',
        id: `janken-bias:high:${m.memberId}`,
        priority: 5,
        icon: '✊',
        text: `${m.memberName} のじゃんけん勝率 ${Math.round(m.jankenWinRate * 100)}% (${m.jankenParticipationCount} 戦)、運の神。`,
        memberId: m.memberId,
      })
    } else if (m.jankenWinRate <= INSIGHT_JANKEN_LOW_RATE) {
      found.push({
        kind: 'janken-bias',
        id: `janken-bias:low:${m.memberId}`,
        priority: 5,
        icon: '🎲',
        text: `${m.memberName} のじゃんけん勝率 ${Math.round(m.jankenWinRate * 100)}% (${m.jankenParticipationCount} 戦)、支払が集中しやすい。`,
        memberId: m.memberId,
      })
    }
  }
  return found
}

// ===== 15. 気前度突出 (1 回あたり平均額が突出) =====
// top の平均単価を "それ以外の payer の平均" と比較する (team avg との比較だと
// 自分自身の寄与で天井が頭打ちになり、2 人しかいない場合 2x に到達できない)。
function detectGenerosityBias(ctx: InsightsContext): Insight | null {
  const payers = ctx.memberSummaries.filter((m) => m.payerCount > 0)
  if (payers.length < INSIGHT_GENEROSITY_MIN_PAYERS) return null
  const sorted = [...payers].sort(
    (a, b) => b.averagePaymentAmount - a.averagePaymentAmount
  )
  const top = sorted[0]
  const others = sorted.slice(1)
  if (others.length === 0) return null
  const othersAvg =
    others.reduce((s, m) => s + m.averagePaymentAmount, 0) / others.length
  if (othersAvg < MIN_OTOKOGI_AMOUNT) return null
  if (top.averagePaymentAmount >= othersAvg * INSIGHT_GENEROSITY_FACTOR) {
    return {
      kind: 'generosity-bias',
      id: `generosity-bias:${top.memberId}`,
      priority: 4,
      icon: '💰',
      text: `${top.memberName} の 1 回平均 ${yen(top.averagePaymentAmount)} は他メンバー平均の ${(top.averagePaymentAmount / othersAvg).toFixed(1)} 倍、気前度が突出。`,
      memberId: top.memberId,
    }
  }
  return null
}

// ===== 公開エントリ =====

/**
 * 全 insight 検出ロジックを実行し、優先度降順でソートして返す。
 * 同一 priority 内は検出順を保つ (stable sort)。
 */
export function computeInsights(ctx: InsightsContext): Insight[] {
  const out: Insight[] = []

  const push = (i: Insight | null) => {
    if (i) out.push(i)
  }

  // 全体系 (期間比較)
  push(detectPeriodGrowthTotal(ctx))
  push(detectPeriodGrowthCount(ctx))

  // MVP レース系
  push(detectMvpNearLocked(ctx))
  push(detectTightRace(ctx))

  // ストリーク系
  out.push(...detectCurrentStreaks(ctx))
  push(detectMaxStreak(ctx))

  // CLUTCH 系
  push(detectClutchBias(ctx))
  push(detectClutchAbsent(ctx))
  push(detectClutchCluster(ctx))

  // メンバー別の運 / 不運
  out.push(...detectNoPayStreak(ctx))
  out.push(...detectJankenBias(ctx))

  // 分布系
  push(detectCategoryBias(ctx))
  push(detectPeakMonth(ctx))

  // 記録系
  push(detectSingleHighRecord(ctx))
  push(detectGenerosityBias(ctx))

  // 優先度順 (stable) — Array.prototype.sort は現代ランタイムで stable
  return out.sort((a, b) => b.priority - a.priority)
}
