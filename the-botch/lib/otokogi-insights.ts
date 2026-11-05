// Auto-Insights: 男気統計の narrative 生成ロジック (Issue #404)
//
// 統計タブ Layer 6 の "分析の核"。期間内の集計値から統計的事実を検出し、
// 自然文の insight を優先度付きで返す。pure function のみ (DB アクセスなし / UI 依存なし)。
//
// 設計方針:
// - 15 種類の detector。1 detector = 1 statistical pattern (しきい値明示)。
// - 優先度 1-10。10 が最優先。期間成長・MVP・ストリークを上位、
//   記録系・カテゴリ偏り・じゃんけん偏りを中位〜下位に。
// - 複数メンバーが同一 kind で該当する場合は個別に insight を生成する
//   (例: current-streak は該当メンバー数だけ出る)。
// - UI 側は computeInsights() の戻り値 (優先度降順) を top N だけ表示する。

export type InsightKind =
  | 'period-growth-total'
  | 'period-growth-count'
  | 'mvp-near-locked'
  | 'tight-race'
  | 'current-streak'
  | 'clutch-bias'
  | 'clutch-cluster'
  | 'no-pay-streak'
  | 'category-bias'
  | 'peak-month'
  | 'clutch-absent'
  | 'max-streak'
  | 'janken-bias'
  | 'single-high-record'
  | 'generosity-bias'

export type Insight = {
  kind: InsightKind
  // 1-10, 10 = 最優先
  priority: number
  icon: string
  text: string
  // 関連メンバー (単一) があれば
  memberId?: string
}

export type InsightMemberSummary = {
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
  clutchTotal: number
  jankenWinRate: number | null
  jankenParticipationCount: number
}

export type InsightStreakEntry = {
  id: string
  name?: string
  maxStreak: number
  currentStreak: number
}

export type InsightCategoryEntry = {
  category: 'TRIP' | 'HANGOUT' | 'ACTIVITY' | 'OTHER'
  amount: number
  count: number
}

export type InsightMonthEntry = { month: string; amount: number }

export type InsightContext = {
  // 現期
  totalCount: number
  totalAmount: number
  averageAmount: number
  memberSummaries: InsightMemberSummary[]
  streaks: InsightStreakEntry[]
  monthlyTrend: InsightMonthEntry[]
  categoryBreakdown: InsightCategoryEntry[]
  // 前期 (比較可能なときのみ)。period=all / custom で前期が取れないときは null。
  previous?: {
    totalCount: number
    totalAmount: number
  } | null
}

// --- しきい値 (定数として export してテスト・UI から参照可) ---

export const GROWTH_THRESHOLD = 0.2 // 前期比 ±20% で検出
export const GROWTH_COUNT_ABS_MIN = 5 // 件数は絶対値でも 5 件以上の差があれば検出
export const MVP_LOCK_RATIO = 0.5 // top1 のリード > top2 × 0.5 で MVP 確定
export const TIGHT_RACE_RATIO = 0.05 // top1 と top2 の差 5% 以内で接戦
export const CURRENT_STREAK_MIN = 3
export const CLUTCH_BIAS_SHARE = 0.4 // 1 人が CLUTCH の 40%+
export const CLUTCH_BIAS_MIN_TOTAL = 3
export const CLUTCH_CLUSTER_MIN = 5 // 期間内 CLUTCH 5+
export const NO_PAY_PARTICIPATION_MIN = 10 // 参加 10+ で 支払 0
export const CATEGORY_BIAS_SHARE = 0.6
export const PEAK_MONTH_SHARE = 0.4
export const CLUTCH_ABSENT_MIN_EVENTS = 10
export const MAX_STREAK_MIN = 5
export const JANKEN_WIN_RATE_HIGH = 0.75
export const JANKEN_WIN_RATE_LOW = 0.25
export const JANKEN_GAMES_MIN = 10
export const SINGLE_HIGH_THRESHOLD = 100_000
export const GENEROSITY_BIAS_RATIO = 2.0 // 平均単価が全体平均の 2 倍+

// --- フォーマット ---

function yen(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}¥${Math.abs(Math.round(value)).toLocaleString('ja-JP')}`
}

function pct(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${Math.round(value * 100)}%`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  if (!y || !m) return month
  return `${parseInt(y)}/${parseInt(m)}月`
}

