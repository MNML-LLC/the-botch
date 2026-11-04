// 男気称号・バッジ計算 (Issue #368 / design review Phase 3)
//
// 計算のみ (DB スキーマ変更なし)。既存の /api/otokogi/stats と
// /api/otokogi/member-summary が返す集計値を合成して各メンバーの称号を判定する。
//
// 称号カテゴリ:
//   - MVP            : 期間内の男気額 (otokogiAmount) 1 位
//   - クラッチマスター : CLUTCH 5 回以上
//   - ストリーク王    : 連続男気 (maxStreak) 5 回以上
//   - 気前度の帝王    : 平均支払単価 (averagePaymentAmount) 1 位
//   - じゃんけん神    : じゃんけん勝率 70% 以上 (10 試合以上)

import { CLUTCH_THRESHOLD } from '@/lib/constants'

export type BadgeKind =
  | 'mvp'
  | 'clutch-master'
  | 'streak-king'
  | 'generosity-emperor'
  | 'janken-god'

export type Badge = {
  // バッジ種別 (優先度判定にも使う)
  kind: BadgeKind
  // 一意 ID。MVP は期間ラベルを含む (例: 'mvp-FY26')
  id: string
  // 短いラベル (リスト/チップ表示用)
  label: string
  // 絵文字アイコン
  icon: string
  // Tailwind のカラークラス (背景 + 文字色をスペース区切りで)
  color: string
  // ツールチップ・詳細説明
  description: string
}

// しきい値 (ロジックの定数, UI からも参照するため export)
export const BADGE_CLUTCH_MIN = 5
export const BADGE_STREAK_MIN = 5
export const BADGE_JANKEN_RATE_MIN = 0.7
export const BADGE_JANKEN_GAMES_MIN = 10

// 優先度順 (ランキングカードの "top バッジ 1 個" 選択用)
export const BADGE_PRIORITY: BadgeKind[] = [
  'mvp',
  'streak-king',
  'clutch-master',
  'generosity-emperor',
  'janken-god',
]

// --- 入力型 (呼び出し側 API の最小サブセット) ---

export type BadgeOtokogiByMember = {
  id: string
  otokogiAmount: number
}

export type BadgeStreakEntry = {
  id: string
  maxStreak: number
}

export type BadgeMemberSummary = {
  memberId: string
  payerCount: number
  averagePaymentAmount: number
  clutchCount: number
  jankenWinRate: number | null
  jankenParticipationCount: number
}

export type BadgeContext = {
  // "FY26" や "2026" など、MVP ラベルに埋め込む期間名
  periodLabel: string
  otokogiByMember: BadgeOtokogiByMember[]
  streaks: BadgeStreakEntry[]
  memberSummaries: BadgeMemberSummary[]
}

/**
 * 指定メンバーが保有する称号バッジを計算する。
 * - DB 変更不要 (既存の集計値のみ使用)
 * - BADGE_PRIORITY の順でソートして返す
 */
export function computeBadges(memberId: string, ctx: BadgeContext): Badge[] {
  const badges: Badge[] = []

  // 1. MVP: 期間内の男気額 (otokogiAmount) 1 位 (0 円は除外)
  const topOtokogi = ctx.otokogiByMember.reduce<BadgeOtokogiByMember | null>(
    (top, m) => (top === null || m.otokogiAmount > top.otokogiAmount ? m : top),
    null,
  )
  if (topOtokogi && topOtokogi.id === memberId && topOtokogi.otokogiAmount > 0) {
    badges.push({
      kind: 'mvp',
      id: `mvp-${ctx.periodLabel}`,
      label: `${ctx.periodLabel} MVP`,
      icon: '🏆',
      color: 'bg-amber-100 text-amber-800',
      description: `${ctx.periodLabel} の男気金額 1 位`,
    })
  }

  // 2. クラッチマスター: CLUTCH 5 回以上
  const summary = ctx.memberSummaries.find((m) => m.memberId === memberId)
  if (summary && summary.clutchCount >= BADGE_CLUTCH_MIN) {
    badges.push({
      kind: 'clutch-master',
      id: 'clutch-master',
      label: 'クラッチマスター',
      icon: '⚡',
      color: 'bg-orange-100 text-orange-700',
      description: `¥${CLUTCH_THRESHOLD.toLocaleString()} 以上の男気を ${summary.clutchCount} 回達成`,
    })
  }

  // 3. ストリーク王: 連続男気 5 回以上
  const streak = ctx.streaks.find((s) => s.id === memberId)
  if (streak && streak.maxStreak >= BADGE_STREAK_MIN) {
    badges.push({
      kind: 'streak-king',
      id: 'streak-king',
      label: `ストリーク王 (${streak.maxStreak}連勝)`,
      icon: '🔥',
      color: 'bg-red-100 text-red-700',
      description: `連続男気 ${streak.maxStreak} 回`,
    })
  }

  // 4. 気前度の帝王: 平均支払単価が 1 位 (payerCount > 0 のみ対象)
  const activeSummaries = ctx.memberSummaries.filter((m) => m.payerCount > 0)
  if (activeSummaries.length > 0) {
    const topAvg = activeSummaries.reduce((top, m) =>
      m.averagePaymentAmount > top.averagePaymentAmount ? m : top,
    )
    if (topAvg.memberId === memberId && topAvg.averagePaymentAmount > 0) {
      badges.push({
        kind: 'generosity-emperor',
        id: 'generosity-emperor',
        label: '気前度の帝王',
        icon: '👑',
        color: 'bg-yellow-100 text-yellow-800',
        description: `平均支払単価 ¥${topAvg.averagePaymentAmount.toLocaleString()} でトップ`,
      })
    }
  }

  // 5. じゃんけん神: 10 試合以上 かつ 勝率 70% 以上
  if (
    summary &&
    summary.jankenWinRate !== null &&
    summary.jankenParticipationCount >= BADGE_JANKEN_GAMES_MIN &&
    summary.jankenWinRate >= BADGE_JANKEN_RATE_MIN
  ) {
    const pct = Math.round(summary.jankenWinRate * 100)
    badges.push({
      kind: 'janken-god',
      id: 'janken-god',
      label: 'じゃんけん神',
      icon: '✊',
      color: 'bg-indigo-100 text-indigo-700',
      description: `じゃんけん勝率 ${pct}% (${summary.jankenParticipationCount} 試合)`,
    })
  }

  return badges.sort((a, b) => priorityIndex(a.kind) - priorityIndex(b.kind))
}

function priorityIndex(kind: BadgeKind): number {
  const i = BADGE_PRIORITY.indexOf(kind)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

/**
 * 保有バッジの中で最優先 (ランキング 1 行目などの "top バッジ 1 個" 表示用)。
 * 空配列なら null を返す。
 */
export function topBadge(badges: Badge[]): Badge | null {
  if (badges.length === 0) return null
  return badges.reduce((top, b) =>
    priorityIndex(b.kind) < priorityIndex(top.kind) ? b : top,
  )
}
