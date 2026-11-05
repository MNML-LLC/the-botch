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
import { getPeriodRange, type PeriodState } from '@/lib/date-utils';
import { TermTooltip } from '@/components/ui/term-tooltip';
import {
  computeInsights,
  type Insight,
  type InsightContext,
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

type StreakEntry = { id: string; name: string; maxStreak: number; currentStreak: number };

type StatsRecord = { label: string; value: number | string; detail?: string };

type StatsData = {
  monthlyTrend: { month: string; amount: number }[];
  otokogiByMember: OtokogiByMember[];
  totalCount: number;
  totalAmount: number;
  averageAmount: number;
  categoryBreakdown: { category: OtokogiCategory; amount: number; count: number }[];
  cumulativeRace: { month: string; [memberId: string]: string | number }[];
  streaks: StreakEntry[];
  records: StatsRecord[];
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
 * 「前期」の日付範囲を推定する。
 * - current-fy  → last-fy
 * - last-fy     → さらに 1 期前 (fy - 2)
 * - current-month → 先月
 * - custom      → from/to の幅と同じ日数を直前に遡る
 * - all         → null (比較不可)
 */
function computePreviousDateRange(period: PeriodState): { from?: string; to?: string } | null {
  const now = new Date();
  switch (period.period) {
    case 'current-fy': {
      // 1 期前
      const prev = getPeriodRange('last-fy', now);
      return { from: toIsoDate(prev.from), to: toIsoDate(prev.to) };
    }
    case 'last-fy': {
      // 2 期前: last-fy range を参考に 1 年分シフトして再構築する
      const r = getPeriodRange('last-fy', now);
      if (!r.from || !r.to) return null;
      const from = new Date(r.from.getFullYear() - 1, r.from.getMonth(), r.from.getDate());
      const to = new Date(r.to.getFullYear() - 1, r.to.getMonth(), r.to.getDate(), 23, 59, 59, 999);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case 'current-month': {
      // 先月
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case 'custom': {
      const r = getPeriodRange('custom', now, { from: period.from, to: period.to });
      if (!r.from || !r.to) return null;
      const spanMs = r.to.getTime() - r.from.getTime();
      const to = new Date(r.from.getTime() - 1); // 開始直前まで
      const from = new Date(to.getTime() - spanMs);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    }
    case 'all':
    default:
      return null;
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
  from,
  to,
  memberIds,
  streaks,
}: {
  from?: string;
  to?: string;
  memberIds: string[];
  streaks: StreakEntry[];
}) {
  const { data, isFetching } = useOtokogiMemberSummary<MemberSummaryResponse>(from, to, memberIds);

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
                          <td key={m.memberId} className="p-2 text-center whitespace-nowrap">
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

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

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
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${member.colorBg} ${member.colorText}`}
                >
                  {member.initial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 mb-1">{member.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {badges?.map((badge) => <BadgeChip key={badge.id} badge={badge} size="xs" />)}
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

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

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
                .filter(
                  (r): r is { member: Member; badges: (typeof fy.badges)[number]['badges'] } =>
                    r !== null,
                );
              if (rows.length === 0) return null;
              return (
                <div key={fy.fy} className="border-l-2 border-amber-200 pl-3">
                  <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{fy.shortLabel}</span>
                    <span className="text-[11px] text-gray-500">
                      ({new Date(fy.from).getFullYear()}/11 〜 {new Date(fy.to).getFullYear()}/10 · {fy.eventCount}件)
                    </span>
                  </div>
                  <div className="space-y-2">
                    {rows.map(({ member, badges }) => (
                      <div key={member.id} className="flex items-start gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${member.colorBg} ${member.colorText}`}
                        >
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
              <YAxis tickFormatter={formatYenShort} tick={{ fontSize: 10 }} width={40} />
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
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={48} />
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

// ============================================================
// Layer 1: Headline KPIs
// ============================================================

type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  diff?: {
    sign: '+' | '-' | '±';
    text: string;
    positive: boolean;
  } | null;
  accent?: 'amber' | 'rose' | 'slate';
};

function KpiCard({ label, value, diff, accent = 'slate' }: KpiCardProps) {
  const accentBg =
    accent === 'amber'
      ? 'bg-amber-50 border-amber-200'
      : accent === 'rose'
        ? 'bg-rose-50 border-rose-200'
        : 'bg-white border-gray-200';

  return (
    <div className={`flex-1 min-w-0 rounded-lg border ${accentBg} p-3`}>
      <p className="text-[10px] text-gray-500 mb-1">{label}</p>
      <div className="text-xl sm:text-2xl font-bold text-slate-800 tabular-nums break-all tracking-tight">
        {value}
      </div>
      {diff ? (
        <p
          className={`text-[11px] mt-1 tabular-nums ${
            diff.positive ? 'text-green-600' : diff.sign === '±' ? 'text-gray-500' : 'text-red-500'
          }`}
        >
          前期比 {diff.text}
        </p>
      ) : (
        <p className="text-[11px] mt-1 text-gray-400">前期比 —</p>
      )}
    </div>
  );
}

function diffPercent(curr: number, prev: number | null | undefined): KpiCardProps['diff'] {
  if (prev === null || prev === undefined) return null;
  if (prev === 0 && curr === 0) {
    return { sign: '±', text: '0%', positive: false };
  }
  if (prev === 0) {
    return { sign: '+', text: '+∞%', positive: true };
  }
  const ratio = (curr - prev) / prev;
  if (ratio === 0) return { sign: '±', text: '±0%', positive: false };
  const sign = ratio > 0 ? '+' : '-';
  return {
    sign,
    text: `${sign}${Math.abs(Math.round(ratio * 100))}%`,
    positive: ratio > 0,
  };
}

function diffCount(curr: number, prev: number | null | undefined): KpiCardProps['diff'] {
  if (prev === null || prev === undefined) return null;
  const d = curr - prev;
  if (d === 0) return { sign: '±', text: '±0', positive: false };
  const sign = d > 0 ? '+' : '-';
  return { sign, text: `${sign}${Math.abs(d)}`, positive: d > 0 };
}

function HeadlineKpiSection({
  stats,
  previous,
  clutchCount,
  previousClutchCount,
  hasPrevious,
}: {
  stats?: StatsData;
  previous?: StatsData | null;
  clutchCount: number;
  previousClutchCount: number;
  hasPrevious: boolean;
}) {
  const prevForAmount = hasPrevious ? (previous?.totalAmount ?? 0) : null;
  const prevForCount = hasPrevious ? (previous?.totalCount ?? 0) : null;
  const prevForClutch = hasPrevious ? previousClutchCount : null;

  return (
    <div className="flex gap-2 sm:gap-3">
      <KpiCard
        label="期間総額"
        value={<Yen value={stats?.totalAmount ?? 0} size="xl" className="font-bold" />}
        diff={diffPercent(stats?.totalAmount ?? 0, prevForAmount)}
        accent="amber"
      />
      <KpiCard
        label="男気発動"
        value={<span>{stats?.totalCount ?? 0}<span className="text-sm text-gray-500 ml-1">回</span></span>}
        diff={diffCount(stats?.totalCount ?? 0, prevForCount)}
        accent="slate"
      />
      <KpiCard
        label="CLUTCH 発動"
        value={<span>{clutchCount}<span className="text-sm text-gray-500 ml-1">回</span></span>}
        diff={diffCount(clutchCount, prevForClutch)}
        accent="rose"
      />
    </div>
  );
}

// ============================================================
// Layer 2: 称号 Top (Primary カード: MVP / 裏男気王 / 量産王)
// ============================================================

type PrimaryTitle = {
  key: 'mvp' | 'shadow' | 'count';
  icon: string;
  label: string;
  tagline: string;
  gradient: string;
  member: MemberSummaryEntry;
  valueText: string;
};

function TitleTopSection({ members, summary }: { members: Member[]; summary?: MemberSummaryResponse }) {
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const titles = useMemo<PrimaryTitle[]>(() => {
    if (!summary?.members || summary.members.length === 0) return [];
    const mvp = [...summary.members]
      .filter((m) => m.actualPaid > 0)
      .sort((a, b) => b.actualPaid - a.actualPaid)[0];
    const shadow = [...summary.members]
      .filter((m) => m.otokogiAmount > 0)
      .sort((a, b) => b.otokogiAmount - a.otokogiAmount)[0];
    const count = [...summary.members]
      .filter((m) => m.payerCount > 0)
      .sort((a, b) => b.payerCount - a.payerCount)[0];

    const list: PrimaryTitle[] = [];
    if (mvp) {
      list.push({
        key: 'mvp',
        icon: '💎',
        label: 'MVP',
        tagline: '支払総額 1 位',
        gradient: 'from-amber-100 to-amber-50 border-amber-300',
        member: mvp,
        valueText: formatYen(mvp.actualPaid),
      });
    }
    if (shadow) {
      list.push({
        key: 'shadow',
        icon: '🏆',
        label: '裏男気王',
        tagline: 'フェアシェア超過 1 位',
        gradient: 'from-rose-100 to-rose-50 border-rose-300',
        member: shadow,
        valueText: `+${formatYen(shadow.otokogiAmount)}`,
      });
    }
    if (count) {
      list.push({
        key: 'count',
        icon: '🎖️',
        label: '量産王',
        tagline: '支払回数 1 位',
        gradient: 'from-emerald-100 to-emerald-50 border-emerald-300',
        member: count,
        valueText: `${count.payerCount} 回`,
      });
    }
    return list;
  }, [summary]);

  if (titles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-800">称号 Top</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">この期間に称号を獲得したメンバーはいません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {titles.map((t) => {
        const m = memberById.get(t.member.memberId);
        return (
          <div
            key={t.key}
            className={`rounded-lg border bg-gradient-to-br ${t.gradient} p-3 min-w-0 overflow-hidden`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg" aria-hidden>
                {t.icon}
              </span>
              <span className="text-xs font-bold text-slate-700">{t.label}</span>
              <span className="text-[10px] text-gray-500 ml-auto">{t.tagline}</span>
            </div>
            <div className="flex items-center gap-2">
              {m && (
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${m.colorBg} ${m.colorText}`}
                >
                  {m.initial}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {t.member.memberName}
                </p>
                <p className="text-[11px] text-gray-600 tabular-nums truncate">{t.valueText}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Layer 5: 記録 (Records)
// ============================================================

function RecordsSection({
  stats,
  memberSummary,
}: {
  stats?: StatsData;
  memberSummary?: MemberSummaryResponse;
}) {
  const items: { label: string; value: string; detail?: string }[] = [];

  // API レコード (最高額 / 最低額 / 1日最多回数 / 最多参加人数)
  for (const r of stats?.records ?? []) {
    items.push({
      label: r.label,
      value: typeof r.value === 'number' ? (r.label.includes('額') ? formatYen(r.value) : `${r.value}`) : r.value,
      detail: r.detail,
    });
  }
  // 最長ストリーク (streaks から導出)
  const topStreak = [...(stats?.streaks ?? [])].sort((a, b) => b.maxStreak - a.maxStreak)[0];
  if (topStreak && topStreak.maxStreak > 0) {
    items.push({
      label: '最長ストリーク',
      value: `${topStreak.maxStreak} 連続`,
      detail: topStreak.name,
    });
  }
  // じゃんけん最高勝率 (10 戦以上)
  if (memberSummary?.members) {
    const topJanken = [...memberSummary.members]
      .filter((m) => m.jankenWinRate !== null && m.jankenParticipationCount >= 10)
      .sort((a, b) => (b.jankenWinRate ?? 0) - (a.jankenWinRate ?? 0))[0];
    if (topJanken && topJanken.jankenWinRate !== null) {
      items.push({
        label: 'じゃんけん最高勝率',
        value: `${Math.round(topJanken.jankenWinRate * 100)}%`,
        detail: `${topJanken.memberName} (${topJanken.jankenParticipationCount}戦)`,
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">名場面 (期間内の記録)</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">期間内の最高・最長・最多の記録</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">データがありません</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map((r, i) => (
              <div
                key={`${r.label}-${i}`}
                className="flex items-baseline gap-2 border-b border-gray-100 last:border-0 py-1.5"
              >
                <span className="text-xs text-gray-500 min-w-[7em]">{r.label}</span>
                <span className="text-sm font-semibold text-slate-800 tabular-nums">{r.value}</span>
                {r.detail && (
                  <span className="text-[11px] text-gray-500 ml-auto truncate min-w-0">
                    {r.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Layer 6: ★ Auto-Insights
// ============================================================

function InsightsSection({
  stats,
  previous,
  memberSummary,
  clutchCount,
  previousClutchCount,
  hasPrevious,
}: {
  stats?: StatsData;
  previous?: StatsData | null;
  memberSummary?: MemberSummaryResponse;
  clutchCount: number;
  previousClutchCount: number;
  hasPrevious: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const insights = useMemo<Insight[]>(() => {
    if (!stats || !memberSummary) return [];
    const ctx: InsightContext = {
      totalCount: stats.totalCount,
      totalAmount: stats.totalAmount,
      averageAmount: stats.averageAmount,
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
        clutchTotal: m.clutchTotal,
        jankenWinRate: m.jankenWinRate,
        jankenParticipationCount: m.jankenParticipationCount,
      })),
      streaks: stats.streaks.map((s) => ({
        id: s.id,
        name: s.name,
        maxStreak: s.maxStreak,
        currentStreak: s.currentStreak,
      })),
      monthlyTrend: stats.monthlyTrend,
      categoryBreakdown: stats.categoryBreakdown,
      previous: hasPrevious && previous
        ? { totalCount: previous.totalCount, totalAmount: previous.totalAmount }
        : null,
    };
    // clutchCount は memberSummary から合算される前提 (detector 側で合算) なので
    // ctx 自体は memberSummary を参照している。
    void clutchCount;
    void previousClutchCount;
    return computeInsights(ctx);
  }, [stats, memberSummary, previous, hasPrevious, clutchCount, previousClutchCount]);

  const top = insights.slice(0, 4);
  const rest = insights.slice(4);

  return (
    <Card className="border-amber-300 bg-amber-50/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            ★
          </span>
          <CardTitle className="text-slate-800">自動洞察 (Auto-Insights)</CardTitle>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          期間内の数値から統計的事実を自動検出。優先度の高いものから top 4 件を表示。
        </p>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-sm text-gray-500">特記すべき洞察はまだありません</p>
        ) : (
          <>
            <ul className="space-y-2">
              {top.map((ins, i) => (
                <li
                  key={`${ins.kind}-${ins.memberId ?? i}`}
                  className="flex items-start gap-2 bg-white rounded-md border border-amber-100 px-3 py-2"
                >
                  <span className="text-base shrink-0" aria-hidden>
                    {ins.icon}
                  </span>
                  <p className="text-sm text-slate-800 leading-snug">{ins.text}</p>
                </li>
              ))}
              {expanded &&
                rest.map((ins, i) => (
                  <li
                    key={`${ins.kind}-${ins.memberId ?? `rest-${i}`}`}
                    className="flex items-start gap-2 bg-white rounded-md border border-amber-100 px-3 py-2"
                  >
                    <span className="text-base shrink-0" aria-hidden>
                      {ins.icon}
                    </span>
                    <p className="text-sm text-slate-800 leading-snug">{ins.text}</p>
                  </li>
                ))}
            </ul>
            {rest.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-amber-700 hover:text-amber-900 mt-2 underline"
              >
                {expanded ? '閉じる ▲' : `もっと見る (+${rest.length}) ▼`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Layer 7: 比較分析 (折りたたみ)
// ============================================================

function ComparisonSection({
  stats,
  previous,
  memberSummary,
  previousMemberSummary,
  clutchCount,
  previousClutchCount,
  hasPrevious,
  periodLabel,
  previousLabel,
}: {
  stats?: StatsData;
  previous?: StatsData | null;
  memberSummary?: MemberSummaryResponse;
  previousMemberSummary?: MemberSummaryResponse | null;
  clutchCount: number;
  previousClutchCount: number;
  hasPrevious: boolean;
  periodLabel: string;
  previousLabel: string;
}) {
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    return [
      {
        label: '期間総額',
        now: formatYen(stats?.totalAmount ?? 0),
        prev: formatYen(previous?.totalAmount ?? 0),
      },
      {
        label: '男気発動回数',
        now: `${stats?.totalCount ?? 0} 回`,
        prev: `${previous?.totalCount ?? 0} 回`,
      },
      {
        label: 'CLUTCH 発動',
        now: `${clutchCount} 回`,
        prev: `${previousClutchCount} 回`,
      },
      {
        label: '平均 1 回あたり',
        now: formatYen(stats?.averageAmount ?? 0),
        prev: formatYen(previous?.averageAmount ?? 0),
      },
      {
        label: '参加メンバー数',
        now: `${memberSummary?.members.filter((m) => m.participationCount > 0).length ?? 0} 人`,
        prev: `${previousMemberSummary?.members.filter((m) => m.participationCount > 0).length ?? 0} 人`,
      },
    ];
  }, [stats, previous, memberSummary, previousMemberSummary, clutchCount, previousClutchCount]);

  if (!hasPrevious) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-slate-800">比較分析 ({periodLabel} vs {previousLabel})</CardTitle>
          <span className="text-xs text-gray-500">{open ? '▲' : '▼'}</span>
        </button>
      </CardHeader>
      {open && (
        <CardContent>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-2 font-medium text-gray-500">指標</th>
                <th className="text-right p-2 font-medium text-gray-700">{periodLabel}</th>
                <th className="text-right p-2 font-medium text-gray-500">{previousLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-gray-100 last:border-0">
                  <td className="p-2 text-gray-600">{r.label}</td>
                  <td className="p-2 text-right text-slate-800 tabular-nums font-semibold">{r.now}</td>
                  <td className="p-2 text-right text-gray-500 tabular-nums">{r.prev}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================
// メインエクスポート: 7 層構造
// ============================================================

const PERIOD_LABELS: Record<PeriodState['period'], string> = {
  'current-month': '今月',
  'current-fy': '今期',
  'last-fy': '前期',
  all: '全期間',
  custom: 'カスタム期間',
};
const PREVIOUS_LABELS: Record<PeriodState['period'], string> = {
  'current-month': '先月',
  'current-fy': '前期',
  'last-fy': '前々期',
  all: '—',
  custom: '直前',
};

export function StatsContent({ period }: { period: PeriodState }) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const { from, to } = useMemo(() => computeDateRange(period), [period]);
  const previousRange = useMemo(() => computePreviousDateRange(period), [period]);
  const hasPrevious = previousRange !== null;

  const { data: membersData } = useMembers({ staleTime: 5 * 60 * 1000 });
  const members: Member[] = membersData ?? [];

  // 現期
  const { data: stats, isFetching: statsFetching } = useOtokogiStatsMain<StatsData>(
    from,
    to,
    selectedMemberIds,
  );
  const { data: charts } = useOtokogiCharts(from, to, selectedMemberIds);
  const { data: memberSummary } = useOtokogiMemberSummary<MemberSummaryResponse>(
    from,
    to,
    selectedMemberIds,
  );

  // 前期 (hasPrevious の場合のみ fetch。hook 自体は undefined でも fetch を抑止)
  const { data: previousStats } = useOtokogiStatsMain<StatsData>(
    previousRange?.from,
    previousRange?.to,
    selectedMemberIds,
  );
  const { data: previousMemberSummary } = useOtokogiMemberSummary<MemberSummaryResponse>(
    previousRange?.from,
    previousRange?.to,
    selectedMemberIds,
  );

  // CLUTCH 件数: memberSummary を合算
  const clutchCount = useMemo(
    () => (memberSummary?.members ?? []).reduce((s, m) => s + m.clutchCount, 0),
    [memberSummary],
  );
  const previousClutchCount = useMemo(
    () => (previousMemberSummary?.members ?? []).reduce((s, m) => s + m.clutchCount, 0),
    [previousMemberSummary],
  );

  const periodLabel = PERIOD_LABELS[period.period];
  const previousLabel = PREVIOUS_LABELS[period.period];

  return (
    <div>
      <MemberChipFilter
        selectedMemberIds={selectedMemberIds}
        setSelectedMemberIds={setSelectedMemberIds}
        members={members}
      />

      {!stats && statsFetching && (
        <p className="text-sm text-gray-500 py-4">読み込み中...</p>
      )}

      <div className="space-y-4">
        {/* Layer 1: Headline KPIs */}
        <HeadlineKpiSection
          stats={stats}
          previous={previousStats}
          clutchCount={clutchCount}
          previousClutchCount={previousClutchCount}
          hasPrevious={hasPrevious}
        />

        {/* Layer 6: ★ Auto-Insights (分析の核 — 上位に配置) */}
        <InsightsSection
          stats={stats}
          previous={previousStats}
          memberSummary={memberSummary}
          clutchCount={clutchCount}
          previousClutchCount={previousClutchCount}
          hasPrevious={hasPrevious}
        />

        {/* Layer 2: 称号 Top */}
        <TitleTopSection members={members} summary={memberSummary} />

        {/* Layer 3: 時系列 (月次推移 + 累積レース) */}
        <MonthlyTrendSection data={stats?.monthlyTrend} />
        <CumulativeRaceSection data={stats?.cumulativeRace} members={members} />

        {/* Layer 4: 分布 (カテゴリ + ヒートマップ) */}
        <CategoryPieSection data={stats?.categoryBreakdown} />
        <MonthMemberHeatmapSection data={charts?.monthMemberHeatmap} />

        {/* Layer 5: 記録 */}
        <RecordsSection stats={stats} memberSummary={memberSummary} />

        {/* 既存: ランキング / 収支表 / 期間内累積 / 称号 / FY バッジ / Top3 直近 */}
        <RankingSection data={stats?.otokogiByMember} />
        <MemberBalanceSection
          from={from}
          to={to}
          memberIds={selectedMemberIds}
          streaks={stats?.streaks ?? []}
        />
        <CumulativeYearlySection data={charts?.cumulativeYearly} />
        <TopRecentSection data={charts?.topRecent} />
        <BadgesSection period={period} members={members} />
        <FyBadgesSection members={members} />

        {/* Layer 7: 比較分析 (折りたたみ) */}
        <ComparisonSection
          stats={stats}
          previous={previousStats}
          memberSummary={memberSummary}
          previousMemberSummary={previousMemberSummary}
          clutchCount={clutchCount}
          previousClutchCount={previousClutchCount}
          hasPrevious={hasPrevious}
          periodLabel={periodLabel}
          previousLabel={previousLabel}
        />
      </div>
    </div>
  );
}
