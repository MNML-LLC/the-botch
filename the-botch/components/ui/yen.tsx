import { cn } from '@/lib/utils'

type YenSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl'

const SIZE_CLASS: Record<YenSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
}

export interface YenProps {
  value: number
  size?: YenSize
  className?: string
  /** 符号つきで表示する（例: +¥1,000 / -¥500） */
  signed?: boolean
}

/**
 * 金額表示コンポーネント
 * - `¥` 記号 + 3桁区切り + `tabular-nums` で桁揃え
 * - 数値が `NaN` / 非有限値のときは `¥-` を描画
 */
export function Yen({ value, size = 'base', className, signed = false }: YenProps) {
  const safe = Number.isFinite(value) ? value : 0
  const abs = Math.abs(safe)
  const sign = signed && safe > 0 ? '+' : safe < 0 ? '-' : ''
  if (!Number.isFinite(value)) {
    return (
      <span className={cn('tabular-nums', SIZE_CLASS[size], className)}>¥-</span>
    )
  }
  return (
    <span className={cn('tabular-nums', SIZE_CLASS[size], className)}>
      {sign}¥{abs.toLocaleString('ja-JP')}
    </span>
  )
}
