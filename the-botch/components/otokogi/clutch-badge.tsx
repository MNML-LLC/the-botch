import { CLUTCH_THRESHOLD } from '@/lib/constants'

type ClutchBadgeProps = {
  amount: number
  size?: 'xs' | 'sm'
  className?: string
}

// ¥50,000 以上の男気を強調する CLUTCH バッジ (CEO ルール / Issue #354)
// amount が閾値未満のときは何も描画しない (呼び出し側で条件分岐を書かずに済む)
export function ClutchBadge({ amount, size = 'xs', className = '' }: ClutchBadgeProps) {
  if (amount < CLUTCH_THRESHOLD) return null

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5'

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${sizeClass} font-bold rounded bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-sm ${className}`}
      title={`¥${CLUTCH_THRESHOLD.toLocaleString()} 以上のクラッチ男気`}
      aria-label="CLUTCH"
    >
      ★ CLUTCH
    </span>
  )
}
