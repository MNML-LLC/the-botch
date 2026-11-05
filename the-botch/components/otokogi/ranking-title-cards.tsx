import { Yen } from '@/components/ui/yen'
import type { OtokogiRankingEntry } from '@/hooks/use-otokogi'
import {
  BADGE_STREAK_MIN,
  BADGE_JANKEN_RATE_MIN,
  BADGE_JANKEN_GAMES_MIN,
} from '@/lib/otokogi-badges'

// Issue #401: ランキング tab の Top を「称号カルーセル」に再構成。
//
// 旧 Top-3 ヒーローカードは totalPaid DESC の 1/2/3 位をそのまま並べていたため、
// 「1 位 = MVP (総額)」以外のカードは意味のある称号を表現できていなかった。
// 本コンポーネントは MVP を主役として大きく出し、裏男気王 / 量産王 /
// 連勝王 / 気前度の帝王 / じゃんけん神 を "独立の軸" として並列に見せる。

type TitleMemberSummary = {
  memberId: string
  memberName: string
  payerCount: number
  participationCount: number
  actualPaid: number
  otokogiAmount: number
  averagePaymentAmount: number
  jankenWinRate: number | null
  jankenParticipationCount: number
}

type MemberStyle = {
  initial: string
  colorBg: string
  colorText: string
  name: string
}

export type RankingTitleCardsProps = {
  // 期間ラベル (例: "FY26" / "通算" / "2026/11月")
  periodLabel: string
  // ランキング (支払総額 DESC)。MVP の金額表示とメンバーのスタイル解決に使う
  ranking: OtokogiRankingEntry[]
  // メンバーID → member-summary (数値)。期間フィルタ内のみの集計
  memberSummariesById: Map<string, TitleMemberSummary>
  // メンバーID → 最大連続男気数
  streaksById: Map<string, number>
}

type CardColor = 'gold' | 'rose' | 'emerald' | 'red' | 'yellow' | 'indigo'

type TitleCard = {
  kind: string
  icon: string
  title: string
  // 「もりや」「田中」等の人物名。被り時は複数人並べる
  memberName: string
  memberStyle: MemberStyle | null
  // サブタイトル (金額 / 回数 等)
  subtitle: React.ReactNode
  color: CardColor
  // MVP は hero スタイル、それ以外は secondary
  variant: 'hero' | 'secondary'
}

const CARD_STYLES: Record<CardColor, { ring: string; band: string; chipBg: string }> = {
  gold: {
    ring: 'ring-amber-500/60',
    band: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600',
    chipBg: 'bg-amber-50',
  },
  rose: {
    ring: 'ring-rose-400/50',
    band: 'bg-gradient-to-br from-rose-300 to-rose-500',
    chipBg: 'bg-rose-50',
  },
  emerald: {
    ring: 'ring-emerald-400/50',
    band: 'bg-gradient-to-br from-emerald-300 to-emerald-500',
    chipBg: 'bg-emerald-50',
  },
  red: {
    ring: 'ring-red-400/50',
    band: 'bg-gradient-to-br from-red-300 to-red-500',
    chipBg: 'bg-red-50',
  },
  yellow: {
    ring: 'ring-yellow-400/50',
    band: 'bg-gradient-to-br from-yellow-300 to-yellow-500',
    chipBg: 'bg-yellow-50',
  },
  indigo: {
    ring: 'ring-indigo-400/50',
    band: 'bg-gradient-to-br from-indigo-300 to-indigo-500',
    chipBg: 'bg-indigo-50',
  },
}

