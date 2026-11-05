"use client"

import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { OtokogiRankingEntry } from '@/hooks/use-otokogi'
import type { Badge } from '@/lib/otokogi-badges'
import { BadgeChip } from '@/components/otokogi/badge-chip'
import { Yen } from '@/components/ui/yen'

// Issue #406: 男気ランキング tab を 横棒グラフ (6人) で視覚化。
// Issue #418: スケーリングを「総額 100%」= シェア率表示 に変更。
//
// 旧 "Top-3 称号カード (#403)" + "全員の集計表" を 1 枚の横棒チャートに統合。
// - シェア率スケール (within-period): 期間内総額を 100% として各メンバーが何割払ったか
// - 1 位 = brass gradient (gold)、2 位 = silver、3 位 = bronze、4-6 位 = slate
// - 各行に 期間内獲得称号 chips
// - 期間変更で bar width がスプリングで伸縮 (Framer Motion)

type RankTier = 'gold' | 'silver' | 'bronze' | 'slate'

type TierStyle = {
  gradient: string
  container: string
  rankBg: string
  medal: string | null
}

const TIER_STYLES: Record<RankTier, TierStyle> = {
  gold: {
    gradient: 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-600',
    container: 'bg-amber-50/70 ring-2 ring-amber-400/60 shadow-sm',
    rankBg: 'bg-amber-100 text-amber-800',
    medal: '🥇',
  },
  silver: {
    gradient: 'bg-gradient-to-r from-slate-300 via-slate-400 to-slate-500',
    container: 'bg-white ring-1 ring-slate-300/70',
    rankBg: 'bg-slate-100 text-slate-700',
    medal: '🥈',
  },
  bronze: {
    gradient: 'bg-gradient-to-r from-orange-400 via-orange-500 to-orange-700',
    container: 'bg-white ring-1 ring-orange-300/60',
    rankBg: 'bg-orange-100 text-orange-800',
    medal: '🥉',
  },
  slate: {
    gradient: 'bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400',
    container: 'bg-white ring-1 ring-gray-200',
    rankBg: 'bg-gray-100 text-gray-600',
    medal: null,
  },
}

function rankTier(rank: number): RankTier {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  if (rank === 3) return 'bronze'
  return 'slate'
}

export type RankingBarChartProps = {
  // 期間レンジ文字列 (例: "2026年11月1日 〜 2027年10月31日")。null なら "通算" 扱い
  periodRangeText: string | null
  // 期間名ラベル (例: "FY26 進行中" / "通算" / "2026/11月")
  periodStatusText: string
  // ランキングデータ (totalPaid DESC, rank 付与済み)
  ranking: OtokogiRankingEntry[]
  // メンバー別バッジ
  badgesByMember: Map<string, Badge[]>
}

export function RankingBarChart({
  periodRangeText,
  periodStatusText,
  ranking,
  badgesByMember,
}: RankingBarChartProps) {
  const prefersReducedMotion = useReducedMotion()

  const { totalAmount, totalCount, hasAnyPaid } = useMemo(() => {
    let totalAmount = 0
    let totalCount = 0
    for (const r of ranking) {
      totalAmount += r.totalPaid
      totalCount += r.count
    }
    return { totalAmount, totalCount, hasAnyPaid: totalAmount > 0 }
  }, [ranking])

  return (
    <div className="space-y-3">
      {/* Header: 期間レンジ + 期間内集計 */}
      <div className="rounded-lg bg-slate-50/70 px-3 py-2.5 border border-slate-200/70">
        <p className="text-[11px] text-slate-600 leading-snug">
          <span className="font-semibold text-slate-700">期間:</span>{' '}
          {periodRangeText ? (
            <span className="tabular-nums text-slate-700">{periodRangeText}</span>
          ) : (
            <span className="text-slate-700">通算 (全期間)</span>
          )}
          {periodStatusText && (
            <span className="ml-1 text-slate-400">({periodStatusText})</span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
          <span className="text-slate-500">期間内総額:</span>
          <Yen
            value={totalAmount}
            size="sm"
            className="font-bold text-slate-800 tabular-nums"
          />
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">男気発動:</span>
          <span className="font-bold text-slate-800 tabular-nums">{totalCount}</span>
          <span className="text-slate-500">回</span>
        </div>
      </div>

      {/* 横棒チャート本体 */}
      {!hasAnyPaid ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
          <p className="text-2xl mb-1" aria-hidden>
            📊
          </p>
          <p className="text-sm text-gray-500">期間内に男気の記録なし</p>
        </div>
      ) : (
        <ol className="space-y-2.5">
          {ranking.map((entry) => {
            const tier = rankTier(entry.rank)
            const style = TIER_STYLES[tier]
            const sharePct =
              totalAmount > 0 ? (entry.totalPaid / totalAmount) * 100 : 0
            const badges = badgesByMember.get(entry.memberId) ?? []
            const shareLabel = sharePct.toFixed(1)
            const roundedShare = Math.round(sharePct)
            return (
              <li
                key={entry.memberId}
                className={`rounded-lg px-2.5 py-2.5 sm:px-3 ${style.container}`}
              >
                {/* Row 1: rank-medal + avatar + name + amount */}
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div
                    className={`flex items-center justify-center shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full font-bold ${style.rankBg}`}
                    aria-label={`${entry.rank}位`}
                  >
                    {style.medal ? (
                      <span className="text-base sm:text-lg leading-none" aria-hidden>
                        {style.medal}
                      </span>
                    ) : (
                      <span className="text-xs tabular-nums">{entry.rank}</span>
                    )}
                  </div>
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${entry.colorBg} ${entry.colorText}`}
                  >
                    {entry.initial}
                  </div>
                  <p className="flex-1 min-w-0 text-sm font-bold text-slate-900 leading-tight break-words line-clamp-1">
                    {entry.name}
                  </p>
                  <div className="flex items-baseline gap-1 shrink-0">
                    <Yen
                      value={entry.totalPaid}
                      size="sm"
                      className="font-bold text-slate-900 tabular-nums"
                    />
                    <span className="text-[10px] text-gray-500 tabular-nums">
                      ({entry.count}回)
                    </span>
                  </div>
                </div>

                {/* Row 2: bar (シェア率 = 総額 100%) */}
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    className="relative flex-1 h-3 sm:h-3.5 rounded-full bg-gray-100 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={roundedShare}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`期間内総額に対するシェア率 ${shareLabel}%`}
                  >
                    <motion.div
                      className={`h-full ${style.gradient} rounded-full`}
                      initial={
                        prefersReducedMotion ? { width: `${sharePct}%` } : { width: 0 }
                      }
                      animate={{ width: `${sharePct}%` }}
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 160, damping: 26, mass: 0.9 }
                      }
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 tabular-nums w-12 text-right shrink-0">
                    {shareLabel}%
                  </span>
                </div>

                {/* Row 3: 期間内獲得称号 chips */}
                {badges.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {badges.map((badge) => (
                      <BadgeChip key={badge.id} badge={badge} size="xs" />
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