// --- カテゴリ ラベル (UI と揃える) ---
const CATEGORY_LABEL: Record<InsightCategoryEntry['category'], string> = {
  TRIP: '旅行',
  HANGOUT: '飲み',
  ACTIVITY: 'アクティビティ',
  OTHER: 'その他',
}

// ============================================================
// detector 群 (各関数は Insight[] を返す)
// ============================================================

// 1. 前期比 — 総額 (priority 10)
function detectPeriodGrowthTotal(ctx: InsightContext): Insight[] {
  const prev = ctx.previous
  if (!prev || prev.totalAmount <= 0) return []
  const growth = (ctx.totalAmount - prev.totalAmount) / prev.totalAmount
  if (Math.abs(growth) < GROWTH_THRESHOLD) return []
  const up = growth > 0
  return [
    {
      kind: 'period-growth-total',
      priority: 10,
      icon: up ? '📈' : '📉',
      text: `期間総額は前期比 ${pct(growth)} で${up ? '成長' : '減少'}中 (${yen(prev.totalAmount)} → ${yen(ctx.totalAmount)})`,
    },
  ]
}

// 2. 前期比 — 件数 (priority 9)
function detectPeriodGrowthCount(ctx: InsightContext): Insight[] {
  const prev = ctx.previous
  if (!prev) return []
  const diff = ctx.totalCount - prev.totalCount
  // 絶対値が 5 件以上、または率で 20%+ 変化があるなら検出
  const ratioOk = prev.totalCount > 0 && Math.abs(diff / prev.totalCount) >= GROWTH_THRESHOLD
  const absOk = Math.abs(diff) >= GROWTH_COUNT_ABS_MIN
  if (!ratioOk && !absOk) return []
  if (diff === 0) return []
  const up = diff > 0
  const signed = `${up ? '+' : ''}${diff}`
  return [
    {
      kind: 'period-growth-count',
      priority: 9,
      icon: up ? '🚀' : '🌙',
      text: `男気発動回数は前期比 ${signed} 回 (${prev.totalCount} → ${ctx.totalCount})`,
    },
  ]
}

// 3. MVP ほぼ確定 (priority 8)
function detectMvpNearLocked(ctx: InsightContext): Insight[] {
  const sorted = [...ctx.memberSummaries]
    .filter((m) => m.actualPaid > 0)
    .sort((a, b) => b.actualPaid - a.actualPaid)
  if (sorted.length < 2) return []
  const top1 = sorted[0]
  const top2 = sorted[1]
  const lead = top1.actualPaid - top2.actualPaid
  // top2 の 0.5 倍を超えるリード = ほぼ確定
  if (top2.actualPaid <= 0 || lead <= top2.actualPaid * MVP_LOCK_RATIO) return []
  return [
    {
      kind: 'mvp-near-locked',
      priority: 8,
      icon: '👑',
      memberId: top1.memberId,
      text: `${top1.memberName} が MVP 候補をほぼ確定 (2 位との差 ${yen(lead)})`,
    },
  ]
}

// 4. 接戦 (priority 8)
function detectTightRace(ctx: InsightContext): Insight[] {
  const sorted = [...ctx.memberSummaries]
    .filter((m) => m.actualPaid > 0)
    .sort((a, b) => b.actualPaid - a.actualPaid)
  if (sorted.length < 2) return []
  const [top1, top2] = sorted
  if (top1.actualPaid <= 0) return []
  const gap = (top1.actualPaid - top2.actualPaid) / top1.actualPaid
  if (gap > TIGHT_RACE_RATIO) return []
  return [
    {
      kind: 'tight-race',
      priority: 8,
      icon: '⚔️',
      text: `MVP 争いは接戦 — ${top1.memberName} と ${top2.memberName} が ${pct(gap)} 差`,
    },
  ]
}

// 5. 現在ストリーク (priority 7-9 スライド: ストリーク値で上下)
function detectCurrentStreak(ctx: InsightContext): Insight[] {
  const results: Insight[] = []
  for (const s of ctx.streaks) {
    if (s.currentStreak < CURRENT_STREAK_MIN) continue
    const name = s.name ?? ctx.memberSummaries.find((m) => m.memberId === s.id)?.memberName
    if (!name) continue
    // 3→7, 4→8, 5+ → 9
    const priority = s.currentStreak >= 5 ? 9 : s.currentStreak === 4 ? 8 : 7
    results.push({
      kind: 'current-streak',
      priority,
      icon: '🔥',
      memberId: s.id,
      text: `${name} は直近 ${s.currentStreak} 回連続で男気発動中 (継続ストリーク)`,
    })
  }
  return results
}