function buildCards(props: RankingTitleCardsProps): TitleCard[] {
  const { periodLabel, ranking, memberSummariesById, streaksById } = props

  const styleById = new Map<string, MemberStyle>()
  for (const r of ranking) {
    styleById.set(r.memberId, {
      initial: r.initial,
      colorBg: r.colorBg,
      colorText: r.colorText,
      name: r.name,
    })
  }

  const summaries = Array.from(memberSummariesById.values())

  const cards: TitleCard[] = []

  // 1. MVP (actualPaid 1 位)
  const mvp = pickMax(summaries, (m) => m.actualPaid, (m) => m.actualPaid > 0)
  if (mvp) {
    cards.push({
      kind: 'mvp',
      icon: '💎',
      title: `${periodLabel} MVP`,
      memberName: mvp.memberName,
      memberStyle: styleById.get(mvp.memberId) ?? null,
      subtitle: (
        <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="text-[11px] text-slate-600">支払総額</span>
          <Yen value={mvp.actualPaid} size="xl" className="font-bold text-slate-800 tabular-nums" />
        </span>
      ),
      color: 'gold',
      variant: 'hero',
    })
  }

  // 2. 裏男気王 (otokogiAmount 1 位 — 正の値のみ対象)
  const shadow = pickMax(
    summaries,
    (m) => m.otokogiAmount,
    (m) => m.otokogiAmount > 0,
  )
  if (shadow) {
    cards.push({
      kind: 'shadow-otokogi-king',
      icon: '🏆',
      title: '裏男気王',
      memberName: shadow.memberName,
      memberStyle: styleById.get(shadow.memberId) ?? null,
      subtitle: (
        <span className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
          <span className="text-[11px] text-slate-600">期待負担を超えた &quot;隠れた真の男気&quot;</span>
          <Yen value={shadow.otokogiAmount} size="base" className="font-bold text-slate-800 tabular-nums" />
        </span>
      ),
      color: 'rose',
      variant: 'secondary',
    })
  }

  // 3. 量産王 (payerCount 1 位)
  const count = pickMax(summaries, (m) => m.payerCount, (m) => m.payerCount > 0)
  if (count) {
    cards.push({
      kind: 'count-king',
      icon: '⚡',
      title: '量産王',
      memberName: count.memberName,
      memberStyle: styleById.get(count.memberId) ?? null,
      subtitle: (
        <span className="text-xs text-slate-700">
          男気発動数{' '}
          <span className="font-bold text-slate-900 tabular-nums">{count.payerCount}</span> 回
        </span>
      ),
      color: 'emerald',
      variant: 'secondary',
    })
  }

  // 4. 連勝王 (maxStreak >= BADGE_STREAK_MIN)
  const streakEntries = Array.from(streaksById.entries())
    .map(([memberId, maxStreak]) => ({ memberId, maxStreak }))
    .filter((e) => e.maxStreak >= BADGE_STREAK_MIN)
  const streakTop = streakEntries.reduce<{ memberId: string; maxStreak: number } | null>(
    (top, e) => (top === null || e.maxStreak > top.maxStreak ? e : top),
    null,
  )
  if (streakTop) {
    const style = styleById.get(streakTop.memberId)
    const summary = memberSummariesById.get(streakTop.memberId)
    cards.push({
      kind: 'streak-king',
      icon: '🔥',
      title: '連勝王',
      memberName: summary?.memberName ?? style?.name ?? '—',
      memberStyle: style ?? null,
      subtitle: (
        <span className="text-xs text-slate-700">
          連続男気{' '}
          <span className="font-bold text-slate-900 tabular-nums">{streakTop.maxStreak}</span> 連勝
        </span>
      ),
      color: 'red',
      variant: 'secondary',
    })
  }

  // 5. 気前度の帝王 (averagePaymentAmount 1 位 — payerCount > 0 のみ)
  const generosity = pickMax(
    summaries,
    (m) => m.averagePaymentAmount,
    (m) => m.payerCount > 0 && m.averagePaymentAmount > 0,
  )
  if (generosity) {
    cards.push({
      kind: 'generosity-emperor',
      icon: '👑',
      title: '気前度の帝王',
      memberName: generosity.memberName,
      memberStyle: styleById.get(generosity.memberId) ?? null,
      subtitle: (
        <span className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
          <span className="text-[11px] text-slate-600">1 回あたり平均</span>
          <Yen value={generosity.averagePaymentAmount} size="base" className="font-bold text-slate-800 tabular-nums" />
        </span>
      ),
      color: 'yellow',
      variant: 'secondary',
    })
  }

  // 6. じゃんけん神 (勝率 BADGE_JANKEN_RATE_MIN+ かつ 試合数 BADGE_JANKEN_GAMES_MIN+)
  const jankenTop = summaries.reduce<TitleMemberSummary | null>((top, m) => {
    if (m.jankenWinRate === null) return top
    if (m.jankenParticipationCount < BADGE_JANKEN_GAMES_MIN) return top
    if (m.jankenWinRate < BADGE_JANKEN_RATE_MIN) return top
    const topRate = top?.jankenWinRate ?? 0
    return top === null || m.jankenWinRate > topRate ? m : top
  }, null)
  if (jankenTop && jankenTop.jankenWinRate !== null) {
    const pct = Math.round(jankenTop.jankenWinRate * 100)
    cards.push({
      kind: 'janken-god',
      icon: '✊',
      title: 'じゃんけん神',
      memberName: jankenTop.memberName,
      memberStyle: styleById.get(jankenTop.memberId) ?? null,
      subtitle: (
        <span className="text-xs text-slate-700">
          勝率{' '}
          <span className="font-bold text-slate-900 tabular-nums">{pct}</span>%{' '}
          <span className="text-slate-500 tabular-nums">({jankenTop.jankenParticipationCount} 戦)</span>
        </span>
      ),
      color: 'indigo',
      variant: 'secondary',
    })
  }

  return cards
}

