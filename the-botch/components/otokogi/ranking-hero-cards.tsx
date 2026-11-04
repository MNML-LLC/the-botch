import { Yen } from '@/components/ui/yen'
import type { OtokogiRankingEntry } from '@/hooks/use-otokogi'
import { BadgeChip } from '@/components/otokogi/badge-chip'
import { topBadge, type Badge } from '@/lib/otokogi-badges'
import { TermTooltip } from '@/components/ui/term-tooltip'

// メダル (rank → 絵文字)
const MEDAL_BY_RANK: Record<1 | 2 | 3, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
}

// Top-3 のブラス系グラデーション (CEO: brass gradient カラー金/銀/銅)
// - ring/border は同系の濃色で縁取り
// - 上面の装飾バンドで目立たせる
const BRASS_STYLE_BY_RANK: Record<
  1 | 2 | 3,
  { band: string; ring: string; chip: string; label: string }
> = {
  1: {
    band: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600',
    ring: 'ring-amber-500/60',
    chip: 'bg-amber-100 text-amber-800 border border-amber-300',
    label: '金',
  },
  2: {
    band: 'bg-gradient-to-br from-slate-200 via-gray-300 to-slate-500',
    ring: 'ring-slate-400/60',
    chip: 'bg-slate-100 text-slate-700 border border-slate-300',
    label: '銀',
  },
  3: {
    band: 'bg-gradient-to-br from-orange-300 via-amber-500 to-amber-800',
    ring: 'ring-amber-700/60',
    chip: 'bg-orange-100 text-orange-800 border border-orange-300',
    label: '銅',
  },
}

interface HeroCardProps {
  entry: OtokogiRankingEntry
  rank: 1 | 2 | 3
  badge: Badge | null
}

function HeroCard({ entry, rank, badge }: HeroCardProps) {
  const style = BRASS_STYLE_BY_RANK[rank]
  const medal = MEDAL_BY_RANK[rank]
  const ratePercent = Math.round(entry.otokogiRate * 100)

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-white border shadow-sm ring-1 ${style.ring}`}
    >
      {/* 上面バンド (brass gradient) */}
      <div className={`h-2 w-full ${style.band}`} aria-hidden />

      <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
        {/* 順位 + メダル */}
        <div className="flex flex-col items-center shrink-0 w-8 sm:w-12">
          <span
            className="text-xl sm:text-3xl leading-none select-none"
            aria-label={`${rank}位`}
            title={`${rank}位 (${style.label})`}
          >
            {medal}
          </span>
          <span className="text-[10px] sm:text-xs font-bold text-slate-500 tabular-nums mt-0.5">
            #{rank}
          </span>
        </div>

        {/* アバター (mobile 48px / sm 64px) — Issue #382 で mobile 時に縮小 */}
        <div
          className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-sm sm:text-lg font-bold shrink-0 ${entry.colorBg} ${entry.colorText}`}
        >
          {entry.initial}
        </div>

        {/* 名前・指標 — truncate 廃止で 2 行まで折返し可 (Issue #382) */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-bold text-slate-800 text-sm sm:text-lg leading-tight break-words line-clamp-2">
              {entry.name}
            </p>
            {badge && <BadgeChip badge={badge} size="xs" />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-slate-600">
            <span className="tabular-nums">
              支払 <span className="font-semibold text-slate-800">{entry.count}</span> 回
            </span>
            {entry.clutchCount > 0 && (
              <TermTooltip term="CLUTCH" bare>
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded tabular-nums text-[10px] sm:text-[11px] font-semibold cursor-help ${style.chip}`}
                  aria-label={`クラッチ ${entry.clutchCount} 回`}
                >
                  ★ {entry.clutchCount} 回
                </span>
              </TermTooltip>
            )}
            <TermTooltip term="男気率" className="tabular-nums text-[11px] sm:text-xs text-slate-600">
              男気率 <span className="font-semibold text-slate-800">{ratePercent}%</span>
            </TermTooltip>
          </div>
        </div>

        {/* 金額 — mobile は base, sm 以上で xl (Issue #382 で名前スペース確保) */}
        <div className="shrink-0 text-right">
          <Yen
            value={entry.totalPaid}
            size="base"
            className="font-bold text-slate-800 sm:text-xl"
          />
        </div>
      </div>
    </div>
  )
}

interface RankingHeroCardsProps {
  top3: OtokogiRankingEntry[]
  badgesByMember?: Map<string, Badge[]>
}

/**
 * 男気ランキング Top-3 のヒーローカード (Issue #364 / Phase 2)
 * - 1 列スタックで積み上げる (375px 想定)
 * - 各カードに brass gradient のバンド + メダル絵文字
 * - クラッチ回数・男気率も表示
 * - 保有バッジがあれば top バッジ 1 個を名前横に表示 (Issue #368)
 */
export function RankingHeroCards({ top3, badgesByMember }: RankingHeroCardsProps) {
  if (top3.length === 0) return null
  return (
    <div className="space-y-2.5">
      {top3.slice(0, 3).map((entry, i) => (
        <HeroCard
          key={entry.memberId}
          entry={entry}
          rank={(i + 1) as 1 | 2 | 3}
          badge={topBadge(badgesByMember?.get(entry.memberId) ?? [])}
        />
      ))}
    </div>
  )
}
