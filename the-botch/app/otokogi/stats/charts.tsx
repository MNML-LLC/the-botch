"use client";

// Issue #336: 追加 5 グラフ
//  A. ヒートマップ（メンバー × 月、HTML+CSS 実装）
//  B. 円グラフ（イベント種別別の支払分布）
//  C. 累積折れ線（今年 / 昨年 / 一昨年）
//  D. 比較棒グラフ（今月 vs 先月 / 今年 vs 昨年、メンバー別積み上げ）
//  E. Top 3 カード（直近 3ヶ月 最高額）

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
} from 'recharts';
import { CATEGORY_LABELS, CATEGORY_COLORS, type OtokogiCategory } from '@/lib/otokogi-category';
import type { OtokogiChartsResponse } from '@/hooks/use-otokogi';
import { Yen } from '@/components/ui/yen';

// ---- 共通 ----

const fmt = new Intl.NumberFormat('ja-JP');

function formatYen(value: number): string {
  return `¥${fmt.format(Math.round(value))}`;
}

function formatYenShort(value: number): string {
  if (value >= 10000) return `${Math.round(value / 10000)}万`;
  return `¥${value.toLocaleString()}`;
}

function shortMonthLabel(month: string): string {
  const [, m] = month.split('-');
  return `${parseInt(m)}月`;
}

// A/B/C/D/E で共有する軽量メンバー型（avatar 表示用）
type MinimalMember = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

