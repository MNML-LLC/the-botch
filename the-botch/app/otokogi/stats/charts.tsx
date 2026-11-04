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
import type { OtokogiCategory } from '@/lib/otokogi-category';
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
// Issue #391 B3: log スケール → 線形スケール + 固定しきい値バケット + 凡例
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
];
const EMPTY_CELL = { bg: 'rgb(248, 250, 252)', text: 'rgb(203, 213, 225)' };

// Issue #391 B3: ¥0 / 〜¥20k / 〜¥50k / 〜¥100k / 〜¥200k / 〜¥500k / ¥500k+
// 固定しきい値で分類することで、期間を切り替えても色の意味が変わらない。
const HEATMAP_THRESHOLDS: { max: number; label: string }[] = [
  { max: 20_000, label: '¥20k' },
  { max: 50_000, label: '¥50k' },
  { max: 100_000, label: '¥100k' },
  { max: 200_000, label: '¥200k' },
  { max: 500_000, label: '¥500k' },
  { max: Infinity, label: '¥500k+' },
];

// 固定しきい値で 0〜6 のバケットを返す。amount=0 は -1 (空セル扱い)。
function linearBucket(amount: number): number {
  if (amount <= 0) return -1;
  for (let i = 0; i < HEATMAP_THRESHOLDS.length; i++) {
    if (amount <= HEATMAP_THRESHOLDS[i].max) return i;
  }
  return HEATMAP_THRESHOLDS.length - 1;
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
          期間内の月ごとのメンバー別支払額（固定しきい値, 濃いほど多い）
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
                      const bucket = linearBucket(amount);
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
            {/* 凡例: 固定しきい値バケット (Issue #391 B3) */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-3 pl-1">
              <span className="text-[10px] text-gray-500">¥0</span>
              {HEATMAP_THRESHOLDS.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span
                    className="inline-block w-5 h-3 rounded-sm"
                    style={{ backgroundColor: AMBER_SCALE[i].bg }}
                  />
                  <span className="text-[10px] text-gray-500">～{t.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1 pl-1">
              横スクロールで全月表示 / セル hover で詳細金額
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// B. 円グラフ（イベント種別別の支払分布）
// Issue #391 B4: 4 分類 (TRIP/HANGOUT/ACTIVITY/OTHER) → UI は 3 分類に簡素化。
// ACTIVITY は "その他" にマージして表示する（分類ロジックは据え置き）。
// ============================================================
type CategoryEntry = { category: OtokogiCategory; amount: number; count: number };

type SimplifiedCategory = 'TRIP' | 'HANGOUT' | 'OTHER';

const SIMPLIFIED_LABELS: Record<SimplifiedCategory, string> = {
  TRIP: '旅行',
  HANGOUT: '飲み',
  OTHER: 'その他',
};

const SIMPLIFIED_COLORS: Record<SimplifiedCategory, string> = {
  TRIP: '#0057b7',
  HANGOUT: '#d95c5c',
  OTHER: '#94a3b8',
};

function toSimplifiedCategory(c: OtokogiCategory): SimplifiedCategory {
  if (c === 'TRIP') return 'TRIP';
  if (c === 'HANGOUT') return 'HANGOUT';
  return 'OTHER'; // ACTIVITY + OTHER → OTHER
}

export function CategoryPieSection({ data }: { data?: CategoryEntry[] }) {
  if (!data) return null;

  // 4 分類を 3 分類に畳み込む
  const merged = new Map<SimplifiedCategory, { amount: number; count: number }>([
    ['TRIP', { amount: 0, count: 0 }],
    ['HANGOUT', { amount: 0, count: 0 }],
    ['OTHER', { amount: 0, count: 0 }],
  ]);
  for (const c of data) {
    const sc = toSimplifiedCategory(c.category);
    const bucket = merged.get(sc)!;
    bucket.amount += c.amount;
    bucket.count += c.count;
  }
  const simplified = Array.from(merged.entries()).map(([category, v]) => ({
    category,
    amount: v.amount,
    count: v.count,
  }));
  const filtered = simplified.filter((c) => c.amount > 0);
  const total = filtered.reduce((sum, c) => sum + c.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">カテゴリ別支払分布</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          イベント名・場所・金額から 3 分類（旅行 / 飲み / その他）で自動分類。
        </p>
        <ul className="text-[10px] text-gray-400 mt-1 space-y-0.5 list-disc pl-4">
          <li>旅行 = キーワード (旅行/合宿/温泉/宿泊/地名 等) もしくは単発 ¥10k+</li>
          <li>飲み = キーワード (飲み/居酒屋/焼肉/寿司/宴会 等) もしくは単発 ¥3k〜¥10k</li>
          <li>その他 = それ以外 (アクティビティ・小額を含む)</li>
        </ul>
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
                      <Cell
                        key={entry.category}
                        fill={SIMPLIFIED_COLORS[entry.category as SimplifiedCategory]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => {
                      const label = SIMPLIFIED_LABELS[name as SimplifiedCategory] ?? String(name);
                      return [formatYen(Number(value)), label];
                    }}
                  />
                  <Legend
                    formatter={(name) =>
                      SIMPLIFIED_LABELS[name as SimplifiedCategory] ?? String(name)
                    }
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
                      style={{
                        backgroundColor: SIMPLIFIED_COLORS[c.category as SimplifiedCategory],
                      }}
                    />
                    <span className="flex-1 text-slate-800">
                      {SIMPLIFIED_LABELS[c.category as SimplifiedCategory]}
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
        <CardTitle className="text-slate-800">年次累積推移 (全体 · 年比較)</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          今年 / 昨年 / 一昨年の 1 月からの累積総額。ペース比較用。
        </p>
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
// F. 累積レース（メンバー別の累積男気額を時系列で競争表示）
// ============================================================
type CumulativeRaceRow = { month: string; [memberId: string]: string | number };

export function CumulativeRaceSection({
  data,
  members,
}: {
  data?: CumulativeRaceRow[];
  members: MinimalMember[];
}) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-800">メンバー別 累積男気額レース (期間内)</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            メンバーごとの累積男気額を月単位で描画。誰がいつ抜いたかが見える。
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">データがありません</p>
        </CardContent>
      </Card>
    );
  }

  // 最終月でプラスの累積を持つメンバー = 期間内に 1 回以上支払ったメンバー
  const lastRow = data[data.length - 1];
  const activeMembers = members
    .filter((m) => {
      const v = lastRow[m.id];
      return typeof v === 'number' && v > 0;
    })
    .sort((a, b) => Number(lastRow[b.id] ?? 0) - Number(lastRow[a.id] ?? 0));

  const nameLookup = new Map(members.map((m) => [m.id, m.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">メンバー別 累積男気額レース (期間内)</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          メンバーごとの累積男気額を月単位で描画。誰がいつ抜いたかが見える。
        </p>
      </CardHeader>
      <CardContent>
        {activeMembers.length === 0 ? (
          <p className="text-sm text-gray-500">データがありません</p>
        ) : (
          <>
            <div className="w-full h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={shortMonthLabel}
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
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
                    labelFormatter={(label) => {
                      const [y, m] = String(label).split('-');
                      return `${y}年${parseInt(m)}月`;
                    }}
                    itemSorter={(item) => -Number(item.value ?? 0)}
                  />
                  {activeMembers.map((m, i) => (
                    <Line
                      key={m.id}
                      type="monotone"
                      dataKey={m.id}
                      name={m.id}
                      stroke={colorForIndex(i)}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {activeMembers.map((m, i) => (
                <div key={m.id} className="flex items-center gap-1.5 text-[11px] text-gray-700">
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ backgroundColor: colorForIndex(i) }}
                  />
                  <span className="text-slate-800">{m.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
          // Issue #391 A2: 375px でも金額がカード幅をはみ出さないよう min-w-0 / overflow-hidden /
          // モバイルで Yen を xl に落とすようレスポンシブ化。
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.map((entry, i) => (
              <div
                key={entry.id}
                className={`rounded-lg border p-3 min-w-0 overflow-hidden ${bgTints[i] ?? bgTints[2]}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-lg font-bold text-slate-500">{ranks[i] ?? ''}</span>
                  <Avatar member={entry.payer} size="md" />
                </div>
                <Yen
                  value={entry.amount}
                  className="text-xl sm:text-2xl font-extrabold text-slate-800 block break-all tracking-tight"
                />
                <p className="text-sm font-medium text-slate-700 mt-1 break-words line-clamp-2 leading-tight">
                  {entry.payer.name}
                </p>
                <p className="text-xs text-gray-600 mt-1 break-words line-clamp-2" title={entry.eventName}>
                  {entry.eventName}
                </p>
                <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 mt-1 min-w-0">
                  <span className="tabular-nums shrink-0">{entry.eventDate}</span>
                  {entry.place && <span className="truncate min-w-0">@{entry.place}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
