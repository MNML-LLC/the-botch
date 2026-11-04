import type { Badge } from '@/lib/otokogi-badges'

type BadgeChipProps = {
  badge: Badge
  size?: 'xs' | 'sm' | 'md'
  className?: string
  // true: アイコンのみ表示 (ランキング行末などの省スペース用)
  iconOnly?: boolean
}

// 男気称号のバッジチップ (Issue #368)
// Phase 3 で /members/[id] / /otokogi / /otokogi/stats 共通利用
export function BadgeChip({ badge, size = 'sm', className = '', iconOnly = false }: BadgeChipProps) {
  const sizeClass =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5 gap-0.5'
      : size === 'md'
        ? 'text-sm px-2.5 py-1 gap-1'
        : 'text-xs px-2 py-0.5 gap-1'

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium shadow-sm ${badge.color} ${sizeClass} ${className}`}
      title={badge.description}
      aria-label={badge.label}
    >
      <span aria-hidden>{badge.icon}</span>
      {!iconOnly && <span>{badge.label}</span>}
    </span>
  )
}