function Avatar({ member, size = 'sm' }: { member: MinimalMember; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  };
  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${sizes[size]} ${member.colorBg} ${member.colorText}`}
    >
      {member.initial}
    </div>
  );
}

// ============================================================
// A. ヒートマップ（メンバー × 月、HTML+CSS）
// ============================================================
export function HeatmapSection({ data }: { data?: OtokogiChartsResponse['heatmap'] }) {
  if (!data) return null;

  // 最大値（濃淡スケール用）
  const maxAmount = Math.max(...data.cells.map((c) => c.amount), 0);

  // メンバー別支払合計で降順（0 だけのメンバーは下に）
  const memberTotals = new Map<string, number>();
  for (const cell of data.cells) {
    memberTotals.set(cell.memberId, (memberTotals.get(cell.memberId) ?? 0) + cell.amount);
  }
  const sortedMembers = [...data.members].sort(
    (a, b) => (memberTotals.get(b.id) ?? 0) - (memberTotals.get(a.id) ?? 0)
  );

  // (month, memberId) → amount の lookup
  const cellMap = new Map<string, number>();
  for (const cell of data.cells) {
    cellMap.set(`${cell.month}:${cell.memberId}`, cell.amount);
  }

  function cellColor(amount: number): { bg: string; text: string } {
    if (amount === 0 || maxAmount === 0) {
      return { bg: 'rgb(248, 250, 252)', text: 'rgb(203, 213, 225)' };
    }
    const ratio = Math.min(amount / maxAmount, 1);
    // #d97706 (amber-600) のグラデーション: 透明度 0.08 〜 1.0
    const alpha = 0.1 + ratio * 0.9;
    return {
      bg: `rgba(217, 119, 6, ${alpha})`,
      text: ratio > 0.5 ? 'white' : '#78350f',
    };
  }

  const noData = maxAmount === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">ヒートマップ</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          直近 12ヶ月のメンバー × 月の支払額（濃いほど多い）
        </p>
      </CardHeader>
      <CardContent>
        {noData ? (
          <p className="text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="text-xs border-collapse" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white p-1.5 text-left font-medium text-gray-500 whitespace-nowrap min-w-[72px]">
                    メンバー
                  </th>
                  {data.months.map((m) => (
                    <th
                      key={m}
                      className="p-1 text-center font-medium text-gray-500 whitespace-nowrap"
                      style={{ minWidth: 36, width: 36 }}
                    >
                      {shortMonthLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((member) => (
                  <tr key={member.id}>
                    <td className="sticky left-0 z-10 bg-white p-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Avatar member={member} size="sm" />
                        <span className="text-slate-800">{member.name}</span>
                      </div>
                    </td>
                    {data.months.map((m) => {
                      const amount = cellMap.get(`${m}:${member.id}`) ?? 0;
                      const { bg, text } = cellColor(amount);
                      return (
                        <td
                          key={m}
                          className="p-0 text-center"
                          style={{ width: 36, height: 32 }}
                          title={`${member.name} ${shortMonthLabel(m)}: ${formatYen(amount)}`}
                        >
                          <div
                            className="w-full h-full flex items-center justify-center rounded"
                            style={{
                              backgroundColor: bg,
                              color: text,
                              fontSize: 9,
                              fontWeight: amount > 0 ? 600 : 400,
                            }}
                          >
                            {amount > 0 ? formatYenShort(amount) : ''}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-400 mt-2 pl-1">
              横スクロールで全月表示 / 各セルの数値 = その月の支払額合計
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// A2. 月 × メンバー ヒートマップ (Issue #366, design review Phase 2)
// log スケール + Tailwind amber-100 〜 amber-900 の 9 段階離散色
// ============================================================

// Tailwind amber-100 〜 amber-900 の実色 (background) と、
// 階調ごとに読みやすい前景色。
const AMBER_SCALE: { bg: string; text: string }[] = [
  { bg: '#fef3c7', text: '#78350f' }, // amber-100
  { bg: '#fde68a', text: '#78350f' }, // amber-200
  { bg: '#fcd34d', text: '#78350f' }, // amber-300
  { bg: '#fbbf24', text: '#78350f' }, // amber-400
  { bg: '#f59e0b', text: '#1f2937' }, // amber-500
  { bg: '#d97706', text: '#ffffff' }, // amber-600
  { bg: '#b45309', text: '#ffffff' }, // amber-700
  { bg: '#92400e', text: '#ffffff' }, // amber-800
  { bg: '#78350f', text: '#ffffff' }, // amber-900
];
const EMPTY_CELL = { bg: 'rgb(248, 250, 252)', text: 'rgb(203, 213, 225)' };

// amount と maxAmount から log 正規化で 0〜8 のバケットを返す。
// amount=0 は -1 (空セル扱い)。
function logBucket(amount: number, maxAmount: number): number {
  if (amount <= 0 || maxAmount <= 0) return -1;
  // log(x+1) / log(max+1) ∈ (0, 1]
  const ratio = Math.log(amount + 1) / Math.log(maxAmount + 1);
  const idx = Math.min(
    AMBER_SCALE.length - 1,
    Math.max(0, Math.floor(ratio * AMBER_SCALE.length)),
  );
  return idx;
}

export function MonthMemberHeatmapSection({
  data,
}: {
  data?: OtokogiChartsResponse['monthMemberHeatmap'];
}) {
  if (!data) return null;

  // メンバー別支払合計で降順（0 だけのメンバーは下に）
  const memberTotals = new Map<string, number>();
  for (const cell of data.cells) {
    memberTotals.set(cell.memberId, (memberTotals.get(cell.memberId) ?? 0) + cell.amount);
  }
  const sortedMembers = [...data.members].sort(
    (a, b) => (memberTotals.get(b.id) ?? 0) - (memberTotals.get(a.id) ?? 0)
  );

  // (month, memberId) → amount
  const cellMap = new Map<string, number>();
  for (const cell of data.cells) {
    cellMap.set(`${cell.month}:${cell.memberId}`, cell.amount);
  }

  const noData = data.maxAmount <= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">月 × メンバー ヒートマップ</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          期間内の月ごとのメンバー別支払額（log スケール, 濃いほど多い）
        </p>
      </CardHeader>
      <CardContent>
        {noData ? (
          <p className="text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="text-xs border-collapse" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white p-1.5 text-left font-medium text-gray-500 whitespace-nowrap min-w-[72px]">
                    メンバー
                  </th>
                  {data.months.map((m) => (
                    <th
                      key={m}
                      className="p-1 text-center font-medium text-gray-500 whitespace-nowrap"
                      style={{ minWidth: 36, width: 36 }}
                    >
                      {shortMonthLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((member) => (
                  <tr key={member.id}>
                    <td className="sticky left-0 z-10 bg-white p-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Avatar member={member} size="sm" />
                        <span className="text-slate-800">{member.name}</span>
                      </div>
                    </td>
                    {data.months.map((m) => {
                      const amount = cellMap.get(`${m}:${member.id}`) ?? 0;
                      const bucket = logBucket(amount, data.maxAmount);
                      const { bg, text } = bucket < 0 ? EMPTY_CELL : AMBER_SCALE[bucket];
                      return (
                        <td
                          key={m}
                          className="p-0 text-center"
                          style={{ width: 36, height: 32 }}
                          title={`${member.name} ${shortMonthLabel(m)}: ${formatYen(amount)}`}
                        >
                          <div
                            className="w-full h-full flex items-center justify-center rounded"
                            style={{
                              backgroundColor: bg,
                              color: text,
                              fontSize: 9,
                              fontWeight: amount > 0 ? 600 : 400,
                            }}
                          >
                            {amount > 0 ? formatYenShort(amount) : ''}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* 凡例: amber の 9 段階 (log スケール) */}
            <div className="flex items-center gap-2 mt-3 pl-1">
              <span className="text-[10px] text-gray-500">少</span>
              <div className="flex gap-0.5">
                {AMBER_SCALE.map((c, i) => (
                  <span
                    key={i}
                    className="inline-block w-4 h-3 rounded-sm"
                    style={{ backgroundColor: c.bg }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-gray-500">多</span>
              <span className="text-[10px] text-gray-400 ml-auto">
                最大 {formatYen(data.maxAmount)}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 pl-1">
              横スクロールで全月表示 / セル hover で詳細金額 / log スケールで桁差を可視化
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// B. 円グラフ（イベント種別別の支払分布）
// ============================================================
type CategoryEntry = { category: OtokogiCategory; amount: number; count: number };

export function CategoryPieSection({ data }: { data?: CategoryEntry[] }) {
  if (!data) return null;
  const filtered = data.filter((c) => c.amount > 0);
  const total = filtered.reduce((sum, c) => sum + c.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">カテゴリ別支払分布</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          イベント名・場所・金額から自動分類（旅行 / 飲み会 / アクティビティ / その他）
        </p>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <div className="w-full sm:w-1/2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={filtered}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={30}
                    paddingAngle={2}
                    stroke="#fff"
                  >
                    {filtered.map((entry) => (
                      <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => {
                      const label = CATEGORY_LABELS[name as OtokogiCategory] ?? String(name);
                      return [formatYen(Number(value)), label];
                    }}
                  />
                  <Legend
                    formatter={(name) => CATEGORY_LABELS[name as OtokogiCategory] ?? String(name)}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-1/2 space-y-1.5">
              {filtered.map((c) => {
                const pct = total > 0 ? Math.round((c.amount / total) * 100) : 0;
                return (
                  <div key={c.category} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[c.category] }}
                    />
                    <span className="flex-1 text-slate-800">
                      {CATEGORY_LABELS[c.category]}
                    </span>
                    <span className="text-slate-700 tabular-nums">{formatYen(c.amount)}</span>
                    <span className="text-gray-400 w-10 text-right tabular-nums">{pct}%</span>
                    <span className="text-gray-400 w-10 text-right tabular-nums">
                      {c.count}回
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// C. 累積折れ線（今年 / 昨年 / 一昨年）
// ============================================================
export function CumulativeYearlySection({
  data,
  thisYearLabel,
}: {
  data?: OtokogiChartsResponse['cumulativeYearly'];
  thisYearLabel: number;
}) {
  if (!data || data.length === 0) return null;

  const hasAny = data.some(
    (d) => (d.thisYear ?? 0) > 0 || d.lastYear > 0 || d.yearBefore > 0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">年次累積推移</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">今年 / 昨年 / 一昨年の 1 月からの累積支払額</p>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <p className="text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="w-full h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(m) => `${m}月`}
                />
                <YAxis
                  tickFormatter={formatYenShort}
                  tick={{ fontSize: 10 }}
                  width={46}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (value === null) return ['-', name];
                    return [formatYen(Number(value)), name];
                  }}
                  labelFormatter={(label) => `${label}月`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="thisYear"
                  name={`${thisYearLabel}年`}
                  stroke="#d97706"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="lastYear"
                  name={`${thisYearLabel - 1}年`}
                  stroke="#0057b7"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  strokeDasharray="4 2"
                />
                <Line
                  type="monotone"
                  dataKey="yearBefore"
                  name={`${thisYearLabel - 2}年`}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                  strokeDasharray="2 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// D. 比較棒グラフ（今月 vs 先月 / 今年 vs 昨年、メンバー別積み上げ）
// ============================================================
type ComparisonProp = OtokogiChartsResponse['comparison'];
type ComparisonMemberCol = { memberId: string; memberName: string; amount: number };

// members のうち、少なくとも 1 系列で金額 > 0 のメンバーに絞って凡例の氾濫を防ぐ
function activeMembers(entries: ComparisonMemberCol[][]): string[] {
  const ids = new Set<string>();
  for (const arr of entries) {
    for (const m of arr) {
      if (m.amount > 0) ids.add(m.memberId);
    }
  }
  return [...ids];
}

const MEMBER_PALETTE = [
  '#d97706', '#0057b7', '#d95c5c', '#059669', '#7c3aed',
  '#db2777', '#2563eb', '#ea580c', '#0d9488', '#9333ea',
];

function colorForIndex(i: number): string {
  return MEMBER_PALETTE[i % MEMBER_PALETTE.length];
}

type ComparisonChartRow = {
  label: string;
  total: number;
  [memberId: string]: number | string;
};

function toChartRow(label: string, total: number, byMember: ComparisonMemberCol[]): ComparisonChartRow {
  const row: ComparisonChartRow = { label, total };
  for (const m of byMember) {
    row[m.memberId] = m.amount;
  }
  return row;
}

export function ComparisonSection({ data }: { data?: ComparisonProp }) {
  if (!data) return null;

  const monthChartData: ComparisonChartRow[] = [
    toChartRow(data.labels.lastMonth, data.lastMonth.total, data.lastMonth.byMember),
    toChartRow(data.labels.thisMonth, data.thisMonth.total, data.thisMonth.byMember),
  ];
  const yearChartData: ComparisonChartRow[] = [
    toChartRow(data.labels.lastYear, data.lastYear.total, data.lastYear.byMember),
    toChartRow(data.labels.thisYear, data.thisYear.total, data.thisYear.byMember),
  ];

  const monthActive = activeMembers([data.thisMonth.byMember, data.lastMonth.byMember]);
  const yearActive = activeMembers([data.thisYear.byMember, data.lastYear.byMember]);

  const nameLookup = new Map(
    [...data.thisMonth.byMember, ...data.thisYear.byMember].map((m) => [
      m.memberId,
      m.memberName,
    ])
  );

  const monthDiff = data.thisMonth.total - data.lastMonth.total;
  const yearDiff = data.thisYear.total - data.lastYear.total;

  function renderStackedChart(
    rows: ComparisonChartRow[],
    activeIds: string[],
    title: string,
    diff: number,
    totalThis: number,
  ) {
    const noData = rows.every((r) => r.total === 0);
    return (
      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-slate-800 text-base">{title}</CardTitle>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-800 tabular-nums">
                {formatYen(totalThis)}
              </p>
              {!noData && (
                <p
                  className={`text-[10px] font-medium ${
                    diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'
                  }`}
                >
                  {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {formatYen(Math.abs(diff))}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {noData ? (
            <p className="text-sm text-gray-500">データがありません</p>
          ) : (
            <div className="w-full h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  margin={{ top: 5, right: 5, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={formatYenShort}
                    tick={{ fontSize: 10 }}
                    width={46}
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      const label = nameLookup.get(String(name)) ?? String(name);
                      return [formatYen(Number(value)), label];
                    }}
                  />
                  {activeIds.map((id, i) => (
                    <Bar
                      key={id}
                      dataKey={id}
                      stackId="s"
                      fill={colorForIndex(i)}
                      radius={i === activeIds.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {!noData && activeIds.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {activeIds.map((id, i) => (
                <div key={id} className="flex items-center gap-1 text-[10px] text-gray-600">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: colorForIndex(i) }}
                  />
                  {nameLookup.get(id) ?? id}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {renderStackedChart(
        monthChartData,
        monthActive,
        `${data.labels.thisMonth} vs ${data.labels.lastMonth}`,
        monthDiff,
        data.thisMonth.total,
      )}
      {renderStackedChart(
        yearChartData,
        yearActive,
        `${data.labels.thisYear} vs ${data.labels.lastYear}`,
        yearDiff,
        data.thisYear.total,
      )}
    </div>
  );
}

// ============================================================
// E. Top 3 カード（直近 3ヶ月 最高額）
// ============================================================
export function TopRecentSection({ data }: { data?: OtokogiChartsResponse['topRecent'] }) {
  if (!data) return null;

  const ranks = ['①', '②', '③'];
  const bgTints = ['bg-amber-50 border-amber-200', 'bg-slate-50 border-slate-200', 'bg-orange-50 border-orange-200'];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">直近 3ヶ月の男気 Top 3</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">金額順の上位 3 件</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-gray-500">直近 3ヶ月に男気イベントがありません</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.map((entry, i) => (
              <div
                key={entry.id}
                className={`rounded-lg border p-3 ${bgTints[i] ?? bgTints[2]}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-lg font-bold text-slate-500">{ranks[i] ?? ''}</span>
                  <Avatar member={entry.payer} size="md" />
                </div>
                <Yen value={entry.amount} className="text-2xl font-extrabold text-slate-800 block" />
                <p className="text-sm font-medium text-slate-700 mt-1 truncate">
                  {entry.payer.name}
                </p>
                <p className="text-xs text-gray-600 mt-1 truncate" title={entry.eventName}>
                  {entry.eventName}
                </p>
                <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1">
                  <span>{entry.eventDate}</span>
                  {entry.place && <span className="truncate ml-2">@{entry.place}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
