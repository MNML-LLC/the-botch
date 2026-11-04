// FY (会計年度) ベースの男気バッジ計算 (Issue #393)
//
// 既存の lib/otokogi-badges.ts は "期間フィルタ (current-fy / last-fy / custom)" に
// 応じて単一期間のバッジを返す設計だったが、本モジュールは "全データを走査して FY
// ごとに独立にバッジを計算し、各メンバーの称号履歴をタイムラインとして返す" ための
// 純関数を提供する。
//
// 計算のみ (DB スキーマ変更なし)。呼び出し側 API (/api/otokogi/fy-badges) で
// OtokogiEvent + 参加者を全件取得して渡す。
//
// FY 定義: 11 月開始 → 翌年 10 月末 (MNML 独自運用)。
//   - FY2026 = 2026/11/1 〜 2027/10/31
//   - eventDate が 2026/01/15 なら FY2025 に属する
//
// 称号 (FY ごと):
//   💎 FY MVP         : actualPaid (支払総額) 1 位
//   🏆 FY 裏男気王     : actualPaid − shouldHavePaid (フェアシェア超過) 1 位
//   ⚡ FY 量産王       : payerCount (奢った回数) 1 位
//   🔥 FY 連勝王       : maxStreak (連続男気) 最大, 5 回以上
//   👑 FY 気前度の帝王 : averagePaymentAmount (1 回平均額) 1 位

import type { Badge, BadgeKind } from '@/lib/otokogi-badges'

export const FY_BADGE_STREAK_MIN = 5

// FY バッジでの優先度
export const FY_BADGE_PRIORITY: BadgeKind[] = [
  'mvp',
  'shadow-otokogi-king',
  'count-king',
  'streak-king',
  'generosity-emperor',
]

// 入力: 1 件の男気イベント (payer + 参加者 ID のみ)
export type FyBadgeOtokogiEvent = {
  id: string
  eventDate: Date | string
  amount: number
  payerId: string
  participantIds: string[]
}

export type FyBadgeMember = {
  id: string
  name: string
}

export type FyAggregate = {
  memberId: string
  payerCount: number
  actualPaid: number
  shouldHavePaid: number
  // actualPaid − shouldHavePaid (裏男気 = フェアシェア超過分)
  shadowOtokogi: number
  averagePaymentAmount: number
  maxStreak: number
}

export type FyResult = {
  fy: number
  // "FY26" のような短いラベル
  shortLabel: string
  from: Date
  to: Date
  eventCount: number
  totalAmount: number
  aggregates: FyAggregate[]
  // memberId → Badge[] (優先度順)
  badgesByMember: Map<string, Badge[]>
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v)
}

// 与えられた日付が属する会計年度 (FY) を返す。
// 11 月〜12 月は当年、1 月〜10 月は前年の FY に属する。
export function fyOfDate(date: Date | string): number {
  const d = toDate(date)
  const month = d.getMonth() + 1 // 1-12
  const year = d.getFullYear()
  return month >= 11 ? year : year - 1
}

export function fyRange(fy: number): { from: Date; to: Date } {
  return {
    from: new Date(fy, 10, 1, 0, 0, 0, 0), // 11/1
    to: new Date(fy + 1, 9, 31, 23, 59, 59, 999), // 翌年 10/31
  }
}

export function fyShortLabel(fy: number): string {
  return `FY${(fy % 100).toString().padStart(2, '0')}`
}

/**
 * 全男気イベントを走査して FY ごとの集計 + バッジを計算する。
 *
 * - FY は event が 1 件以上存在する年度のみを返す
 * - 新しい FY (大きい fy 値) から順にソートされた配列を返す (タイムライン表示用)
 */
