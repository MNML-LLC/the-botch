import { CLUTCH_THRESHOLD } from '@/lib/constants'
import { TermTooltip } from '@/components/ui/term-tooltip'

type ClutchBadgeProps = {
  amount: number
  size?: 'xs' | 'sm'
  className?: string
}

// ¥50,000 以上の男気を強調する CLUTCH バッジ (CEO ルール / Issue #354)
// amount が閾値未満のときは何も描画しない (呼び出し側で条件分岐を書かずに済む)
// hover で用語定義を表示 (Issue #386)
export function ClutchBadge({ amount, size = 'xs', className = '' }: ClutchBadgeProps) {
  if (amount < CLUTCH_THRESHOLD) return null

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5'

  return (
    <TermTooltip term="CLUTCH" bare>
      <span
        className={`inline-flex items-center gap-0.5 ${sizeClass} font-bold rounded bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-sm cursor-help ${className}`}
        aria-label="CLUTCH"
      >
        ★ CLUTCH
      </span>
    </TermTooltip>
  )
}
