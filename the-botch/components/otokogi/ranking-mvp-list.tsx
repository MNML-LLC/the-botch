import type { Badge } from '@/lib/otokogi-badges'
import type { OtokogiRankingEntry } from '@/hooks/use-otokogi'
import { Yen } from '@/components/ui/yen'
import { BadgeChip } from './badge-chip'

// Issue #401 (CEO 2026-11-05 再方針): 男気ランキング tab を
// 「MVP 大カード 1 枚 + 2 位以下の中サイズ行表示 + 各行に称号 chips」に統合する。
//
// 旧実装 (ranking-title-cards.tsx) は称号別カルーセルで独立カードを並べていたが、
// 「全員の総額順で並べ、称号は chip で併記する」ほうが CEO 的に読みやすい。
// Top-3 ヒーローカード / 称号別カード / 全員の集計表 の 3 セクションを 1 本に統合する。

type RankingMvpListProps = {
  // 期間ラベル (例: "FY26" / "通算")。MVP カードの小見出しに使う
  periodLabel: string
  // ランキング (totalPaid DESC、rank 付与済み)
  ranking: OtokogiRankingEntry[]
  // メンバーID → そのメンバーが保有する称号バッジ (期間フィルタ内判定)
  badgesByMember: Map<string, Badge[]>
}

export function RankingMvpList({ periodLabel, ranking, badgesByMember }: RankingMvpListProps) {
  if (ranking.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-4 sm:p-6 text-center">
        <p className="text-sm text-gray-500">期間内に男気の記録なし</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          男気イベントを記録するとランキングと称号が表示されます。
        </p>
      </div>
    )
  }

  const [mvp, ...rest] = ranking

  return (
    <div className="space-y-3">
      <MvpCard
        periodLabel={periodLabel}
        entry={mvp}
        badges={badgesByMember.get(mvp.memberId) ?? []}
      />
      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((entry) => (
            <RankRow
              key={entry.memberId}
              entry={entry}
              badges={badgesByMember.get(entry.memberId) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MvpCard({
  periodLabel,
  entry,
  badges,
}: {
  periodLabel: string
  entry: OtokogiRankingEntry
  badges: Badge[]
}) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white border shadow-sm ring-2 ring-amber-500/60">
      {/* 上面の brass gradient バンド */}
      <div
        className="h-3 w-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600"
        aria-hidden
      />
      <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
        {/* 1 位メダル + MVP ラベル */}
        <div className="flex flex-col items-center shrink-0 w-14 sm:w-16">
          <span className="text-3xl sm:text-4xl leading-none select-none" aria-hidden>
            🥇
          </span>
          <span className="mt-1 text-[10px] sm:text-[11px] font-bold text-amber-700 whitespace-nowrap">
            {periodLabel} MVP
          </span>
        </div>

        {/* アバター */}
        <div
          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-base sm:text-lg font-bold shrink-0 ${entry.colorBg} ${entry.colorText}`}
        >
          {entry.initial}
        </div>

        {/* 名前・金額・称号 chips */}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-bold text-slate-900 text-base sm:text-xl leading-tight break-words line-clamp-2">
            {entry.name}
          </p>
          <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
            <Yen
              value={entry.totalPaid}
              size="xl"
              className="font-bold text-slate-800 tabular-nums"
            />
            <span className="text-xs text-slate-500 tabular-nums">{entry.count}回</span>
          </div>
          {badges.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {badges.map((badge) => (
                <BadgeChip key={badge.id} badge={badge} size="xs" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RankRow({
  entry,
  badges,
}: {
  entry: OtokogiRankingEntry
  badges: Badge[]
}) {
  const medal = entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null
  return (
    <div className="flex items-center gap-2 sm:gap-3 bg-white rounded-lg border p-2.5 sm:p-3 shadow-sm">
      {/* rank (メダル or 数字) */}
      <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-gray-50 text-gray-500 tabular-nums">
        {medal ?? entry.rank}
      </span>
      {/* アバター */}
      <div
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${entry.colorBg} ${entry.colorText}`}
      >
        {entry.initial}
      </div>
      {/* 名前 + 称号 chips + 回数 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-slate-800 break-words line-clamp-1 leading-tight">
            {entry.name}
          </p>
          {badges.map((badge) => (
            <BadgeChip key={badge.id} badge={badge} size="xs" />
          ))}
        </div>
        <p className="text-xs text-gray-500 tabular-nums mt-0.5">{entry.count}回</p>
      </div>
      {/* 支払総額 */}
      <Yen
        value={entry.totalPaid}
        size="sm"
        className="font-bold text-slate-800 shrink-0"
      />
    </div>
  )
}
