"use client"

import * as React from "react"
import { Info } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getTermDefinition } from "@/lib/term-definitions"
import { cn } from "@/lib/utils"

type TermTooltipProps = {
  // 辞書引きに使う用語キー (省略時は children がテキストならそれを使う)
  term?: string
  // 直接 definition を渡したい場合 (辞書に無い語をアドホックに説明するとき)
  definition?: string
  // 表示する要素 (バッジ、数値、ラベルなど何でも可)
  children: React.ReactNode
  // インライン表示の見た目を変えるためのラッパークラス
  className?: string
  // dotted 下線 + Info アイコンを付けない (既存バッジ等を trigger にしたいとき)
  bare?: boolean
}

/**
 * 用語ツールチップ (Issue #386)
 * - PC: ホバー 200ms で表示 (Radix UI デフォルト)
 * - モバイル: tap で表示 (Radix UI は touch で動作)
 * - 辞書 (lib/term-definitions.ts) に無く definition も渡されなければ素通し
 *
 * 使い方:
 *   <TermTooltip term="CLUTCH">★ CLUTCH</TermTooltip>
 *   <TermTooltip term="男気率">男気率</TermTooltip>
 *   <TermTooltip term="CLUTCH" bare><ClutchBadge .../></TermTooltip>
 */
export function TermTooltip({
  term,
  definition,
  children,
  className,
  bare = false,
}: TermTooltipProps) {
  const resolved =
    definition ??
    (term ? getTermDefinition(term) : undefined) ??
    (typeof children === "string" ? getTermDefinition(children) : undefined)

  if (!resolved) return <>{children}</>

  if (bare) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{children as React.ReactElement}</TooltipTrigger>
        <TooltipContent>{resolved}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          "inline-flex items-center gap-0.5 underline decoration-dotted decoration-slate-400 underline-offset-2 cursor-help",
          className
        )}
      >
        {children}
        <Info size={10} className="text-slate-400 shrink-0" aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{resolved}</TooltipContent>
    </Tooltip>
  )
}
