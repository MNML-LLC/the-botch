"use client";

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { useMembers } from '@/hooks/use-members';
import {
  useFyBadges,
  useOtokogiBadges,
  useOtokogiCharts,
  useOtokogiMemberSummary,
  useOtokogiStatsMain,
} from '@/hooks/use-otokogi';
import type { OtokogiCategory } from '@/lib/otokogi-category';
import { BadgeChip } from '@/components/otokogi/badge-chip';
import {
  MonthMemberHeatmapSection,
  CategoryPieSection,
  CumulativeYearlySection,
  CumulativeRaceSection,
  TopRecentSection,
} from './stats/charts';
import { Yen } from '@/components/ui/yen';
import {
  getPeriodRange,
  getFiscalYearRange,
  getCurrentMonthRange,
  type PeriodState,
} from '@/lib/date-utils';
import { TermTooltip } from '@/components/ui/term-tooltip';
import {
  computeInsights,
  type Insight,
  type InsightsContext,
} from '@/lib/otokogi-insights';

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
  streaks: StreakEntry[];
  records: { label: string; value: number | string; detail?: string }[];
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
  jankenParticipationCount: number;
  clutchCount: number;
  clutchTotal: number;
  clutchRate: number;
};

type MemberSummaryResponse = {
  members: MemberSummaryEntry[];
  hasJankenData: boolean;
};

type StreakEntry = {
  id: string;
  name: string;
  maxStreak: number;
  currentStreak: number;
};

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

/**
 * 「前期」の日付範囲を導出する。
 * - current-month → 先月 (月初〜月末)
 * - current-fy → 前期 (last-fy)
 * - last-fy → 前々期 (offset=-2)
 * - all → null (比較対象なし)
 * - custom → 同じ日数幅だけ遡った範囲
 */
function computePreviousRange(
  period: PeriodState,
  now: Date = new Date(),
): { from?: string; to?: string } | null {
  switch (period.period) {
    case 'current-month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const r = getCurrentMonthRange(
        new Date(prev.getFullYear(), prev.getMonth(), 28, 23, 59, 59, 999),
      );
      // 月末を取り直す (28 日以降なので翌月初日 -1 ms で真の月末)
      const trueEnd = new Date(prev.getFullYear(), prev.getMonth() + 1, 0, 23, 59, 59, 999);
      return { from: toIsoDate(r.from), to: toIsoDate(trueEnd) };
    }
    case 'current-fy': {
      const r = getFiscalYearRange(now, -1);
      return { from: toIsoDate(r.from), to: toIsoDate(r.to) };
    }
    case 'last-fy': {
      const r = getFiscalYearRange(now, -2);
      return { from: toIsoDate(r.from), to: toIsoDate(r.to) };
    }
    case 'all':
      return null;
    case 'custom': {
      if (!period.from || !period.to) return null;
      const from = new Date(period.from);
      const to = new Date(period.to);
      const ms = to.getTime() - from.getTime();
      if (!(ms > 0)) return null;
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - ms);
      return { from: toIsoDate(prevFrom), to: toIsoDate(prevTo) };
    }
  }
}