// 6. CLUTCH 偏り (priority 7)
function detectClutchBias(ctx: InsightContext): Insight[] {
  const totalClutch = ctx.memberSummaries.reduce((s, m) => s + m.clutchCount, 0)
  if (totalClutch < CLUTCH_BIAS_MIN_TOTAL) return []
  const results: Insight[] = []
  for (const m of ctx.memberSummaries) {
    if (m.clutchCount <= 0) continue
    const share = m.clutchCount / totalClutch
    if (share < CLUTCH_BIAS_SHARE) continue
    results.push({
      kind: 'clutch-bias',
      priority: 7,
      icon: '⚡',
      memberId: m.memberId,
      text: `${m.memberName} は CLUTCH ${m.clutchCount} 回で全体の ${Math.round(share * 100)}% を占める`,
    })
  }
  return results
}

// 7. CLUTCH 集中 (priority 7)
function detectClutchCluster(ctx: InsightContext): Insight[] {
  const totalClutch = ctx.memberSummaries.reduce((s, m) => s + m.clutchCount, 0)
  if (totalClutch < CLUTCH_CLUSTER_MIN) return []
  return [
    {
      kind: 'clutch-cluster',
      priority: 7,
      icon: '💥',
      text: `期間内 CLUTCH 発動が ${totalClutch} 回と集中 — 高額男気の多い期`,
    },
  ]
}

// 8. 不運ストリーク (priority 6)
function detectNoPayStreak(ctx: InsightContext): Insight[] {
  const results: Insight[] = []
  for (const m of ctx.memberSummaries) {
    if (m.participationCount < NO_PAY_PARTICIPATION_MIN) continue
    if (m.payerCount !== 0) continue
    results.push({
      kind: 'no-pay-streak',
      priority: 6,
      icon: '🌧️',
      memberId: m.memberId,
      text: `${m.memberName} は ${m.participationCount} 回参加で支払 0 回 — ラッキー期間`,
    })
  }
  return results
}

// 9. カテゴリ偏り (priority 6)
function detectCategoryBias(ctx: InsightContext): Insight[] {
  const total = ctx.categoryBreakdown.reduce((s, c) => s + c.amount, 0)
  if (total <= 0) return []
  for (const c of ctx.categoryBreakdown) {
    const share = c.amount / total
    if (share < CATEGORY_BIAS_SHARE) continue
    return [
      {
        kind: 'category-bias',
        priority: 6,
        icon: '🎯',
        text: `${CATEGORY_LABEL[c.category]} カテゴリが総額の ${Math.round(share * 100)}% を占める (${yen(c.amount)})`,
      },
    ]
  }
  return []
}

// 10. ピーク月 (priority 5)
function detectPeakMonth(ctx: InsightContext): Insight[] {
  const total = ctx.monthlyTrend.reduce((s, m) => s + m.amount, 0)
  if (total <= 0 || ctx.monthlyTrend.length < 2) return []
  const peak = [...ctx.monthlyTrend].sort((a, b) => b.amount - a.amount)[0]
  const share = peak.amount / total
  if (share < PEAK_MONTH_SHARE) return []
  return [
    {
      kind: 'peak-month',
      priority: 5,
      icon: '🗓️',
      text: `${monthLabel(peak.month)} が期間総額の ${Math.round(share * 100)}% を占めるピーク月 (${yen(peak.amount)})`,
    },
  ]
}

// 11. CLUTCH 不在 (priority 5)
function detectClutchAbsent(ctx: InsightContext): Insight[] {
  if (ctx.totalCount < CLUTCH_ABSENT_MIN_EVENTS) return []
  const totalClutch = ctx.memberSummaries.reduce((s, m) => s + m.clutchCount, 0)
  if (totalClutch > 0) return []
  return [
    {
      kind: 'clutch-absent',
      priority: 5,
      icon: '🍺',
      text: `今期 CLUTCH 0 件 — 小額男気主体の期 (${ctx.totalCount} 件)`,
    },
  ]
}

