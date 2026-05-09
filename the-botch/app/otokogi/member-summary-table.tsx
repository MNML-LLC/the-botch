"use client";

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type MemberSummaryEntry = {
  memberId: string;
  memberName: string;
  participationCount: number;
  payerCount: number;
  payerRate: number;
  actualPaid: number;
  shouldHavePaid: number;
  otokogiAmount: number;
  averagePaymentAmount: number;
  maxSingleOtokogi: number;
  jankenWinRate: number | null;
};

type MemberSummaryData = {
  members: MemberSummaryEntry[];
  hasJankenData: boolean;
};

type PeriodFilter = 'all' | 'month' | 'year' | 'custom';

function getPeriodDates(
  filter: PeriodFilter,
  customFrom: string,
  customTo: string
): { from?: string; to?: string } {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  if (filter === 'month') {
    const from = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
    return { from, to: todayStr };
  }
  if (filter === 'year') {
    const y = today.getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  if (filter === 'custom') {
    return {
      from: customFrom || undefined,
      to: customTo || undefined,
    };
  }
  return {};
}

const fmt = new Intl.NumberFormat('ja-JP');

function formatYen(value: number): string {
  return `¥${fmt.format(Math.round(value))}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

type MetricDef = {
  label: string;
  render: (m: MemberSummaryEntry) => ReactNode;
};

function buildMetrics(hasJankenData: boolean): MetricDef[] {
  const metrics: MetricDef[] = [
    {
      label: '参加回数',
      render: (m) => fmt.format(m.participationCount),
    },
    {
      label: '支払者になった回数',
      render: (m) => fmt.format(m.payerCount),
    },
    {
      label: '支払者率',
      render: (m) => formatPercent(m.payerRate),
    },
    {
      label: '実際払った額',
      render: (m) => formatYen(m.actualPaid),
    },
    {
      label: '本来払うべき額',
      render: (m) => formatYen(m.shouldHavePaid),
    },
    {
      label: '漢気金額',
      render: (m) => (
        <span
          className={
            m.otokogiAmount > 0
              ? 'font-semibold text-green-600'
              : m.otokogiAmount < 0
                ? 'font-semibold text-red-500'
                : 'text-gray-500'
          }
        >
          {m.otokogiAmount >= 0 ? '+' : ''}
          {formatYen(m.otokogiAmount)}
        </span>
      ),
    },
    {
      label: '平均支払単価',
      render: (m) => (m.payerCount > 0 ? formatYen(m.averagePaymentAmount) : '—'),
    },
    {
      label: '最高単発漢気',
      render: (m) => (m.payerCount > 0 ? formatYen(m.maxSingleOtokogi) : '—'),
    },
  ];

  if (hasJankenData) {
    metrics.push({
      label: 'じゃんけん勝率',
      render: (m) => (m.jankenWinRate !== null ? formatPercent(m.jankenWinRate) : '—'),
    });
  }

  return metrics;
}

const PERIOD_LABELS: { key: PeriodFilter; label: string }[] = [
  { key: 'all', label: '全期間' },
  { key: 'month', label: '今月' },
  { key: 'year', label: '今年' },
  { key: 'custom', label: 'カスタム' },
];

export default function MemberSummaryTable() {
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from, to } = getPeriodDates(period, customFrom, customTo);

  const { data, isFetching } = useQuery({
    queryKey: ['otokogi-member-summary', from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/otokogi/member-summary?${params.toString()}`);
      if (!res.ok) throw new Error('収支分析データの取得に失敗しました');
      return res.json() as Promise<MemberSummaryData>;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const metrics = buildMetrics(data?.hasJankenData ?? false);
  const members = data?.members ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">収支分析</CardTitle>
      </CardHeader>
      <CardContent>
        {/* 期間フィルター */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {PERIOD_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1 text-xs rounded-full border transition ${
                period === key
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2 mb-4">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="text-xs h-8 w-36"
            />
            <span className="text-gray-400 text-xs">〜</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="text-xs h-8 w-36"
            />
          </div>
        )}

        {isFetching && (
          <p className="text-xs text-gray-400 mb-2">読み込み中...</p>
        )}

        {members.length === 0 && !isFetching ? (
          <p className="text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="text-xs w-full border-collapse min-w-max">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="sticky left-0 z-10 bg-white text-left p-2 font-medium text-gray-500 whitespace-nowrap min-w-[120px]">
                    指標
                  </th>
                  {members.map((m) => (
                    <th
                      key={m.memberId}
                      className="p-2 text-center font-medium text-slate-800 whitespace-nowrap min-w-[80px]"
                    >
                      {m.memberName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={metric.label} className="border-b border-gray-100 last:border-0">
                    <td className="sticky left-0 z-10 bg-white p-2 text-gray-600 whitespace-nowrap font-medium">
                      {metric.label}
                    </td>
                    {members.map((m) => (
                      <td key={m.memberId} className="p-2 text-center text-slate-800 whitespace-nowrap">
                        {metric.render(m)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
