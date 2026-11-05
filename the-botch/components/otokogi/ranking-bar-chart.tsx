"use client";

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Yen } from '@/components/ui/yen';
import { BadgeChip } from '@/components/otokogi/badge-chip';
import type { OtokogiRankingEntry } from '@/hooks/use-otokogi';
import type { Badge } from '@/lib/otokogi-badges';
import { TermTooltip } from '@/components/ui/term-tooltip';

// Issue #401: ランキング tab を横棒グラフで視覚化。
//
// CEO 2026-11-05 方針:
//   - 全員 (支払総額 DESC) を横棒グラフで一覧表示
//   - 1 位 = 🥇 金メダル + brass gradient 棒 + 称号 chips
//   - 2 位 = 🥈 silver / 3 位 = 🥉 bronze
//   - 4-6 位 = muted gray (シンプル)
//   - 各行に獲得称号 chips (期間内判定)
//   - 期間切替で bar の長さがアニメ (Motion #369 連携)
//   - 空期間 = 「期間内に記録なし」

export type RankingBarChartProps = {
  periodLabel: string;
  ranking: OtokogiRankingEntry[];
  badgesByMember: Map<string, Badge[]>;
};

type RankTier = 'gold' | 'silver' | 'bronze' | 'muted';

// 順位ごとの視覚テイスト
const TIER_STYLES: Record<RankTier, {
  // ring: ロウ (bar の外枠)
  ring: string;
  // 棒グラデ
  bar: string;
  // 行背景
  rowBg: string;
  // メダル絵文字 or ランク番号の color
  rankText: string;
}> = {
  gold: {
    ring: 'ring-2 ring-amber-500/60',
    bar: 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-600',
    rowBg: 'bg-gradient-to-br from-amber-50/80 to-white',
    rankText: 'text-amber-700',
  },
  silver: {
    ring: 'ring-1 ring-slate-300',
    bar: 'bg-gradient-to-r from-slate-300 via-slate-200 to-slate-400',
    rowBg: 'bg-slate-50/60',
    rankText: 'text-slate-600',
  },
  bronze: {
    ring: 'ring-1 ring-orange-300/70',
    bar: 'bg-gradient-to-r from-orange-300 via-amber-200 to-orange-400',
    rowBg: 'bg-orange-50/50',
    rankText: 'text-orange-700',
  },
  muted: {
    ring: 'ring-1 ring-gray-200',
    bar: 'bg-gradient-to-r from-slate-200 to-slate-300',
    rowBg: 'bg-white',
    rankText: 'text-gray-500',
  },
};

function tierOf(rank: number): RankTier {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return 'muted';
}

// 1-3 位はメダル絵文字、4 位以降はランク番号
function rankBadge(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}`;
}

export function RankingBarChart({ periodLabel, ranking, badgesByMember }: RankingBarChartProps) {
  const prefersReducedMotion = useReducedMotion();

  // 期間内に有効なデータ (totalPaid > 0) がなければプレースホルダ
  const active = ranking.filter((r) => r.totalPaid > 0);
  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
        <p className="text-sm text-gray-500">期間内に男気の記録なし</p>
        <p className="text-[11px] text-gray-400 mt-1">
          別の期間を選ぶか、新しく記録してください。
        </p>
      </div>
    );
  }

  // バーの基準幅: 1 位の totalPaid が 100%。max が 0 なら保険で 1 扱い (0 除算回避)。
  const maxTotal = active[0]?.totalPaid ?? 0;
  const divisor = maxTotal > 0 ? maxTotal : 1;

  return (
    <div className="space-y-2.5">
      {/* キャプション */}
      <p className="text-[11px] text-gray-500">
        期間: <span className="font-medium text-gray-700">{periodLabel}</span> / 支払総額 DESC
      </p>

      {/* バーリスト (順位順) */}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {active.map((entry) => {
            const tier = tierOf(entry.rank);
            const style = TIER_STYLES[tier];
            const ratio = Math.max(0.04, entry.totalPaid / divisor); // 0 の棒が完全消失しないよう最小 4%
            const badges = badgesByMember.get(entry.memberId) ?? [];
            const isHero = tier === 'gold';

            return (
              <motion.div
                key={entry.memberId}
                layout={prefersReducedMotion ? false : 'position'}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 320, damping: 32, mass: 0.9 }
                }
                className={`rounded-lg border p-2.5 sm:p-3 ${style.ring} ${style.rowBg}`}
              >
                {/* 上段: メダル + アバター + 名前 + 金額 */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* ランクメダル */}
                  <div
                    className={`flex items-center justify-center shrink-0 font-bold tabular-nums ${
                      isHero
                        ? 'text-3xl sm:text-4xl leading-none w-10 sm:w-11'
                        : tier === 'silver' || tier === 'bronze'
                          ? 'text-2xl sm:text-3xl leading-none w-10 sm:w-11'
                          : `text-sm sm:text-base w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-100 ${style.rankText}`
                    }`}
                    aria-label={`${entry.rank} 位`}
                  >
                    {rankBadge(entry.rank)}
                  </div>
                  {/* アバター */}
                  <div
                    className={`flex items-center justify-center rounded-full font-bold shrink-0 ${entry.colorBg} ${entry.colorText} ${
                      isHero
                        ? 'w-11 h-11 sm:w-12 sm:h-12 text-base sm:text-lg'
                        : 'w-8 h-8 sm:w-9 sm:h-9 text-xs sm:text-sm'
                    }`}
                  >
                    {entry.initial}
                  </div>
                  {/* 名前 */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-semibold text-slate-900 leading-tight break-words line-clamp-1 ${
                        isHero ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
                      }`}
                    >
                      {entry.name}
                    </p>
                    <p className="text-[11px] text-gray-500 tabular-nums mt-0.5">
                      {entry.count} 回
                      {entry.participationCount > 0 && (
                        <TermTooltip term="男気率" className="ml-1.5 text-[11px] text-gray-500">
                          · 男気率 {Math.round(entry.otokogiRate * 100)}%
                        </TermTooltip>
                      )}
                    </p>
                  </div>
                  {/* 金額 */}
                  <Yen
                    value={entry.totalPaid}
                    size={isHero ? 'lg' : 'base'}
                    className={`font-bold shrink-0 ${isHero ? 'text-amber-700' : 'text-slate-800'}`}
                  />
                </div>

                {/* 中段: 横棒グラフ */}
                <div className="mt-2 relative">
                  <div
                    className={`w-full rounded-full bg-gray-100 overflow-hidden ${isHero ? 'h-4' : 'h-2.5'}`}
                  >
                    <motion.div
                      className={`h-full rounded-full ${style.bar} shadow-inner`}
                      initial={prefersReducedMotion ? false : { width: 0 }}
                      animate={{ width: `${ratio * 100}%` }}
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 160, damping: 26, mass: 0.9 }
                      }
                      aria-hidden
                    />
                  </div>
                </div>

                {/* 下段: 称号 chips (期間内判定) */}
                {badges.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {badges.map((badge) => (
                      <BadgeChip
                        key={badge.id}
                        badge={badge}
                        size={isHero ? 'sm' : 'xs'}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