function pickMax<T>(
  items: T[],
  score: (m: T) => number,
  eligible: (m: T) => boolean,
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

function HeroCard({ card }: { card: TitleCard }) {
  const style = CARD_STYLES[card.color]
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-white border shadow-sm ring-2 ${style.ring}`}
    >
      {/* 上面バンド (brass gradient) */}
      <div className={`h-3 w-full ${style.band}`} aria-hidden />
      <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-5">
        {/* タイトル ブロック */}
        <div className="flex flex-col items-center shrink-0 w-14 sm:w-16">
          <span className="text-3xl sm:text-4xl leading-none select-none" aria-hidden>
            {card.icon}
          </span>
          <span className="mt-1 text-[10px] sm:text-[11px] font-bold text-amber-700 whitespace-nowrap">
            {card.title}
          </span>
        </div>

        {/* アバター */}
        {card.memberStyle && (
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-base sm:text-lg font-bold shrink-0 ${card.memberStyle.colorBg} ${card.memberStyle.colorText}`}
          >
            {card.memberStyle.initial}
          </div>
        )}

        {/* 名前 + サブタイトル */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 text-base sm:text-xl leading-tight break-words line-clamp-2">
            {card.memberName}
          </p>
          <div className="mt-1 text-sm text-slate-700">{card.subtitle}</div>
        </div>
      </div>
    </div>
  )
}

function SecondaryCard({ card }: { card: TitleCard }) {
  const style = CARD_STYLES[card.color]
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-white border shadow-sm ring-1 ${style.ring}`}
    >
      {/* 上面バンド */}
      <div className={`h-1.5 w-full ${style.band}`} aria-hidden />
      <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3">
        <div
          className={`flex flex-col items-center shrink-0 w-10 sm:w-12 rounded-md py-1 ${style.chipBg}`}
        >
          <span className="text-xl sm:text-2xl leading-none select-none" aria-hidden>
            {card.icon}
          </span>
        </div>
        {card.memberStyle && (
          <div
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ${card.memberStyle.colorBg} ${card.memberStyle.colorText}`}
          >
            {card.memberStyle.initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 leading-none mb-0.5 whitespace-nowrap">
            {card.title}
          </p>
          <p className="text-sm sm:text-base font-semibold text-slate-900 leading-tight break-words line-clamp-1">
            {card.memberName}
          </p>
          <div className="mt-0.5 leading-tight">{card.subtitle}</div>
        </div>
      </div>
    </div>
  )
}

export function RankingTitleCards(props: RankingTitleCardsProps) {
  const cards = buildCards(props)

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-4 sm:p-6 text-center">
        <p className="text-sm text-gray-500">期間内はまだ該当者なし</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          男気イベントを記録すると称号が自動で判定されます。
        </p>
      </div>
    )
  }

  const hero = cards.find((c) => c.variant === 'hero')
  const secondary = cards.filter((c) => c.variant === 'secondary')

  return (
    <div className="space-y-2.5 sm:space-y-3">
      {hero && <HeroCard card={hero} />}
      {secondary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
          {secondary.map((card) => (
            <SecondaryCard key={card.kind} card={card} />
          ))}
        </div>
      )}
    </div>
  )
}
