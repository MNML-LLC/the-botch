"use client";

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import { useMembers } from '@/hooks/use-members';
import {
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

type StreakEntry = { id: string; maxStreak: number };

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
  // メンバー行 + 補助データ (streaks など) から 1 セルの表示値を返す
  render: (m: MemberSummaryEntry, extra: { maxStreak: number }) => ReactValue;
  // 値のフォーマット特性 (符号付き強調するかなど)
  signed?: boolean;
};

// Issue #393: じゃんけん勝率列は記録なしでも常に表示 (hasJankenData 引数は不要)
// Issue #391 C: じゃんけん勝率 / 男気率 / ストリーク を含む全指標を 1 表に集約
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
  // Issue #393: 記録なしでも列は残す。jankenWinRate=null なら "—" を描画
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
  const { data, isFetching } = useOtokogiMemberSummary<MemberSummaryResponse>(
    from,
    to,
    memberIds
  );

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
                        // 漢気金額: 正=緑, 負=赤
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
        <CardTitle className="text-slate-800">称号一覧</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          期間内の支払総額 / 支払回数 / 連勝 / クラッチ / 気前度 / じゃんけんから自動判定
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

/**
 * /otokogi 内の統計タブ、および /otokogi/stats (backward-compat redirect 先) で
 * 共通利用する統計コンテンツ。親から period を受け取り、メンバー絞り込みは
 * コンポーネント内部で管理する。
 */
export function StatsContent({ period }: { period: PeriodState }) {
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const { from, to } = useMemo(() => computeDateRange(period), [period]);

  const { data: membersData } = useMembers({ staleTime: 5 * 60 * 1000 });
  const members: Member[] = membersData ?? [];

  const { data: stats, isFetching: statsFetching } = useOtokogiStatsMain<StatsData>(
    from,
    to,
    selectedMemberIds,
  );

  const { data: charts } = useOtokogiCharts(from, to, selectedMemberIds);
  const chartsThisYearLabel = charts?.anchorYear ?? new Date().getFullYear();

  return (
    <div>
      <MemberChipFilter
        selectedMemberIds={selectedMemberIds}
        setSelectedMemberIds={setSelectedMemberIds}
        members={members}
      />

      {stats && (
        <div className="flex gap-3 py-3 text-center">
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

      {/*
        Issue #391: CEO 推奨構成に沿って並び替え。
        - 前月比較 / 前年度比較 (ComparisonSection) は削除 (B5)。
        - 月次推移 と 累積レース は連続配置して "違い" を目で確認できるようにする (B2)。
      */}
      <div className="space-y-4">
        {/* 1. Top-3 ランキング */}
        <RankingSection data={stats?.otokogiByMember} />
        {/* 2. メンバー別収支表 (全指標集約) */}
        <MemberBalanceSection
          from={from}
          to={to}
          memberIds={selectedMemberIds}
          streaks={stats?.streaks ?? []}
        />
        {/* 3. 月別男気額の推移 */}
        <MonthlyTrendSection data={stats?.monthlyTrend} />
        {/* 4. メンバー別 累積男気額レース — 月次推移との違いを隣接配置で見せる */}
        <CumulativeRaceSection data={stats?.cumulativeRace} members={members} />
        {/* 5. 月 × メンバー ヒートマップ */}
        <MonthMemberHeatmapSection data={charts?.monthMemberHeatmap} />
        {/* 6. カテゴリ別円グラフ (3 分類) */}
        <CategoryPieSection data={stats?.categoryBreakdown} />
        {/* 7. 直近 3 ヶ月の男気トップ */}
        <TopRecentSection data={charts?.topRecent} />
        {/* 8. 称号表示 */}
        <BadgesSection period={period} members={members} />
        {/* 9. 補足: 年比較の累積 (全員合計) */}
        <CumulativeYearlySection data={charts?.cumulativeYearly} thisYearLabel={chartsThisYearLabel} />
      </div>
    </div>
  );
}
