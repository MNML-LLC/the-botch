import { Yen } from '@/components/ui/yen'
import type { OtokogiRankingEntry } from '@/hooks/use-otokogi'

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
}

function HeroCard({ entry, rank }: HeroCardProps) {
  const style = BRASS_STYLE_BY_RANK[rank]
  const medal = MEDAL_BY_RANK[rank]
  const ratePercent = Math.round(entry.otokogiRate * 100)

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-white border shadow-sm ring-1 ${style.ring}`}
    >
      {/* 上面バンド (brass gradient) */}
      <div className={`h-2 w-full ${style.band}`} aria-hidden />

      <div className="flex items-center gap-3 p-3 sm:p-4">
        {/* 順位 + メダル */}
        <div className="flex flex-col items-center shrink-0 w-10 sm:w-12">
          <span
            className="text-2xl sm:text-3xl leading-none select-none"
            aria-label={`${rank}位`}
            title={`${rank}位 (${style.label})`}
          >
            {medal}
          </span>
          <span className="text-[10px] sm:text-xs font-bold text-slate-500 tabular-nums mt-0.5">
            #{rank}
          </span>
        </div>

        {/* アバター (大) */}
        <div
          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-base sm:text-lg font-bold shrink-0 ${entry.colorBg} ${entry.colorText}`}
        >
          {entry.initial}
        </div>

        {/* 名前・指標 */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 truncate text-base sm:text-lg">{entry.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-slate-600">
            <span className="tabular-nums">
              支払 <span className="font-semibold text-slate-800">{entry.count}</span> 回
            </span>
            {entry.clutchCount > 0 && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded tabular-nums text-[10px] sm:text-[11px] font-semibold ${style.chip}`}
                title={`¥50,000 以上のクラッチ男気を ${entry.clutchCount} 回`}
                aria-label={`クラッチ ${entry.clutchCount} 回`}
              >
                ★ {entry.clutchCount} 回
              </span>
            )}
            <span className="tabular-nums" title="男気率 = 支払回数 ÷ 参加回数">
              男気率 <span className="font-semibold text-slate-800">{ratePercent}%</span>
            </span>
          </div>
        </div>

        {/* 金額 (右) */}
        <div className="shrink-0 text-right">
          <Yen
            value={entry.totalPaid}
            size="lg"
            className="font-bold text-slate-800 sm:text-xl"
          />
        </div>
      </div>
    </div>
  )
}

interface RankingHeroCardsProps {
  top3: OtokogiRankingEntry[]
}

/**
 * 男気ランキング Top-3 のヒーローカード (Issue #364 / Phase 2)
 * - 1 列スタックで積み上げる (375px 想定)
 * - 各カードに brass gradient のバンド + メダル絵文字
 * - クラッチ回数・男気率も表示
 */
export function RankingHeroCards({ top3 }: RankingHeroCardsProps) {
  if (top3.length === 0) return null
  return (
    <div className="space-y-2.5">
      {top3.slice(0, 3).map((entry, i) => (
        <HeroCard key={entry.memberId} entry={entry} rank={(i + 1) as 1 | 2 | 3} />
      ))}
    </div>
  )
}
