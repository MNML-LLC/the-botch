"use client";

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOtokogiMemberSummary } from '@/hooks/use-otokogi';
import { TermTooltip } from '@/components/ui/term-tooltip';

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
  clutchCount: number;
  clutchTotal: number;
  clutchRate: number;
};

type MemberSummaryData = {
  members: MemberSummaryEntry[];
  hasJankenData: boolean;
};

// Issue #393: じゃんけん勝率列は hasJankenData=false でも常に表示
// (記録なしなら "—" で明示。UI 実装はあるが列ごと非表示 → CEO が機能を知らない状態を解消)
const JANKEN_NO_DATA_HINT =
  '現在じゃんけん記録なし。新規男気追加時に「じゃんけんで決めた」を選ぶと勝率が計算されます。';

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
  key: string;
  label: ReactNode;
  render: (m: MemberSummaryEntry) => ReactNode;
};

function buildMetrics(): MetricDef[] {
  const metrics: MetricDef[] = [
    {
      key: 'participationCount',
      label: '参加回数',
      render: (m) => fmt.format(m.participationCount),
    },
    {
      key: 'payerCount',
      label: '支払者になった回数',
      render: (m) => fmt.format(m.payerCount),
    },
    {
      key: 'payerRate',
      label: '支払者率',
      render: (m) => formatPercent(m.payerRate),
    },
    {
      key: 'actualPaid',
      label: '実際払った額',
      render: (m) => formatYen(m.actualPaid),
    },
    {
      key: 'shouldHavePaid',
      label: '本来払うべき額',
      render: (m) => formatYen(m.shouldHavePaid),
    },
    {
      key: 'otokogiAmount',
      label: <TermTooltip term="男気">漢気金額</TermTooltip>,
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
      key: 'averagePaymentAmount',
      label: <TermTooltip term="気前度">平均支払単価</TermTooltip>,
      render: (m) => (m.payerCount > 0 ? formatYen(m.averagePaymentAmount) : '—'),
    },
    {
      key: 'maxSingleOtokogi',
      label: '最高単発漢気',
      render: (m) => (m.payerCount > 0 ? formatYen(m.maxSingleOtokogi) : '—'),
    },
    {
      key: 'clutchCount',
      label: <TermTooltip term="CLUTCH">★ CLUTCH回数</TermTooltip>,
      render: (m) => fmt.format(m.clutchCount),
    },
    {
      key: 'clutchTotal',
      label: <TermTooltip term="CLUTCH">★ CLUTCH総額</TermTooltip>,
      render: (m) => (m.clutchCount > 0 ? formatYen(m.clutchTotal) : '—'),
    },
    {
      key: 'clutchRate',
      label: <TermTooltip term="CLUTCH">クラッチ率</TermTooltip>,
      render: (m) => (m.payerCount > 0 ? formatPercent(m.clutchRate) : '—'),
    },
  ];

  // Issue #393: じゃんけん勝率列は常に表示 (記録なしなら "—")
  metrics.push({
    key: 'jankenWinRate',
    label: <TermTooltip term="じゃんけん勝率">じゃんけん勝率</TermTooltip>,
    render: (m) => (m.jankenWinRate !== null ? formatPercent(m.jankenWinRate) : '—'),
  });

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

  const { data, isFetching } = useOtokogiMemberSummary<MemberSummaryData>(from, to);

  const metrics = buildMetrics();
  const members = data?.members ?? [];
  const hasJankenData = data?.hasJankenData ?? false;

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
                  <tr key={metric.key} className="border-b border-gray-100 last:border-0">
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
            {!hasJankenData && members.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-2 px-2">
                ※ じゃんけん勝率: {JANKEN_NO_DATA_HINT}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
