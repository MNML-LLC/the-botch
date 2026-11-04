// 男気称号・バッジ計算 (Issue #368 / Issue #393)
//
// 計算のみ (DB スキーマ変更なし)。既存の /api/otokogi/stats と
// /api/otokogi/member-summary が返す集計値を合成して各メンバーの称号を判定する。
//
// 称号カテゴリ:
//   - MVP            : 期間内の "actualPaid" (支払総額) 1 位 (Issue #393)
//   - 男気量産王      : 期間内の payerCount (奢った件数) 1 位 (Issue #393)
//   - 裏男気王        : 期間内の "actualPaid - shouldHavePaid" (フェアシェア超過分) 1 位 (Issue #393)
//   - クラッチマスター : CLUTCH 5 回以上
//   - ストリーク王    : 連続男気 (maxStreak) 5 回以上
//   - 気前度の帝王    : 平均支払単価 (averagePaymentAmount) 1 位
//   - じゃんけん神    : じゃんけん勝率 70% 以上 (10 試合以上)
//
// 期間フィルタ (CEO 原則 / Issue #393):
//   全ての判定・計算は BadgeContext に渡された期間内のデータに閉じる。
//   呼び出し側 (API / hooks) は期間を切り替えるたびに member-summary / stats を
//   再フェッチし、computeBadges に渡す ctx を作り直すこと。

import { CLUTCH_THRESHOLD } from '@/lib/constants'

export type BadgeKind =
  | 'mvp'
  | 'count-king'
  | 'shadow-otokogi-king'
  | 'clutch-master'
  | 'streak-king'
  | 'generosity-emperor'
  | 'janken-god'

export type Badge = {
  // バッジ種別 (優先度判定にも使う)
  kind: BadgeKind
  // 一意 ID。MVP / 男気量産王 は期間ラベルを含む (例: 'mvp-FY26')
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
// MVP (総額) → 男気量産王 (回数) → 裏男気王 (フェアシェア超過分) の 3 primary (Issue #393)
export const BADGE_PRIORITY: BadgeKind[] = [
  'mvp',
  'count-king',
  'shadow-otokogi-king',
  'streak-king',
  'clutch-master',
  'generosity-emperor',
  'janken-god',
]

// --- 入力型 (呼び出し側 API の最小サブセット) ---

export type BadgeStreakEntry = {
  id: string
  maxStreak: number
}

export type BadgeMemberSummary = {
  memberId: string
  payerCount: number
  // Issue #393: MVP を actualPaid ベースにするため追加
  actualPaid: number
  // Issue #393: 裏男気王 (shadow-otokogi-king) 判定用。actualPaid - shouldHavePaid の
  // サーバー側計算値をそのまま受け取る (フェアシェア超過分、負でも良い)。
  otokogiAmount: number
  averagePaymentAmount: number
  clutchCount: number
  jankenWinRate: number | null
  jankenParticipationCount: number
}

export type BadgeContext = {
  // "FY26" や "2026" など、MVP ラベルに埋め込む期間名
  periodLabel: string
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

  // 1. MVP: 期間内の "actualPaid" (支払総額) 1 位 (Issue #393)
  //    旧実装は otokogiAmount (フェアシェア超過分) で判定していたため、
  //    参加回数が少ないメンバーが MVP になるケースがあった。
  const topActualPaid = ctx.memberSummaries.reduce<BadgeMemberSummary | null>(
    (top, m) => (top === null || m.actualPaid > top.actualPaid ? m : top),
    null,
  )
  if (topActualPaid && topActualPaid.memberId === memberId && topActualPaid.actualPaid > 0) {
    badges.push({
      kind: 'mvp',
      id: `mvp-${ctx.periodLabel}`,
      label: `${ctx.periodLabel} MVP (総額)`,
      icon: '🏆',
      color: 'bg-amber-100 text-amber-800',
      description: `${ctx.periodLabel} に支払った男気の "合計" 1 位 (¥${topActualPaid.actualPaid.toLocaleString()})。ガッツリ出した総大将。`,
    })
  }

  // 2. 男気量産王: 期間内の payerCount (奢った件数) 1 位 (Issue #393)
  //    「¥10k x 30 回」と「¥100k x 3 回」で前者を評価する軸。
  const topCount = ctx.memberSummaries.reduce<BadgeMemberSummary | null>(
    (top, m) => (top === null || m.payerCount > top.payerCount ? m : top),
    null,
  )
  if (topCount && topCount.memberId === memberId && topCount.payerCount > 0) {
    badges.push({
      kind: 'count-king',
      id: `count-king-${ctx.periodLabel}`,
      label: `${ctx.periodLabel} 男気量産王`,
      icon: '🎖️',
      color: 'bg-emerald-100 text-emerald-800',
      description: `${ctx.periodLabel} に奢った件数 1 位 (${topCount.payerCount} 回)。コツコツ出し続けた量産型。`,
    })
  }

  // 3. 裏男気王: 期間内の "actualPaid - shouldHavePaid" (フェアシェア超過分) 1 位 (Issue #393)
  //    「期待負担を超えて引き受けた隠れた真の男気」。正の値のみ対象。
  const topShadow = ctx.memberSummaries.reduce<BadgeMemberSummary | null>(
    (top, m) => (top === null || m.otokogiAmount > top.otokogiAmount ? m : top),
    null,
  )
  if (topShadow && topShadow.memberId === memberId && topShadow.otokogiAmount > 0) {
    badges.push({
      kind: 'shadow-otokogi-king',
      id: `shadow-otokogi-king-${ctx.periodLabel}`,
      label: `${ctx.periodLabel} 裏男気王`,
      icon: '🥷',
      color: 'bg-purple-100 text-purple-800',
      description: `${ctx.periodLabel} のフェアシェア超過分 1 位 (+¥${topShadow.otokogiAmount.toLocaleString()})。期待負担を超えて引き受けた隠れた真の男気。`,
    })
  }

  // 4. クラッチマスター: CLUTCH 5 回以上
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

  // 5. ストリーク王: 連続男気 5 回以上
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

  // 6. 気前度の帝王: 平均支払単価が 1 位 (payerCount > 0 のみ対象)
  const activeSummaries = ctx.memberSummaries.filter((m) => m.payerCount > 0)
  if (activeSummaries.length > 0) {
    const topAvg = activeSummaries.reduce((top, m) =>
      m.averagePaymentAmount > top.averagePaymentAmount ? m : top,
    )
    if (topAvg.memberId === memberId && topAvg.averagePaymentAmount > 0) {
      badges.push({
        kind: 'generosity-emperor',
        id: 'generosity-emperor',
        label: '気前度の帝王 (平均)',
        icon: '👑',
        color: 'bg-yellow-100 text-yellow-800',
        description: `1 回あたりの平均 payer 額 "平均" 1 位 (¥${topAvg.averagePaymentAmount.toLocaleString()})。1 回ごとに豪快。`,
      })
    }
  }

  // 7. じゃんけん神: 10 試合以上 かつ 勝率 70% 以上
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
