"use client";

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { useMembers } from '@/hooks/use-members';
import {
  useOtokogiCharts,
  useOtokogiMemberSummary,
  useOtokogiStatsMain,
} from '@/hooks/use-otokogi';
import type { OtokogiCategory } from '@/lib/otokogi-category';
import {
  MonthMemberHeatmapSection,
  CategoryPieSection,
  CumulativeYearlySection,
  CumulativeRaceSection,
  ComparisonSection,
  TopRecentSection,
} from './charts';
import { Yen } from '@/components/ui/yen';
import { PeriodFilter, DEFAULT_PERIOD_STATE } from '@/components/ui/period-filter';
import { getPeriodRange, type PeriodState } from '@/lib/date-utils';

type Member = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

type OtokogiByMember = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
  otokogiAmount: number;
};

type StatsData = {
  monthlyTrend: { month: string; amount: number }[];
  otokogiByMember: OtokogiByMember[];
  totalCount: number;
  totalAmount: number;
  averageAmount: number;
  categoryBreakdown: { category: OtokogiCategory; amount: number; count: number }[];
  cumulativeRace: { month: string; [memberId: string]: string | number }[];
};

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

// ---- ユーティリティ ----

const fmt = new Intl.NumberFormat('ja-JP');

function formatYen(value: number): string {
  return `¥${fmt.format(Math.round(value))}`;
}

function formatYenShort(value: number): string {
  if (value >= 10000) return `${Math.round(value / 10000)}万`;
  return `¥${value.toLocaleString()}`;
}

function shortMonth(month: string): string {
  const [, m] = month.split('-');
  return `${parseInt(m)}月`;
}

