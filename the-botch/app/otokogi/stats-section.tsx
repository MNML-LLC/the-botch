"use client";

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';

type PerMember = {
  id: string;
  name: string;
  count: number;
  participated: number;
  totalPaid: number;
  winRate: number;
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
  totalCount: number;
  totalAmount: number;
  averageAmount: number;
  perMember: PerMember[];
  monthlyTrend: { month: string; amount: number }[];
  heatmap: Record<string, Record<string, number>>;
  deviationScores: { id: string; name: string; totalPaid: number; score: number }[];
  streaks: { id: string; name: string; maxStreak: number; currentStreak: number }[];
  cumulativeRace: { month: string; [memberId: string]: string | number }[];
  records: { label: string; value: number | string; detail?: string }[];
  otokogiByMember: OtokogiByMember[];
  totalOtokogiAmount: number;
};

const MEMBER_COLORS = ['#d97706', '#2563eb', '#dc2626', '#059669', '#7c3aed', '#ec4899'];

function formatYen(value: number) {
  if (value >= 10000) return `${Math.round(value / 10000)}万`;
  return `¥${value.toLocaleString()}`;
}

function shortMonth(month: string) {
  const [, m] = month.split('-');
  return `${parseInt(m)}月`;
}

function deviationLabel(score: number) {
  if (score >= 65) return '超漢気体質';
  if (score >= 55) return '漢気体質';
  if (score >= 45) return '平均';
  return 'しっかり者';
}