// 12. 最長ストリーク (priority 5)
function detectMaxStreak(ctx: InsightContext): Insight[] {
  const results: Insight[] = []
  const sorted = [...ctx.streaks].sort((a, b) => b.maxStreak - a.maxStreak)
  const top = sorted[0]
  if (!top || top.maxStreak < MAX_STREAK_MIN) return results
  const name = top.name ?? ctx.memberSummaries.find((m) => m.memberId === top.id)?.memberName
  if (!name) return results
  results.push({
    kind: 'max-streak',
    priority: 5,
    icon: '🏃',
    memberId: top.id,
    text: `期間最長ストリークは ${name} の ${top.maxStreak} 連続男気`,
  })
  return results
}

// 13. じゃんけん偏り (priority 5)
function detectJankenBias(ctx: InsightContext): Insight[] {
  const results: Insight[] = []
  for (const m of ctx.memberSummaries) {
    if (m.jankenParticipationCount < JANKEN_GAMES_MIN) continue
    if (m.jankenWinRate === null) continue
    if (m.jankenWinRate >= JANKEN_WIN_RATE_HIGH) {
      results.push({
        kind: 'janken-bias',
        priority: 5,
        icon: '✊',
        memberId: m.memberId,
        text: `${m.memberName} はじゃんけん勝率 ${Math.round(m.jankenWinRate * 100)}% (${m.jankenParticipationCount} 戦) で圧勝型`,
      })
    } else if (m.jankenWinRate <= JANKEN_WIN_RATE_LOW) {
      results.push({
        kind: 'janken-bias',
        priority: 5,
        icon: '🫥',
        memberId: m.memberId,
        text: `${m.memberName} はじゃんけん勝率 ${Math.round(m.jankenWinRate * 100)}% (${m.jankenParticipationCount} 戦) で苦戦中`,
      })
    }
  }
  return results
}

// 14. 単発高額記録 (priority 4)
function detectSingleHighRecord(ctx: InsightContext): Insight[] {
  const top = [...ctx.memberSummaries]
    .filter((m) => m.maxSingleOtokogi >= SINGLE_HIGH_THRESHOLD)
    .sort((a, b) => b.maxSingleOtokogi - a.maxSingleOtokogi)[0]
  if (!top) return []
  return [
    {
      kind: 'single-high-record',
      priority: 4,
      icon: '💎',
      memberId: top.memberId,
      text: `期間内の最高額男気は ${top.memberName} の ${yen(top.maxSingleOtokogi)} (単発)`,
    },
  ]
}

// 15. 気前度バイアス (priority 4)
function detectGenerosityBias(ctx: InsightContext): Insight[] {
  const active = ctx.memberSummaries.filter((m) => m.payerCount > 0 && m.averagePaymentAmount > 0)
  if (active.length < 2) return []
  const avgAll = active.reduce((s, m) => s + m.averagePaymentAmount, 0) / active.length
  if (avgAll <= 0) return []
  const top = [...active].sort((a, b) => b.averagePaymentAmount - a.averagePaymentAmount)[0]
  if (top.averagePaymentAmount < avgAll * GENEROSITY_BIAS_RATIO) return []
  return [
    {
      kind: 'generosity-bias',
      priority: 4,
      icon: '🎩',
      memberId: top.memberId,
      text: `${top.memberName} の 1 回あたり平均 ${yen(top.averagePaymentAmount)} は全体平均の ${(top.averagePaymentAmount / avgAll).toFixed(1)} 倍`,
    },
  ]
}

const DETECTORS: ((ctx: InsightContext) => Insight[])[] = [
  detectPeriodGrowthTotal,
  detectPeriodGrowthCount,
  detectMvpNearLocked,
  detectTightRace,
  detectCurrentStreak,
  detectClutchBias,
  detectClutchCluster,
  detectNoPayStreak,
  detectCategoryBias,
  detectPeakMonth,
  detectClutchAbsent,
  detectMaxStreak,
  detectJankenBias,
  detectSingleHighRecord,
  detectGenerosityBias,
]

/**
 * 全 detector を走らせ、優先度降順でソートした Insight 配列を返す。
 * 同一 priority 内では insert 順を維持 (安定ソート)。
 */
export function computeInsights(ctx: InsightContext): Insight[] {
  const all: Insight[] = []
  for (const d of DETECTORS) all.push(...d(ctx))
  // 降順安定ソート
  return all
    .map((ins, i) => ({ ins, i }))
    .sort((a, b) => b.ins.priority - a.ins.priority || a.i - b.i)
    .map((x) => x.ins)
}
