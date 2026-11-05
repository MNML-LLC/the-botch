"use client";

import { motion, useReducedMotion } from 'framer-motion';
import { Yen } from '@/components/ui/yen';
import { BadgeChip } from '@/components/otokogi/badge-chip';
import type { OtokogiRankingEntry } from '@/hooks/use-otokogi';
import type { Badge } from '@/lib/otokogi-badges';

// Issue #401: 男気ランキング tab の最終設計 (CEO 2026-11-05)
// - 全員 (6 人) の支払総額順 horizontal bar chart
// - 相対スケール (within-period: bar の長さ = totalPaid / max * 100%)
// - 1 位 = 🥇 金色 brass gradient / 大サイズ
// - 2 位 = 🥈 silver / 3 位 = 🥉 bronze / 4-6 位 = muted
// - 各行に 獲得称号 chips (期間内判定で表示/非表示)
// - 期間切替で bar の width が smooth にアニメ
// - 空期間は "期間内に記録なし" のみ表示
// - Header に期間内総額・件数を annotation

export type RankingBarChartProps = {
  // 期間ラベル (例: "FY26" / "通算" / "2026/11月")
  periodLabel: string;
  // ランキング (totalPaid DESC)
  ranking: OtokogiRankingEntry[];
  // メンバーID → 保有バッジ (期間内判定)
  badgesByMember: Map<string, Badge[]>;
};

type RankTier = 'gold' | 'silver' | 'bronze' | 'muted';

function tierFor(rank: number): RankTier {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return 'muted';
}

const MEDAL_ICON: Record<RankTier, string | null> = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
  muted: null,
};

// bar の gradient (左→右)
const BAR_GRADIENT: Record<RankTier, string> = {
  gold: 'bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-600',
  silver: 'bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400',
  bronze: 'bg-gradient-to-r from-orange-200 via-amber-400 to-orange-600',
  muted: 'bg-gradient-to-r from-slate-100 to-slate-200',
};

const ROW_RING: Record<RankTier, string> = {
  gold: 'ring-2 ring-amber-500/60',
  silver: 'ring-1 ring-slate-300/70',
  bronze: 'ring-1 ring-orange-400/50',
  muted: 'ring-1 ring-slate-100',
};

export function RankingBarChart({ periodLabel, ranking, badgesByMember }: RankingBarChartProps) {
  const prefersReducedMotion = useReducedMotion();

  const totalAmount = ranking.reduce((sum, m) => sum + m.totalPaid, 0);
  const totalCount = ranking.reduce((sum, m) => sum + m.count, 0);
  const max = ranking.reduce((m, r) => (r.totalPaid > m ? r.totalPaid : m), 0);

  if (ranking.length === 0 || max <= 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
        <p className="text-sm text-gray-500">期間内に記録なし</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          男気イベントを記録するとランキングが表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header annotation: 期間内総額・件数 */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <div className="text-sm font-bold text-slate-700">
          <span className="text-slate-500 text-xs font-medium mr-1.5">{periodLabel}</span>
          期間内総額{' '}
          <Yen value={totalAmount} size="base" className="font-bold text-slate-900 tabular-nums" />
        </div>
        <div className="text-xs text-slate-500 tabular-nums">
          男気 <span className="font-semibold text-slate-700">{totalCount}</span> 件 /{' '}
          <span className="font-semibold text-slate-700">{ranking.length}</span> 人
        </div>
      </div>

      {/* 相対スケール bar chart (全員) */}
      <div className="space-y-2.5">
        {ranking.map((member) => {
          const tier = tierFor(member.rank);
          const medal = MEDAL_ICON[tier];
          const widthPct = max > 0 ? (member.totalPaid / max) * 100 : 0;
          const badges = badgesByMember.get(member.memberId) ?? [];

          const rowPadding = tier === 'gold' ? 'p-3 sm:p-4' : 'p-2.5 sm:p-3';
          const barHeight = tier === 'gold' ? 'h-9 sm:h-10' : 'h-7 sm:h-8';
          const nameSize =
            tier === 'gold'
              ? 'text-base sm:text-lg font-bold'
              : 'text-sm sm:text-base font-semibold';
          const yenSize = tier === 'gold' ? 'base' : 'sm';
          const avatarSize =
            tier === 'gold'
              ? 'w-10 h-10 sm:w-12 sm:h-12 text-sm sm:text-base'
              : 'w-8 h-8 sm:w-9 sm:h-9 text-xs sm:text-sm';

          return (
            <motion.div
              key={member.memberId}
              layout={prefersReducedMotion ? false : 'position'}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 320, damping: 32, mass: 0.9 }
              }
              className={`relative overflow-hidden rounded-lg bg-white border shadow-sm ${ROW_RING[tier]}`}
            >
              <div className={rowPadding}>
                {/* 1 行目: rank / avatar / name / chips / 金額 */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* rank badge (medal or number) */}
                  <div className="flex items-center justify-center shrink-0 w-8 sm:w-9">
                    {medal ? (
                      <span
                        className={tier === 'gold' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}
                        aria-label={`${member.rank}位`}
                      >
                        {medal}
                      </span>
                    ) : (
                      <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold bg-slate-50 text-slate-500 tabular-nums">
                        {member.rank}
                      </span>
                    )}
                  </div>

                  {/* avatar */}
                  <div
                    className={`rounded-full flex items-center justify-center font-bold shrink-0 ${member.colorBg} ${member.colorText} ${avatarSize}`}
                  >
                    {member.initial}
                  </div>

                  {/* name + chips */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p
                        className={`text-slate-900 leading-tight break-words line-clamp-2 ${nameSize}`}
                      >
                        {member.name}
                      </p>
                      {badges.map((b) => (
                        <BadgeChip
                          key={b.id}
                          badge={b}
                          size={tier === 'gold' ? 'sm' : 'xs'}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                      {member.count} 回
                    </p>
                  </div>

                  {/* 金額 */}
                  <Yen
                    value={member.totalPaid}
                    size={yenSize}
                    className={`font-bold tabular-nums shrink-0 ${tier === 'gold' ? 'text-slate-900' : 'text-slate-800'}`}
                  />
                </div>

                {/* 2 行目: 相対スケール bar */}
                <div
                  className={`mt-2 relative rounded-full bg-slate-50 overflow-hidden ${barHeight}`}
                  role="progressbar"
                  aria-valuenow={Math.round(widthPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${member.name} の支払総額 相対比 ${Math.round(widthPct)}%`}
                >
                  <motion.div
                    className={`absolute inset-y-0 left-0 rounded-full ${BAR_GRADIENT[tier]}`}
                    initial={prefersReducedMotion ? false : { width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 160, damping: 26, mass: 0.9 }
                    }
                    aria-hidden
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