export function computeFyBadges(
  events: FyBadgeOtokogiEvent[],
  members: FyBadgeMember[],
): FyResult[] {
  // FY ごとに event を振り分け
  const eventsByFy = new Map<number, FyBadgeOtokogiEvent[]>()
  for (const ev of events) {
    const fy = fyOfDate(ev.eventDate)
    if (!eventsByFy.has(fy)) eventsByFy.set(fy, [])
    eventsByFy.get(fy)!.push(ev)
  }

  const results: FyResult[] = []
  const fys = Array.from(eventsByFy.keys()).sort((a, b) => b - a) // 新しい FY が先

  for (const fy of fys) {
    const fyEvents = (eventsByFy.get(fy) ?? [])
      .slice()
      .sort((a, b) => toDate(a.eventDate).getTime() - toDate(b.eventDate).getTime())

    const { from, to } = fyRange(fy)

    // --- メンバー別集計 ---
    type Acc = {
      payerCount: number
      actualPaid: number
      shouldHavePaid: number
    }
    const accByMember = new Map<string, Acc>()
    const ensureAcc = (memberId: string): Acc => {
      let a = accByMember.get(memberId)
      if (!a) {
        a = { payerCount: 0, actualPaid: 0, shouldHavePaid: 0 }
        accByMember.set(memberId, a)
      }
      return a
    }

    let totalAmount = 0
    for (const ev of fyEvents) {
      totalAmount += ev.amount
      const payerAcc = ensureAcc(ev.payerId)
      payerAcc.payerCount += 1
      payerAcc.actualPaid += ev.amount

      const pc = Math.max(ev.participantIds.length, 1)
      const share = ev.amount / pc
      for (const pid of ev.participantIds) {
        ensureAcc(pid).shouldHavePaid += share
      }
    }

    // --- Streak 計算 (FY 内イベントのみを時系列で走査) ---
    const streakByMember = new Map<string, number>()
    for (const member of members) {
      let maxStreak = 0
      let currentStreak = 0
      let lastWasPayer = false
      for (const ev of fyEvents) {
        const isParticipant = ev.participantIds.includes(member.id)
        if (!isParticipant) continue
        if (ev.payerId === member.id) {
          currentStreak += 1
          lastWasPayer = true
          if (currentStreak > maxStreak) maxStreak = currentStreak
        } else {
          if (lastWasPayer) currentStreak = 0
          lastWasPayer = false
        }
      }
      streakByMember.set(member.id, maxStreak)
    }

    // --- 集計行の組み立て ---
    const aggregates: FyAggregate[] = []
    for (const member of members) {
      const acc = accByMember.get(member.id) ?? {
        payerCount: 0,
        actualPaid: 0,
        shouldHavePaid: 0,
      }
      const payerCount = acc.payerCount
      const actualPaid = acc.actualPaid
      const shouldHavePaid = Math.round(acc.shouldHavePaid)
      aggregates.push({
        memberId: member.id,
        payerCount,
        actualPaid,
        shouldHavePaid,
        shadowOtokogi: actualPaid - shouldHavePaid,
        averagePaymentAmount: payerCount > 0 ? Math.round(actualPaid / payerCount) : 0,
        maxStreak: streakByMember.get(member.id) ?? 0,
      })
    }

    const shortLabel = fyShortLabel(fy)
    const badgesByMember = computeFyBadgesInternal(shortLabel, aggregates)

    results.push({
      fy,
      shortLabel,
      from,
      to,
      eventCount: fyEvents.length,
      totalAmount,
      aggregates,
      badgesByMember,
    })
  }

  return results
}

