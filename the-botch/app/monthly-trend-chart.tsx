"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export type MonthlyTrendData = {
  month: string;
  otokogi: number;
  warikan: number;
};

function shortMonth(month: string) {
  const parts = month.split('-');
  return `${parseInt(parts[1])}月`;
}

function formatYen(value: number) {
  if (value >= 10000) return `${Math.round(value / 10000)}万`;
  return `¥${value.toLocaleString()}`;
}

export default function MonthlyTrendChart({ data }: { data: MonthlyTrendData[] }) {
  const hasData = data.some((d) => d.otokogi > 0 || d.warikan > 0);

  if (!hasData) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">まだデータがありません</p>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-500" />
          男気
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
          割り勘
        </span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
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
              formatter={(value, name) => [
                `¥${Number(value).toLocaleString()}`,
                name === 'otokogi' ? '男気' : '割り勘',
              ]}
              labelFormatter={(label) => {
                const [y, m] = String(label).split('-');
                return `${y}年${parseInt(m)}月`;
              }}
            />
            <Bar dataKey="warikan" stackId="a" fill="#3b82f6" name="warikan" />
            <Bar dataKey="otokogi" stackId="a" fill="#f59e0b" radius={[2, 2, 0, 0]} name="otokogi" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
