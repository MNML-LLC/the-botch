"use client";

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Yen } from '@/components/ui/yen';

type Props = {
  monthLabel: string;
  otokogiCount: number;
  otokogiTotal: number;
  warikanCount: number;
  warikanTotal: number;
};

export default function MonthlySummaryCollapsible({
  monthLabel,
  otokogiCount,
  otokogiTotal,
  warikanCount,
  warikanTotal,
}: Props) {
  const [open, setOpen] = useState(false);

  const totalAmount = otokogiTotal + warikanTotal;
  const totalCount = otokogiCount + warikanCount;
  const average = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0;

  return (
    <Card data-section="monthly-summary">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full"
          aria-expanded={open}
          aria-controls="monthly-summary-body"
        >
          <CardTitle className="text-slate-800 flex items-center gap-2">
            <span aria-hidden>📊</span>
            {monthLabel}サマリ
          </CardTitle>
          <span className="text-gray-400">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent id="monthly-summary-body" className="pt-0">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="男気 件数" value={`${otokogiCount}件`} />
            <StatTile label="男気 総額" value={<Yen value={otokogiTotal} size="sm" />} />
            <StatTile label="割り勘 件数" value={`${warikanCount}件`} />
            <StatTile label="割り勘 総額" value={<Yen value={warikanTotal} size="sm" />} />
            <StatTile label="合計" value={<Yen value={totalAmount} size="sm" />} />
            <StatTile label="1件平均" value={<Yen value={average} size="sm" />} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-sm font-bold text-slate-800 mt-1">{value}</p>
    </div>
  );
}