function priorityIndex(kind: BadgeKind): number {
  const i = FY_BADGE_PRIORITY.indexOf(kind)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

function computeFyBadgesInternal(
  shortLabel: string,
  aggregates: FyAggregate[],
): Map<string, Badge[]> {
  const result = new Map<string, Badge[]>()
  const push = (memberId: string, badge: Badge) => {
    let list = result.get(memberId)
    if (!list) {
      list = []
      result.set(memberId, list)
    }
    list.push(badge)
  }

  // 1. MVP: actualPaid 1 位 (0 円のみは対象外)
  const mvp = maxBy(aggregates, (a) => a.actualPaid, (a) => a.actualPaid > 0)
  if (mvp) {
    push(mvp.memberId, {
      kind: 'mvp',
      id: `mvp-${shortLabel}`,
      label: `${shortLabel} MVP`,
      icon: '💎',
      color: 'bg-amber-100 text-amber-800',
      description: `${shortLabel} に支払った男気の合計額 1 位 (¥${mvp.actualPaid.toLocaleString()})。シンプルな合計額の王者。`,
    })
  }

  // 2. 裏男気王: shadowOtokogi (フェアシェア超過) 1 位 (正の値のみ対象)
  const shadow = maxBy(aggregates, (a) => a.shadowOtokogi, (a) => a.shadowOtokogi > 0)
  if (shadow) {
    push(shadow.memberId, {
      kind: 'shadow-otokogi-king',
      id: `shadow-otokogi-king-${shortLabel}`,
      label: `${shortLabel} 裏男気王`,
      icon: '🏆',
      color: 'bg-rose-100 text-rose-800',
      description: `${shortLabel} のフェアシェア超過分 1 位 (¥${shadow.shadowOtokogi.toLocaleString()})。期待負担を超えて引き受けた "隠れた真の男気"。`,
    })
  }

  // 3. 量産王: payerCount 1 位
  const count = maxBy(aggregates, (a) => a.payerCount, (a) => a.payerCount > 0)
  if (count) {
    push(count.memberId, {
      kind: 'count-king',
      id: `count-king-${shortLabel}`,
      label: `${shortLabel} 量産王`,
      icon: '⚡',
      color: 'bg-emerald-100 text-emerald-800',
      description: `${shortLabel} に奢った "回数" 1 位 (${count.payerCount} 回)。コツコツ出し続けた量産型。`,
    })
  }

  // 4. 連勝王: maxStreak 最大 かつ FY_BADGE_STREAK_MIN 以上
  const streak = maxBy(
    aggregates,
    (a) => a.maxStreak,
    (a) => a.maxStreak >= FY_BADGE_STREAK_MIN,
  )
  if (streak) {
    push(streak.memberId, {
      kind: 'streak-king',
      id: `streak-king-${shortLabel}`,
      label: `${shortLabel} 連勝王 (${streak.maxStreak}連勝)`,
      icon: '🔥',
      color: 'bg-red-100 text-red-700',
      description: `${shortLabel} 内の連続男気 ${streak.maxStreak} 回。止まらなかった漢。`,
    })
  }

  // 5. 気前度の帝王: averagePaymentAmount 1 位 (payerCount > 0 のみ対象)
  const generosity = maxBy(
    aggregates,
    (a) => a.averagePaymentAmount,
    (a) => a.payerCount > 0 && a.averagePaymentAmount > 0,
  )
  if (generosity) {
    push(generosity.memberId, {
      kind: 'generosity-emperor',
      id: `generosity-emperor-${shortLabel}`,
      label: `${shortLabel} 気前度の帝王`,
      icon: '👑',
      color: 'bg-yellow-100 text-yellow-800',
      description: `${shortLabel} の 1 回あたりの平均 payer 額 1 位 (¥${generosity.averagePaymentAmount.toLocaleString()})。1 回ごとに豪快。`,
    })
  }

  // 優先度順にソート
  for (const [memberId, badges] of result.entries()) {
    result.set(
      memberId,
      badges.slice().sort((a, b) => priorityIndex(a.kind) - priorityIndex(b.kind)),
    )
  }
  return result
}

// score が最大のエントリを返す。eligible が false のエントリは候補から除外。
// 同点の場合は最初のエントリを返す。
function maxBy<T>(
  items: T[],
  score: (x: T) => number,
  eligible: (x: T) => boolean,
): T | null {
  let best: T | null = null
  let bestScore = -Infinity
  for (const item of items) {
    if (!eligible(item)) continue
    const s = score(item)
    if (s > bestScore) {
      bestScore = s
      best = item
    }
  }
  return best
}