export default function StatsSection() {
  const [yearFilter, setYearFilter] = useState('all');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  const { data: stats } = useQuery({
    queryKey: ['otokogi-stats', yearFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (yearFilter !== 'all') params.set('year', yearFilter);
      const res = await fetch(`/api/otokogi/stats?${params.toString()}`);
      if (!res.ok) throw new Error('統計データの取得に失敗しました');
      return res.json() as Promise<StatsData>;
    },
    staleTime: 5 * 60 * 1000,  // 5分キャッシュ（統計は頻繁に変わらない）
    gcTime: 30 * 60 * 1000,    // 30分GC
  });

  const deviationChartData = stats?.deviationScores
    .sort((a, b) => b.score - a.score)
    .map((m) => ({
      name: m.name,
      score: m.score,
      fill: m.score >= 60 ? '#d97706' : m.score >= 40 ? '#334155' : '#9ca3af',
    })) ?? [];

  return (
    <div className="space-y-4">
      {/* 年度フィルタ */}
      <div className="flex gap-2">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-auto">
            <SelectValue>{yearFilter === 'all' ? '全期間' : `${yearFilter}年`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全期間</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!stats ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <>
          {/* 基本統計 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-800">基本統計</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-slate-800">{stats.totalCount}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500">総回数</p>
                </div>
                <div>
                  <p className="text-sm sm:text-2xl font-bold text-slate-800 truncate">¥{stats.totalAmount.toLocaleString()}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500">累計金額</p>
                </div>
                <div>
                  <p className="text-sm sm:text-2xl font-bold text-slate-800 truncate">¥{stats.averageAmount.toLocaleString()}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500">平均金額</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 漢気ランキング */}
          {stats.otokogiByMember.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-slate-800">漢気ランキング</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-500 mb-3">多く払えた額（支払額 × (参加人数−1) ÷ 参加人数）の累計</p>
                <div className="space-y-2">
                  {stats.otokogiByMember.map((member, i) => (
                    <div key={member.id} className="flex items-center gap-3 py-1">
                      <span className={`w-6 text-sm font-bold text-right shrink-0 ${
                        i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-300'
                      }`}>
                        {i + 1}
                      </span>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${member.colorBg} ${member.colorText}`}>
                        {member.initial}
                      </div>
                      <span className="text-sm text-slate-800 flex-1">{member.name}</span>
                      <span className="font-bold text-sm text-amber-600">¥{member.otokogiAmount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 月別支払額推移 */}
          {stats.monthlyTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-slate-800">月別支払額推移</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full h-48 sm:h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.monthlyTrend} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                      <XAxis
                        dataKey="month"
                        tickFormatter={shortMonth}
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickFormatter={formatYen}
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
          )}

          {/* 男気偏差値 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-800">男気偏差値</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full h-44 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={deviationChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                  >
                    <XAxis type="number" domain={[0, 80]} tick={{ fontSize: 10 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 11 }}
                      width={50}
                    />
                    <Tooltip
                      formatter={(value) => [Number(value), '偏差値']}
                    />
                    <Bar dataKey="score" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* ラベル */}
              <div className="mt-2 space-y-1">
                {deviationChartData.map((m) => (
                  <div key={m.name} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{m.name}</span>
                    <span className={`text-xs font-medium ${
                      m.score >= 60 ? 'text-amber-600' : m.score >= 40 ? 'text-slate-600' : 'text-gray-400'
                    }`}>
                      {m.score} — {deviationLabel(m.score)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 累積支払額レース */}
          {stats.cumulativeRace.length > 0 && stats.perMember.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-slate-800">累積支払額レース</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full h-52 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.cumulativeRace} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="month"
                        tickFormatter={shortMonth}
                        tick={{ fontSize: 10 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickFormatter={formatYen}
                        tick={{ fontSize: 10 }}
                        width={40}
                      />
                      <Tooltip
                        formatter={(value, name) => {
                          const member = stats.perMember.find((m) => m.id === String(name));
                          return [`¥${Number(value).toLocaleString()}`, member?.name ?? String(name)];
                        }}
                        labelFormatter={(label) => {
                          const [y, m] = String(label).split('-');
                          return `${y}年${parseInt(m)}月`;
                        }}
                      />
                      {stats.perMember.map((member, i) => (
                        <Line
                          key={member.id}
                          type="monotone"
                          dataKey={member.id}
                          name={member.id}
                          stroke={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* 凡例 */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {stats.perMember.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-1">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length] }}
                      />
                      <span className="text-xs text-gray-600">{m.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 奢りヒートマップ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-800">奢りヒートマップ</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">行 = 奢った人、列 = 奢られた人（回数）</p>
              <div className="overflow-x-auto -mx-2">
                <table className="text-[10px] sm:text-xs w-full min-w-0">
                  <thead>
                    <tr>
                      <th className="text-left p-0.5 sm:p-1 w-10 sm:w-14"></th>
                      {stats.perMember.map((m) => (
                        <th key={m.id} className="p-0.5 sm:p-1 text-center text-gray-500 whitespace-nowrap">
                          {m.name.slice(0, 2)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.perMember.map((payer) => (
                      <tr key={payer.id}>
                        <td className="p-0.5 sm:p-1 font-medium text-slate-800 whitespace-nowrap">{payer.name.slice(0, 2)}</td>
                        {stats.perMember.map((receiver) => {
                          const count = stats.heatmap[payer.id]?.[receiver.id] ?? 0;
                          return (
                            <td key={receiver.id} className="p-0.5 sm:p-1 text-center">
                              {payer.id === receiver.id ? (
                                <span className="text-gray-300">-</span>
                              ) : (
                                <span className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 text-[10px] sm:text-xs rounded ${
                                  count >= 10 ? 'bg-amber-500 text-white font-bold' :
                                  count >= 5 ? 'bg-amber-200 text-amber-800' :
                                  count > 0 ? 'bg-amber-50 text-amber-700' : 'text-gray-300'
                                }`}>
                                  {count}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 連続記録 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-800">連続記録</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.streaks
                  .filter((s) => s.maxStreak > 0)
                  .sort((a, b) => b.maxStreak - a.maxStreak)
                  .map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-1 gap-2">
                      <span className="text-sm text-slate-800 shrink-0">{s.name}</span>
                      <div className="flex items-center gap-2 sm:gap-3 text-right">
                        <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap">
                          {s.currentStreak > 0 ? `${s.currentStreak}連続中` : ''}
                        </span>
                        <span className="font-bold text-sm text-slate-800 whitespace-nowrap">最大{s.maxStreak}連続</span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* 記録 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-800">記録</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.records.map((record) => (
                  <div key={record.label} className="flex items-center justify-between py-2 border-b last:border-b-0 gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{record.label}</p>
                      {record.detail && <p className="text-xs text-gray-500 truncate">{record.detail}</p>}
                    </div>
                    <p className="font-bold text-sm text-slate-800 shrink-0">
                      {typeof record.value === 'number' && record.label.includes('額')
                        ? `¥${record.value.toLocaleString()}`
                        : record.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
