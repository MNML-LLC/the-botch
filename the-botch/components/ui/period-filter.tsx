"use client";

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { PeriodValue, PeriodState } from '@/lib/date-utils';
import { Input } from '@/components/ui/input';

export const PERIOD_OPTIONS: { value: PeriodValue; label: string }[] = [
  { value: 'current-month', label: '今月' },
  { value: 'current-fy', label: '今期' },
  { value: 'last-fy', label: '前期' },
  { value: 'all', label: '全期間' },
];

export type PeriodFilterAccent = 'otokogi' | 'warikan' | 'slate';

// Phase 0 semantic palette aware (otokogi = brass/amber-700, warikan = blue-800)
const ACCENT_CLASSES: Record<PeriodFilterAccent, { active: string; focus: string }> = {
  otokogi: {
    active: 'bg-amber-700 text-white border-amber-700 hover:bg-amber-700',
    focus: 'focus-visible:ring-amber-700',
  },
  warikan: {
    active: 'bg-blue-800 text-white border-blue-800 hover:bg-blue-800',
    focus: 'focus-visible:ring-blue-800',
  },
  slate: {
    active: 'bg-slate-800 text-white border-slate-800 hover:bg-slate-800',
    focus: 'focus-visible:ring-slate-800',
  },
};

export interface PeriodFilterProps {
  value: PeriodState;
  onChange: (value: PeriodState) => void;
  accent?: PeriodFilterAccent;
  className?: string;
  /** 非表示にするボタン（デフォルトは全表示） */
  hide?: PeriodValue[];
  /** カスタム範囲ボタンを表示するか（デフォルト true） */
  enableCustom?: boolean;
  /** 右側に追加の UI を差し込みたいとき（ドロップダウン等） */
  trailing?: React.ReactNode;
}

/**
 * 期間フィルタ Segmented Button
 * - 「今月 / 今期 / 前期 / 全期間」を常設表示
 * - カスタム範囲は選択時に date input 2 本を表示
 * - タップ領域 44px 以上、横スクロール可（375px でも崩れない）
 */
export function PeriodFilter({
  value,
  onChange,
  accent = 'slate',
  className,
  hide = [],
  enableCustom = true,
  trailing,
}: PeriodFilterProps) {
  const accentCls = ACCENT_CLASSES[accent];
  const visible = PERIOD_OPTIONS.filter((o) => !hide.includes(o.value));

  const buttonBase =
    'inline-flex items-center justify-center min-h-[44px] min-w-[64px] px-3 py-2 ' +
    'text-sm font-medium rounded-md border shrink-0 snap-start transition ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';

  const handleCustomChange = (field: 'from' | 'to', v: string) => {
    onChange({
      period: 'custom',
      from: field === 'from' ? v : value.from,
      to: field === 'to' ? v : value.to,
    });
  };

  const activeIsCustom = value.period === 'custom';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        className,
      )}
    >
      <div
        className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 snap-x snap-mandatory"
        role="tablist"
        aria-label="期間フィルタ"
      >
        {visible.map((opt) => {
          const active = opt.value === value.period;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange({ period: opt.value })}
              className={cn(
                buttonBase,
                accentCls.focus,
                active
                  ? accentCls.active
                  : 'bg-white text-gray-700 border-gray-300 hover:border-slate-400',
              )}
            >
              {opt.label}
            </button>
          );
        })}
        {enableCustom && (
          <button
            key="custom"
            type="button"
            role="tab"
            aria-selected={activeIsCustom}
            onClick={() =>
              onChange({ period: 'custom', from: value.from, to: value.to })
            }
            className={cn(
              buttonBase,
              accentCls.focus,
              activeIsCustom
                ? accentCls.active
                : 'bg-white text-gray-700 border-gray-300 hover:border-slate-400',
            )}
          >
            カスタム
          </button>
        )}
        {trailing}
      </div>

      {activeIsCustom && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={value.from ?? ''}
            onChange={(e) => handleCustomChange('from', e.target.value)}
            className="h-10 min-h-[44px] text-sm w-40"
            aria-label="開始日"
          />
          <span className="text-gray-400 text-sm">〜</span>
          <Input
            type="date"
            value={value.to ?? ''}
            onChange={(e) => handleCustomChange('to', e.target.value)}
            className="h-10 min-h-[44px] text-sm w-40"
            aria-label="終了日"
          />
        </div>
      )}
    </div>
  );
}

/**
 * 期間フィルタ初期値（CEO 決定: デフォルトは「今期」）
 */
export const DEFAULT_PERIOD_STATE: PeriodState = { period: 'current-fy' };