function MemberChipFilter({
  selectedMemberIds,
  setSelectedMemberIds,
  members,
}: {
  selectedMemberIds: string[];
  setSelectedMemberIds: (ids: string[]) => void;
  members: Member[];
}) {
  const toggleMember = (id: string) => {
    setSelectedMemberIds(
      selectedMemberIds.includes(id)
        ? selectedMemberIds.filter((m) => m !== id)
        : [...selectedMemberIds, id],
    );
  };

  if (members.length === 0) return null;

  return (
    <div className="flex gap-1 flex-wrap items-center mb-4">
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
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

type ReactValue = string | number | React.ReactNode;

type BalanceMetric = {
  label: React.ReactNode;
  render: (m: MemberSummaryEntry, extra: { maxStreak: number }) => ReactValue;
  signed?: boolean;
};

function buildBalanceMetrics(): BalanceMetric[] {
  const metrics: BalanceMetric[] = [
    { label: '参加回数', render: (m) => fmt.format(m.participationCount) },
    { label: '支払回数', render: (m) => fmt.format(m.payerCount) },
    {
      label: <TermTooltip term="男気率">男気率</TermTooltip>,
      render: (m) =>
        m.participationCount > 0
          ? `${Math.round((m.payerCount / m.participationCount) * 100)}%`
          : '—',
    },
    { label: '実際払った額', render: (m) => formatYen(m.actualPaid) },
    { label: '本来払うべき額', render: (m) => formatYen(m.shouldHavePaid) },
    {
      label: <TermTooltip term="男気">漢気金額</TermTooltip>,
      render: (m) => formatYen(m.otokogiAmount),
      signed: true,
    },
    {
      label: <TermTooltip term="気前度">平均支払単価</TermTooltip>,
      render: (m) => (m.payerCount > 0 ? formatYen(m.averagePaymentAmount) : '—'),
    },
    {
      label: <TermTooltip term="ストリーク">最大連続男気</TermTooltip>,
      render: (_m, extra) => (extra.maxStreak > 0 ? `${extra.maxStreak} 連勝` : '—'),
    },
    {
      label: <TermTooltip term="CLUTCH">★ CLUTCH回数</TermTooltip>,
      render: (m) => fmt.format(m.clutchCount),
    },
    {
      label: <TermTooltip term="CLUTCH">★ CLUTCH総額</TermTooltip>,
      render: (m) => (m.clutchCount > 0 ? formatYen(m.clutchTotal) : '—'),
    },
  ];
  metrics.push({
    label: <TermTooltip term="じゃんけん勝率">じゃんけん勝率</TermTooltip>,
    render: (m) =>
      m.jankenWinRate !== null
        ? `${formatPercent(m.jankenWinRate)} (${m.jankenParticipationCount}戦)`
        : '—',
  });
  return metrics;
}

function MemberBalanceSection({
  data,
  isFetching,
  streaks,
}: {
  data?: MemberSummaryResponse;
  isFetching: boolean;
  streaks: StreakEntry[];
}) {
  const members = data?.members ?? [];
  const metrics = buildBalanceMetrics();
  const hasJankenData = data?.hasJankenData ?? false;
  const streakByMemberId = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of streaks) map.set(s.id, s.maxStreak);
    return map;
  }, [streaks]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-slate-800">メンバー別収支</CardTitle>
          {isFetching && <span className="text-xs text-gray-400">更新中...</span>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          期間内の全指標を 1 表に集約。指標名ホバーで意味を表示。
        </p>
      </CardHeader>
      <CardContent>
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
                {metrics.map((metric, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="sticky left-0 z-10 bg-white p-2 text-gray-600 whitespace-nowrap font-medium">
                      {metric.label}
                    </td>
                    {members.map((m) => {
                      const extra = { maxStreak: streakByMemberId.get(m.memberId) ?? 0 };
                      const value = metric.render(m, extra);
                      if (metric.signed) {
                        const raw = m.otokogiAmount;
                        return (
                          <td
                            key={m.memberId}
                            className="p-2 text-center whitespace-nowrap"
                          >
                            <span
                              className={
                                raw > 0
                                  ? 'font-semibold text-green-600'
                                  : raw < 0
                                    ? 'font-semibold text-red-500'
                                    : 'text-gray-500'
                              }
                            >
                              {raw >= 0 ? '+' : ''}
                              {value}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={m.memberId}
                          className="p-2 text-center whitespace-nowrap text-slate-800"
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!hasJankenData && members.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-2 px-2">
                ※ じゃんけん勝率: 現在じゃんけん記録なし。新規男気追加時に「じゃんけんで決めた」を選ぶと勝率が計算されます。
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BadgesSection({ period, members }: { period: PeriodState; members: Member[] }) {
  const { badgesByMember, isLoading } = useOtokogiBadges(period);

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  const entries = useMemo(() => {
    const list: { member: Member; badges: ReturnType<typeof badgesByMember.get> }[] = [];
    for (const [memberId, badges] of badgesByMember.entries()) {
      if (!badges || badges.length === 0) continue;
      const member = memberById.get(memberId);
      if (member) list.push({ member, badges });
    }
    return list.sort((a, b) => (b.badges?.length ?? 0) - (a.badges?.length ?? 0));
  }, [badgesByMember, memberById]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">称号一覧 (期間)</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          選択中の期間で自動判定。年度別の履歴は下の「年度別バッジ履歴」を参照。
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-500">この期間に称号を獲得したメンバーはいません</p>
        ) : (
          <div className="space-y-3">
            {entries.map(({ member, badges }) => (
              <div key={member.id} className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${member.colorBg} ${member.colorText}`}>
                  {member.initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 mb-1">{member.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {badges?.map((badge) => (
                      <BadgeChip key={badge.id} badge={badge} size="xs" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FyBadgesSection({ members }: { members: Member[] }) {
  const { data, isLoading } = useFyBadges();

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">年度別バッジ履歴</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          全データを走査し、会計年度 (11 月〜翌 10 月) ごとに独立計算したバッジ。
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : !data || data.fiscalYears.length === 0 ? (
          <p className="text-sm text-gray-500">バッジを獲得した年度はまだありません</p>
        ) : (
          <div className="space-y-4">
            {data.fiscalYears.map((fy) => {
              const rows = fy.badges
                .map((entry) => {
                  const member = memberById.get(entry.memberId);
                  if (!member) return null;
                  return { member, badges: entry.badges };
                })
                .filter((r): r is { member: Member; badges: typeof fy.badges[number]['badges'] } => r !== null);

              if (rows.length === 0) return null;

              return (
                <div key={fy.fy} className="border-l-2 border-amber-200 pl-3">
                  <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">
                      {fy.shortLabel}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      ({new Date(fy.from).getFullYear()}/11 〜 {new Date(fy.to).getFullYear()}/10 · {fy.eventCount}件)
                    </span>
                  </div>
                  <div className="space-y-2">
                    {rows.map(({ member, badges }) => (
                      <div key={member.id} className="flex items-start gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${member.colorBg} ${member.colorText}`}>
                          {member.initial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 mb-0.5">{member.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {badges.map((badge) => (
                              <BadgeChip key={badge.id} badge={badge} size="xs" />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MonthlyTrendSection({ data }: { data?: { month: string; amount: number }[] }) {
  if (!data || data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">月別男気額の推移 (期間内 · 全員合計)</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          各月の支払総額。「どの月に多く払ったか」を見るための棒グラフ。
        </p>
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
        <p className="text-xs text-gray-500 mt-0.5">
          実際払った額 − 本来払うべき額 の累計 (期間内, 下の収支表と同値)
        </p>
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

// =============================================================
// Issue #404: Layer 1 — Headline KPIs
// =============================================================

function pctChange(cur: number, prev: number): { delta: number; label: string; up: boolean | null } {
  if (prev === 0) {
    if (cur === 0) return { delta: 0, label: '—', up: null };
    return { delta: 0, label: '前期 0', up: null };
  }
  const delta = (cur - prev) / prev;
  const up = delta > 0;
  return {
    delta,
    label: `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}%`,
    up: delta === 0 ? null : up,
  };
}

function diffChange(cur: number, prev: number): { label: string; up: boolean | null } {
  const diff = cur - prev;
  if (diff === 0) return { label: '±0', up: null };
  return { label: `${diff > 0 ? '+' : ''}${diff}`, up: diff > 0 };
}

function HeadlineKpis({
  cur,
  prev,
  hasPrev,
  loading,
}: {
  cur: { totalAmount: number; totalCount: number; clutchCount: number };
  prev: { totalAmount: number; totalCount: number; clutchCount: number } | null;
  hasPrev: boolean;
  loading: boolean;
}) {
  const amountChange = prev ? pctChange(cur.totalAmount, prev.totalAmount) : null;
  const countChange = prev ? diffChange(cur.totalCount, prev.totalCount) : null;
  const clutchChange = prev ? diffChange(cur.clutchCount, prev.clutchCount) : null;

  const changeColor = (up: boolean | null) =>
    up === true
      ? 'text-emerald-600'
      : up === false
        ? 'text-rose-500'
        : 'text-gray-400';

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <div className="rounded-lg border bg-white p-3 min-w-0">
        <p className="text-[10px] text-gray-500 mb-1">期間総額</p>
        <Yen
          value={cur.totalAmount}
          size="sm"
          className="font-bold text-slate-800 tabular-nums block tracking-tight"
        />
        <p className="text-[10px] mt-1 min-h-[14px]">
          {!hasPrev ? (
            <span className="text-gray-400">前期比なし</span>
          ) : loading ? (
            <span className="text-gray-400">...</span>
          ) : amountChange ? (
            <span className={changeColor(amountChange.up)}>
              前期比 {amountChange.label}
            </span>
          ) : null}
        </p>
      </div>
      <div className="rounded-lg border bg-white p-3 min-w-0">
        <p className="text-[10px] text-gray-500 mb-1">男気発動回数</p>
        <p className="text-xl font-bold text-slate-800 tabular-nums">
          {cur.totalCount}
          <span className="text-xs text-gray-500 ml-0.5">回</span>
        </p>
        <p className="text-[10px] mt-1 min-h-[14px]">
          {!hasPrev ? (
            <span className="text-gray-400">前期比なし</span>
          ) : loading ? (
            <span className="text-gray-400">...</span>
          ) : countChange ? (
            <span className={changeColor(countChange.up)}>
              前期比 {countChange.label}
            </span>
          ) : null}
        </p>
      </div>
      <div className="rounded-lg border bg-white p-3 min-w-0">
        <p className="text-[10px] text-gray-500 mb-1">
          <TermTooltip term="CLUTCH">★ CLUTCH</TermTooltip> 発動回数
        </p>
        <p className="text-xl font-bold text-slate-800 tabular-nums">
          {cur.clutchCount}
          <span className="text-xs text-gray-500 ml-0.5">回</span>
        </p>
        <p className="text-[10px] mt-1 min-h-[14px]">
          {!hasPrev ? (
            <span className="text-gray-400">前期比なし</span>
          ) : loading ? (
            <span className="text-gray-400">...</span>
          ) : clutchChange ? (
            <span className={changeColor(clutchChange.up)}>
              前期比 {clutchChange.label}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

// =============================================================
// Issue #404: Layer 2 — 称号 Top (Primary バッジ)
// =============================================================

type PrimaryBadge = {
  kind: 'mvp' | 'shadow-otokogi-king' | 'count-king';
  icon: string;
  label: string;
  hint: string;
  color: string;
  member: MemberSummaryEntry | null;
  valueText: string;
};

function pickPrimaryBadges(summary: MemberSummaryEntry[] | undefined): PrimaryBadge[] {
  const list = summary ?? [];
  const sortBy = <T,>(arr: T[], key: (x: T) => number) =>
    [...arr].sort((a, b) => key(b) - key(a));

  const topMvp = sortBy(list.filter((m) => m.actualPaid > 0), (m) => m.actualPaid)[0] ?? null;
  const topShadow = sortBy(list.filter((m) => m.otokogiAmount > 0), (m) => m.otokogiAmount)[0] ?? null;
  const topCount = sortBy(list.filter((m) => m.payerCount > 0), (m) => m.payerCount)[0] ?? null;

  return [
    {
      kind: 'mvp',
      icon: '💎',
      label: 'MVP',
      hint: '支払総額 1 位',
      color: 'from-amber-50 to-amber-100 border-amber-200',
      member: topMvp,
      valueText: topMvp ? formatYen(topMvp.actualPaid) : '—',
    },
    {
      kind: 'shadow-otokogi-king',
      icon: '🏆',
      label: '裏男気王',
      hint: 'フェアシェア超過 1 位',
      color: 'from-orange-50 to-orange-100 border-orange-200',
      member: topShadow,
      valueText: topShadow ? `${topShadow.otokogiAmount >= 0 ? '+' : ''}${formatYen(topShadow.otokogiAmount)}` : '—',
    },
    {
      kind: 'count-king',
      icon: '🎖️',
      label: '量産王',
      hint: '支払回数 1 位',
      color: 'from-emerald-50 to-emerald-100 border-emerald-200',
      member: topCount,
      valueText: topCount ? `${topCount.payerCount} 回` : '—',
    },
  ];
}

function PrimaryBadgesSection({ summary }: { summary?: MemberSummaryResponse }) {
  const badges = useMemo(() => pickPrimaryBadges(summary?.members), [summary]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">称号 Top</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          期間内の 3 大称号。左から 💎 MVP (総額) · 🏆 裏男気王 (超過) · 🎖️ 量産王 (回数)。
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          {badges.map((b) => (
            <div
              key={b.kind}
              className={`rounded-lg border bg-gradient-to-br ${b.color} p-3 min-w-0`}
            >
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xl leading-none">{b.icon}</span>
                <span className="text-sm font-bold text-slate-800">{b.label}</span>
                <span className="text-[10px] text-gray-500 ml-auto">{b.hint}</span>
              </div>
              {b.member ? (
                <>
                  <p className="text-sm font-medium text-slate-800 break-words line-clamp-2">
                    {b.member.memberName}
                  </p>
                  <p className="text-base font-bold text-slate-800 tabular-nums mt-0.5">
                    {b.valueText}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">該当者なし</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================
// Issue #404: Layer 5 — 記録 (Records)
// =============================================================

function RecordsSection({
  records,
  streaks,
  maxParticipationCount,
  topJanken,
}: {
  records?: { label: string; value: number | string; detail?: string }[];
  streaks: StreakEntry[];
  maxParticipationCount: number | null;
  topJanken: { name: string; rate: number; games: number } | null;
}) {
  const sortedStreaks = [...streaks].sort((a, b) => b.maxStreak - a.maxStreak);
  const topStreak = sortedStreaks[0]?.maxStreak > 0 ? sortedStreaks[0] : null;

  const highlights: { icon: string; label: string; value: string; detail?: string }[] = [];
  const maxRecord = records?.find((r) => r.label === '最高額');
  if (maxRecord && typeof maxRecord.value === 'number') {
    highlights.push({
      icon: '💰',
      label: '最高額男気 (単発)',
      value: formatYen(maxRecord.value),
      detail: maxRecord.detail,
    });
  }
  if (topStreak) {
    highlights.push({
      icon: '🔥',
      label: '最長ストリーク',
      value: `${topStreak.maxStreak} 連勝`,
      detail: topStreak.name,
    });
  }
  const maxParticipants = records?.find((r) => r.label === '最多参加人数');
  if (maxParticipants && typeof maxParticipants.value === 'number') {
    highlights.push({
      icon: '👥',
      label: '最多参加会',
      value: `${maxParticipants.value} 人`,
      detail: maxParticipants.detail,
    });
  }
  if (maxParticipationCount !== null && maxParticipationCount > 0) {
    highlights.push({
      icon: '📅',
      label: '最大参加数 (メンバー)',
      value: `${maxParticipationCount} 回`,
    });
  }
  if (topJanken) {
    highlights.push({
      icon: '✊',
      label: 'じゃんけん最高勝率',
      value: `${Math.round(topJanken.rate * 100)}%`,
      detail: `${topJanken.name} (${topJanken.games} 戦)`,
    });
  }
  const maxDay = records?.find((r) => r.label === '1日最多回数');
  if (maxDay && typeof maxDay.value === 'number') {
    highlights.push({
      icon: '🗓️',
      label: '1 日最多回数',
      value: `${maxDay.value} 回`,
      detail: maxDay.detail,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">記録 (期間内の名場面)</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          期間内に残った最高記録。カードの右端が記録値。
        </p>
      </CardHeader>
      <CardContent>
        {highlights.length === 0 ? (
          <p className="text-sm text-gray-500">記録に残るデータがありません</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {highlights.map((h, i) => (
              <li key={i} className="flex items-center gap-2 py-2 min-w-0">
                <span className="text-lg shrink-0">{h.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800">{h.label}</p>
                  {h.detail && (
                    <p className="text-[11px] text-gray-500 break-words line-clamp-2">
                      {h.detail}
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-800 tabular-nums shrink-0">
                  {h.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================
// Issue #404: Layer 6 — Auto-Insights (★ 分析の核)
// =============================================================

const INSIGHT_DEFAULT_LIMIT = 4;

function AutoInsightsSection({
  insights,
  members,
  loading,
}: {
  insights: Insight[];
  members: Member[];
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );
  const displayed = expanded ? insights : insights.slice(0, INSIGHT_DEFAULT_LIMIT);

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-slate-800 flex items-center gap-2">
            <span className="text-amber-700">★ 自動洞察</span>
            {insights.length > 0 && (
              <span className="text-xs font-normal text-gray-500">
                ({insights.length} 件)
              </span>
            )}
          </CardTitle>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          期間データから自動検出した「何が言えるか」を優先度順に表示。
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : insights.length === 0 ? (
          <p className="text-sm text-gray-500">
            この期間で特筆すべき洞察はありません。より広い期間で試してください。
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {displayed.map((ins) => {
                const member = ins.memberId ? memberById.get(ins.memberId) : null;
                return (
                  <li
                    key={ins.id}
                    className="flex items-start gap-2 bg-white rounded-md p-2 border border-amber-100"
                  >
                    <span className="text-lg shrink-0 leading-none pt-0.5">
                      {ins.icon}
                    </span>
                    {member && (
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${member.colorBg} ${member.colorText}`}
                        title={member.name}
                      >
                        {member.initial}
                      </div>
                    )}
                    <p className="text-xs text-slate-800 leading-snug flex-1 min-w-0 break-words">
                      {ins.text}
                    </p>
                  </li>
                );
              })}
            </ul>
            {insights.length > INSIGHT_DEFAULT_LIMIT && (
              <button
                type="button"
                className="mt-2 text-xs text-amber-700 hover:text-amber-800 font-medium"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? '▲ 閉じる' : `▼ もっと見る (+${insights.length - INSIGHT_DEFAULT_LIMIT})`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================
// Issue #404: Layer 7 — 比較分析 (折りたたみ)
// =============================================================

function ComparisonSection({
  curSummary,
  prevSummary,
  curMemberSummary,
  prevMemberSummary,
  periodLabel,
  prevPeriodLabel,
}: {
  curSummary: { totalAmount: number; totalCount: number; clutchCount: number } | null;
  prevSummary: { totalAmount: number; totalCount: number; clutchCount: number } | null;
  curMemberSummary?: MemberSummaryResponse;
  prevMemberSummary?: MemberSummaryResponse;
  periodLabel: string;
  prevPeriodLabel: string;
}) {
  const [open, setOpen] = useState(false);

  const memberPairs = useMemo(() => {
    if (!curMemberSummary || !prevMemberSummary) return [];
    const prevMap = new Map(prevMemberSummary.members.map((m) => [m.memberId, m]));
    return curMemberSummary.members
      .map((cur) => {
        const prev = prevMap.get(cur.memberId);
        return {
          cur,
          prev,
          diff: cur.actualPaid - (prev?.actualPaid ?? 0),
        };
      })
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 5);
  }, [curMemberSummary, prevMemberSummary]);

  if (!prevSummary) return null;

  const diffCell = (cur: number, prev: number, isCurrency: boolean) => {
    const delta = cur - prev;
    if (delta === 0) return <span className="text-gray-400">±0</span>;
    const up = delta > 0;
    return (
      <span className={up ? 'text-emerald-600' : 'text-rose-500'}>
        {up ? '+' : ''}
        {isCurrency ? formatYen(delta) : delta}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full text-left flex items-center justify-between"
        >
          <div>
            <CardTitle className="text-slate-800">
              比較分析 ({periodLabel} vs {prevPeriodLabel})
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              期間差分と変動の大きいメンバーを表示。
            </p>
          </div>
          <span className="text-xs text-gray-500">{open ? '▲' : '▼'}</span>
        </button>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="space-y-3">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-1.5 text-gray-500 font-medium">指標</th>
                  <th className="text-right p-1.5 text-gray-500 font-medium">{periodLabel}</th>
                  <th className="text-right p-1.5 text-gray-500 font-medium">{prevPeriodLabel}</th>
                  <th className="text-right p-1.5 text-gray-500 font-medium">差分</th>
                </tr>
              </thead>
              <tbody>
                {curSummary && (
                  <>
                    <tr className="border-b border-gray-100">
                      <td className="p-1.5 text-slate-800">総額</td>
                      <td className="p-1.5 text-right tabular-nums text-slate-800">
                        {formatYen(curSummary.totalAmount)}
                      </td>
                      <td className="p-1.5 text-right tabular-nums text-gray-500">
                        {formatYen(prevSummary.totalAmount)}
                      </td>
                      <td className="p-1.5 text-right tabular-nums font-semibold">
                        {diffCell(curSummary.totalAmount, prevSummary.totalAmount, true)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="p-1.5 text-slate-800">発動回数</td>
                      <td className="p-1.5 text-right tabular-nums text-slate-800">
                        {curSummary.totalCount} 回
                      </td>
                      <td className="p-1.5 text-right tabular-nums text-gray-500">
                        {prevSummary.totalCount} 回
                      </td>
                      <td className="p-1.5 text-right tabular-nums font-semibold">
                        {diffCell(curSummary.totalCount, prevSummary.totalCount, false)} 回
                      </td>
                    </tr>
                    <tr>
                      <td className="p-1.5 text-slate-800">★ CLUTCH</td>
                      <td className="p-1.5 text-right tabular-nums text-slate-800">
                        {curSummary.clutchCount} 回
                      </td>
                      <td className="p-1.5 text-right tabular-nums text-gray-500">
                        {prevSummary.clutchCount} 回
                      </td>
                      <td className="p-1.5 text-right tabular-nums font-semibold">
                        {diffCell(curSummary.clutchCount, prevSummary.clutchCount, false)} 回
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            {memberPairs.length > 0 && (
              <div>
                <p className="text-[11px] text-gray-500 mb-1 px-1">変動の大きいメンバー Top5 (実際払った額)</p>
                <ul className="space-y-1">
                  {memberPairs.map(({ cur, prev, diff }) => (
                    <li
                      key={cur.memberId}
                      className="flex items-center gap-2 text-xs px-1 min-w-0"
                    >
                      <span className="flex-1 text-slate-800 truncate">{cur.memberName}</span>
                      <span className="tabular-nums text-gray-500 shrink-0">
                        {formatYen(prev?.actualPaid ?? 0)} → {formatYen(cur.actualPaid)}
                      </span>
                      <span
                        className={`tabular-nums font-semibold shrink-0 w-20 text-right ${
                          diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-500' : 'text-gray-400'
                        }`}
                      >
                        {diff >= 0 ? '+' : ''}
                        {formatYen(diff)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// =============================================================
// Issue #404: 統計タブ本体 — 7 層構造
// =============================================================

function periodLabel(period: PeriodState): string {
  switch (period.period) {
    case 'current-month':
      return '今月';
    case 'current-fy':
      return '今期';
    case 'last-fy':
      return '前期';
    case 'all':
      return '全期間';
    case 'custom':
      return `${period.from ?? ''} 〜 ${period.to ?? ''}`.trim() || 'カスタム';
  }
}

function previousPeriodLabel(period: PeriodState): string {
  switch (period.period) {
    case 'current-month':
      return '先月';
    case 'current-fy':
      return '前期';
    case 'last-fy':
      return '前々期';
    case 'all':
      return '—';
    case 'custom':
      return '同期間前';
  }
}

export function StatsContent({ period }: { period: PeriodState }) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const { from, to } = useMemo(() => computeDateRange(period), [period]);
  const prevRange = useMemo(() => computePreviousRange(period), [period]);

  const { data: membersData } = useMembers({ staleTime: 5 * 60 * 1000 });
  const members: Member[] = membersData ?? [];

  const { data: stats, isFetching: statsFetching } = useOtokogiStatsMain<StatsData>(
    from,
    to,
    selectedMemberIds,
  );

  const { data: charts } = useOtokogiCharts(from, to, selectedMemberIds);
  const chartsThisYearLabel = charts?.anchorYear ?? new Date().getFullYear();

  const { data: memberSummary, isFetching: summaryFetching } =
    useOtokogiMemberSummary<MemberSummaryResponse>(from, to, selectedMemberIds);

  // 前期間 (Headline / Comparison 用)
  const { data: prevStats, isFetching: prevStatsFetching } =
    useOtokogiStatsMain<StatsData>(prevRange?.from, prevRange?.to, selectedMemberIds);
  const { data: prevMemberSummary } = useOtokogiMemberSummary<MemberSummaryResponse>(
    prevRange?.from,
    prevRange?.to,
    selectedMemberIds,
  );

  // 現期間の clutch 合計 (member-summary から導出)
  const curClutchCount = useMemo(
    () =>
      (memberSummary?.members ?? []).reduce((s, m) => s + m.clutchCount, 0),
    [memberSummary],
  );
  const prevClutchCount = useMemo(
    () =>
      (prevMemberSummary?.members ?? []).reduce((s, m) => s + m.clutchCount, 0),
    [prevMemberSummary],
  );

  const curHeadline = useMemo(
    () => ({
      totalAmount: stats?.totalAmount ?? 0,
      totalCount: stats?.totalCount ?? 0,
      clutchCount: curClutchCount,
    }),
    [stats?.totalAmount, stats?.totalCount, curClutchCount],
  );
  const prevHeadline = useMemo(
    () =>
      prevRange
        ? {
            totalAmount: prevStats?.totalAmount ?? 0,
            totalCount: prevStats?.totalCount ?? 0,
            clutchCount: prevClutchCount,
          }
        : null,
    [prevRange, prevStats?.totalAmount, prevStats?.totalCount, prevClutchCount],
  );

  // Auto-Insights 用 context
  const insights = useMemo(() => {
    if (!stats || !memberSummary) return [];
    const ctx: InsightsContext = {
      summary: {
        totalCount: curHeadline.totalCount,
        totalAmount: curHeadline.totalAmount,
        clutchCount: curHeadline.clutchCount,
      },
      memberSummaries: memberSummary.members.map((m) => ({
        memberId: m.memberId,
        memberName: m.memberName,
        participationCount: m.participationCount,
        payerCount: m.payerCount,
        actualPaid: m.actualPaid,
        shouldHavePaid: m.shouldHavePaid,
        otokogiAmount: m.otokogiAmount,
        averagePaymentAmount: m.averagePaymentAmount,
        maxSingleOtokogi: m.maxSingleOtokogi,
        clutchCount: m.clutchCount,
        jankenWinRate: m.jankenWinRate,
        jankenParticipationCount: m.jankenParticipationCount,
      })),
      streaks: stats.streaks ?? [],
      monthlyTrend: stats.monthlyTrend ?? [],
      categoryBreakdown: (stats.categoryBreakdown ?? []).map((c) => ({
        category: c.category,
        amount: c.amount,
        count: c.count,
      })),
      previous: prevHeadline,
      periodLabel: periodLabel(period),
    };
    return computeInsights(ctx);
  }, [stats, memberSummary, curHeadline, prevHeadline, period]);

  // 記録用: じゃんけん最高勝率 (10 戦以上)
  const topJanken = useMemo(() => {
    const list = (memberSummary?.members ?? []).filter(
      (m) => m.jankenWinRate !== null && m.jankenParticipationCount >= 10,
    );
    const sorted = list.sort((a, b) => (b.jankenWinRate ?? 0) - (a.jankenWinRate ?? 0));
    const top = sorted[0];
    if (!top || top.jankenWinRate === null) return null;
    return {
      name: top.memberName,
      rate: top.jankenWinRate,
      games: top.jankenParticipationCount,
    };
  }, [memberSummary]);

  // 記録用: 最大参加数メンバー
  const maxParticipationMember = useMemo(() => {
    const list = memberSummary?.members ?? [];
    if (list.length === 0) return null;
    const sorted = [...list].sort((a, b) => b.participationCount - a.participationCount);
    const top = sorted[0];
    return top && top.participationCount > 0 ? top.participationCount : null;
  }, [memberSummary]);

  const insightsLoading = statsFetching || summaryFetching;

  return (
    <div>
      <MemberChipFilter
        selectedMemberIds={selectedMemberIds}
        setSelectedMemberIds={setSelectedMemberIds}
        members={members}
      />

      {/* Layer 1: Headline KPIs */}
      <div className="py-2">
        <HeadlineKpis
          cur={curHeadline}
          prev={prevHeadline}
          hasPrev={prevRange !== null}
          loading={prevStatsFetching}
        />
      </div>

      <div className="space-y-4 mt-3">
        {/* Layer 6: Auto-Insights (★ 分析の核 — 早めに出す) */}
        <AutoInsightsSection
          insights={insights}
          members={members}
          loading={insightsLoading}
        />

        {/* Layer 2: 称号 Top (Primary バッジ) */}
        <PrimaryBadgesSection summary={memberSummary} />

        {/* Layer 2b: バッジ一覧 (期間) + FY 履歴 */}
        <BadgesSection period={period} members={members} />
        <FyBadgesSection members={members} />

        {/* Layer 3: 時系列 — 月次推移 + 累積レース */}
        <MonthlyTrendSection data={stats?.monthlyTrend} />
        <CumulativeRaceSection data={stats?.cumulativeRace} members={members} />

        {/* Layer 4: 分布 — カテゴリ円 + ヒートマップ */}
        <CategoryPieSection data={stats?.categoryBreakdown} />
        <MonthMemberHeatmapSection data={charts?.monthMemberHeatmap} />

        {/* Layer 5: 記録 (名場面) */}
        <RecordsSection
          records={stats?.records}
          streaks={stats?.streaks ?? []}
          maxParticipationCount={maxParticipationMember}
          topJanken={topJanken}
        />

        {/* 補助: ランキング + メンバー別収支 (既存の詳細) */}
        <RankingSection data={stats?.otokogiByMember} />
        <MemberBalanceSection
          data={memberSummary}
          isFetching={summaryFetching}
          streaks={stats?.streaks ?? []}
        />
        <TopRecentSection data={charts?.topRecent} />
        <CumulativeYearlySection data={charts?.cumulativeYearly} thisYearLabel={chartsThisYearLabel} />

        {/* Layer 7: 比較分析 (折りたたみ) */}
        <ComparisonSection
          curSummary={stats ? curHeadline : null}
          prevSummary={prevHeadline}
          curMemberSummary={memberSummary}
          prevMemberSummary={prevMemberSummary}
          periodLabel={periodLabel(period)}
          prevPeriodLabel={previousPeriodLabel(period)}
        />
      </div>
    </div>
  );
}