function toIsoDate(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function computeDateRange(period: PeriodState): { from?: string; to?: string } {
  const r = getPeriodRange(period.period, new Date(), {
    from: period.from,
    to: period.to,
  });
  return { from: toIsoDate(r.from), to: toIsoDate(r.to) };
}

// ---- フィルタバー ----

function FilterBar({
  period,
  setPeriod,
  selectedMemberIds,
  setSelectedMemberIds,
  members,
  expanded,
  setExpanded,
}: {
  period: PeriodState;
  setPeriod: (p: PeriodState) => void;
  selectedMemberIds: string[];
  setSelectedMemberIds: (ids: string[]) => void;
  members: Member[];
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  const toggleMember = (id: string) => {
    setSelectedMemberIds(
      selectedMemberIds.includes(id)
        ? selectedMemberIds.filter((m) => m !== id)
        : [...selectedMemberIds, id],
    );
  };

  const isDefault = period.period === 'current-fy';

  return (
    <div className="sticky top-14 z-40 bg-white/95 backdrop-blur-sm border-b shadow-sm -mx-4 px-4">
      {/* SP: アコーディオントグル */}
      <button
        className="sm:hidden flex items-center justify-between w-full py-2 text-sm text-gray-600"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span className="font-medium">
          フィルタ
          {(selectedMemberIds.length > 0 || !isDefault) && (
            <span className="ml-1.5 text-xs text-amber-600">●</span>
          )}
        </span>
        <span className="text-xs text-gray-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* フィルタ本体 (SP: 折りたたみ、PC: 常時表示) */}
      <div className={`${expanded ? 'block' : 'hidden'} sm:block pb-2 sm:py-2`}>
        <div className="sm:flex sm:items-center sm:flex-wrap sm:gap-x-4 sm:gap-y-2 space-y-2 sm:space-y-0">
          {/* 期間プリセット */}
          <PeriodFilter value={period} onChange={setPeriod} accent="otokogi" />

          {/* メンバー絞り込み */}
          {members.length > 0 && (
            <div className="flex gap-1 flex-wrap items-center">
              {members.map((member) => {
                const selected = selectedMemberIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleMember(member.id)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border transition ${
                      selected
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-slate-400'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                        selected ? 'bg-white/20' : `${member.colorBg} ${member.colorText}`
                      }`}
                    >
                      {member.initial}
                    </div>
                    {member.name}
                  </button>
                );
              })}
              {selectedMemberIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedMemberIds([])}
                  className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 rounded-full border border-transparent hover:border-gray-200"
                >
                  クリア
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- メンバー別収支表 ----

const BALANCE_METRICS: { label: string; key: keyof MemberSummaryEntry; format: (v: number) => string }[] = [
  { label: '参加回数', key: 'participationCount', format: (v) => fmt.format(v) },
  { label: '支払回数', key: 'payerCount', format: (v) => fmt.format(v) },
  { label: '実際払った額', key: 'actualPaid', format: formatYen },
  { label: '本来払うべき額', key: 'shouldHavePaid', format: formatYen },
  { label: '漢気金額', key: 'otokogiAmount', format: formatYen },
  { label: '平均支払単価', key: 'averagePaymentAmount', format: formatYen },
  { label: '★ CLUTCH回数', key: 'clutchCount', format: (v) => fmt.format(v) },
  { label: '★ CLUTCH総額', key: 'clutchTotal', format: formatYen },
];

function MemberBalanceSection({
  from,
  to,
  memberIds,
}: {
  from?: string;
  to?: string;
  memberIds: string[];
}) {
  const { data, isFetching } = useOtokogiMemberSummary<{ members: MemberSummaryEntry[] }>(
    from,
    to,
    memberIds
  );

  const members = data?.members ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-slate-800">メンバー別収支</CardTitle>
          {isFetching && <span className="text-xs text-gray-400">更新中...</span>}
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 && !isFetching ? (
          <p className="text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="text-xs w-full border-collapse min-w-max">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="sticky left-0 z-10 bg-white text-left p-2 font-medium text-gray-500 whitespace-nowrap min-w-[110px]">
                    指標
                  </th>
                  {members.map((m) => (
                    <th key={m.memberId} className="p-2 text-center font-medium text-slate-800 whitespace-nowrap min-w-[76px]">
                      {m.memberName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BALANCE_METRICS.map((metric) => (
                  <tr key={metric.label} className="border-b border-gray-100 last:border-0">
                    <td className="sticky left-0 z-10 bg-white p-2 text-gray-600 whitespace-nowrap font-medium">
                      {metric.label}
                    </td>
                    {members.map((m) => {
                      const raw = m[metric.key] as number;
                      const isOtokogi = metric.key === 'otokogiAmount';
                      return (
                        <td key={m.memberId} className="p-2 text-center whitespace-nowrap">
                          {isOtokogi ? (
                            <span className={raw > 0 ? 'font-semibold text-green-600' : raw < 0 ? 'font-semibold text-red-500' : 'text-gray-500'}>
                              {raw >= 0 ? '+' : ''}
                              {metric.format(raw)}
                            </span>
                          ) : (
                            <span className="text-slate-800">{metric.format(raw)}</span>
                          )}
                        </td>
                      );
                    })}
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

// ---- 月別推移グラフ ----

function MonthlyTrendSection({ data }: { data?: { month: string; amount: number }[] }) {
  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">月別推移</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full h-48 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <XAxis
                dataKey="month"
                tickFormatter={shortMonth}
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={formatYenShort}
                tick={{ fontSize: 10 }}
                width={40}
              />
              <Tooltip
                formatter={(value) => [`¥${Number(value).toLocaleString()}`, '支払額']}
                labelFormatter={(label) => {
                  const [y, m] = String(label).split('-');
                  return `${y}年${parseInt(m)}月`;
                }}
              />
              <Bar dataKey="amount" fill="#d97706" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- 漢気ランキング（横棒チャート） ----

function RankingSection({ data }: { data?: OtokogiByMember[] }) {
  if (!data || data.length === 0) return null;

  const chartData = data
    .filter((m) => m.otokogiAmount > 0)
    .map((m, i) => ({
      name: m.name,
      amount: m.otokogiAmount,
      fill: i === 0 ? '#d97706' : i === 1 ? '#94a3b8' : i === 2 ? '#c2410c' : '#94a3b8',
    }));

  if (chartData.length === 0) return null;

  const barHeight = 36;
  const chartHeight = Math.max(chartData.length * barHeight + 20, 120);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">漢気ランキング</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">支払額 × (参加人数−1) ÷ 参加人数 の累計</p>
      </CardHeader>
      <CardContent>
        <div className="w-full" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 60, left: 4, bottom: 4 }}
            >
              <XAxis type="number" tickFormatter={formatYenShort} tick={{ fontSize: 10 }} />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 11 }}
                width={48}
              />
              <Tooltip
                formatter={(value) => [`¥${Number(value).toLocaleString()}`, '漢気金額']}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
                <LabelList
                  dataKey="amount"
                  position="right"
                  formatter={(v) => (typeof v === 'number' ? formatYenShort(v) : '')}
                  style={{ fontSize: 10, fill: '#64748b' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- メインページ ----

export default function OtokogiStatsPage() {
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD_STATE);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [filterExpanded, setFilterExpanded] = useState(false);

  // 期間から from/to を計算
  const { from, to } = useMemo(
    () => computeDateRange(period),
    [period],
  );

  // メンバー一覧（フィルタバー用）
  const { data: membersData } = useMembers({ staleTime: 5 * 60 * 1000 });
  const members: Member[] = membersData ?? [];

  const { data: stats, isFetching: statsFetching } = useOtokogiStatsMain<StatsData>(
    from,
    to,
    selectedMemberIds
  );

  // 新チャート用データ（期間フィルタ対応, Issue #357）
  const { data: charts } = useOtokogiCharts(from, to, selectedMemberIds);
  const chartsThisYearLabel = charts?.anchorYear ?? new Date().getFullYear();

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-slate-800">男気統計</h2>
        <Link href="/otokogi" className="text-xs text-gray-500 hover:text-slate-700">
          ← 一覧に戻る
        </Link>
      </div>

      {/* フィルタバー（sticky） */}
      <FilterBar
        period={period}
        setPeriod={setPeriod}
        selectedMemberIds={selectedMemberIds}
        setSelectedMemberIds={setSelectedMemberIds}
        members={members}
        expanded={filterExpanded}
        setExpanded={setFilterExpanded}
      />

      {/* 概要バッジ */}
      {stats && (
        <div className="flex gap-3 py-3 mt-1 text-center">
          <div className="flex-1">
            <p className="text-lg font-bold text-slate-800">{stats.totalCount}</p>
            <p className="text-[10px] text-gray-500">総回数</p>
          </div>
          <div className="flex-1 min-w-0">
            <Yen value={stats.totalAmount} size="sm" className="font-bold text-slate-800 tabular-nums block tracking-tight" />
            <p className="text-[10px] text-gray-500">累計金額</p>
          </div>
          <div className="flex-1 min-w-0">
            <Yen value={stats.averageAmount} size="sm" className="font-bold text-slate-800 tabular-nums block tracking-tight" />
            <p className="text-[10px] text-gray-500">平均金額</p>
          </div>
        </div>
      )}
      {!stats && statsFetching && (
        <p className="text-sm text-gray-500 py-4">読み込み中...</p>
      )}

      {/* グラフ（縦スタック、モバイル縦スクロール最適化） */}
      <div className="space-y-4">
        {/* 1. メンバー別収支表 */}
        <MemberBalanceSection
          from={from}
          to={to}
          memberIds={selectedMemberIds}
        />

        {/* 2. 月別推移（既存） */}
        <MonthlyTrendSection data={stats?.monthlyTrend} />

        {/* 3. 漢気ランキング（既存） */}
        <RankingSection data={stats?.otokogiByMember} />

        {/* 4. 月 × メンバー ヒートマップ (Issue #366, design review Phase 2)
            log amber-100〜900 の離散スケールで桁差を可視化。期間フィルタ連動 */}
        <MonthMemberHeatmapSection data={charts?.monthMemberHeatmap} />

        {/* 5. カテゴリ別支払分布 */}
        <CategoryPieSection data={stats?.categoryBreakdown} />

        {/* 6. 累積折れ線（今年 / 昨年 / 一昨年、固定） */}
        <CumulativeYearlySection data={charts?.cumulativeYearly} thisYearLabel={chartsThisYearLabel} />

        {/* 7. 累積レース（メンバー別、期間フィルタ連動 / Issue #365） */}
        <CumulativeRaceSection data={stats?.cumulativeRace} members={members} />

        {/* 8. 比較棒グラフ（今月vs先月 / 今年vs昨年、固定） */}
        <ComparisonSection data={charts?.comparison} />

        {/* 9. Top 3 カード（直近 3ヶ月、固定） */}
        <TopRecentSection data={charts?.topRecent} />
      </div>
    </div>
  );
}
