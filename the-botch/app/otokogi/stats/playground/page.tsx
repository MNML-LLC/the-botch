"use client";

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { useOtokogiStats } from '@/hooks/use-otokogi';

type PerMember = {
  id: string;
  name: string;
  count: number;
  participated: number;
  totalPaid: number;
  winRate: number;
};

type PlaygroundStatsData = {
  perMember: PerMember[];
  heatmap: Record<string, Record<string, number>>;
  deviationScores: { id: string; name: string; totalPaid: number; score: number }[];
  cumulativeRace: { month: string; [memberId: string]: string | number }[];
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

export default function PlaygroundPage() {
  const { data: stats } = useOtokogiStats<PlaygroundStatsData>('all');

  const deviationChartData = stats?.deviationScores
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((m) => ({
      name: m.name,
      score: m.score,
      fill: m.score >= 60 ? '#d97706' : m.score >= 40 ? '#334155' : '#9ca3af',
    })) ?? [];

  return (
    <div className="space-y-4">
      {/* 上部：本流へ戻るリンク（SP 対応） */}
      <div>
        <Link
          href="/otokogi"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← 統計に戻る
        </Link>
      </div>

      {/* お遊びヘッダー */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
        <p className="text-base font-bold text-amber-800">お遊び統計</p>
        <p className="mt-0.5 text-xs text-amber-600">本流とは別の、ちょっと遊び心のある統計たち</p>
      </div>

      {!stats ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
