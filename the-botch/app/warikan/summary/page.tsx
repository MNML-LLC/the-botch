"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Wallet } from 'lucide-react';
import {
  useWarikanMemberSummary,
  type WarikanMemberSummaryMember,
} from '@/hooks/use-warikan';

const fmt = new Intl.NumberFormat('ja-JP');

function formatYen(value: number): string {
  return `¥${fmt.format(value)}`;
}

function MemberChip({ member }: { member: WarikanMemberSummaryMember }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${member.colorBg} ${member.colorText}`}
      >
        {member.initial}
      </span>
      <span className="text-xs font-medium text-slate-800">{member.name}</span>
    </span>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function WarikanSummaryPage() {
  const [yearFilter, setYearFilter] = useState('all');

  const { data, isLoading, isFetching, error } = useWarikanMemberSummary(yearFilter);

  const memberMap = useMemo(() => {
    const map = new Map<string, WarikanMemberSummaryMember>();
    for (const m of data?.members ?? []) map.set(m.id, m);
    return map;
  }, [data?.members]);

  // 行列表示用: matrix[fromId][toId] = amount
  const matrix = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const b of data?.balances ?? []) {
      if (!m.has(b.fromMemberId)) m.set(b.fromMemberId, new Map());
      m.get(b.fromMemberId)!.set(b.toMemberId, b.amount);
    }
    return m;
  }, [data?.balances]);

  const members = data?.members ?? [];
  const balances = data?.balances ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-800">累積収支</h2>
        <Link href="/warikan" className="text-xs text-gray-500 hover:text-slate-700">
          ← 割り勘一覧に戻る
        </Link>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        クローズ済みの割り勘イベントの精算を横断集計した、メンバー間の純収支です。
      </p>

      {/* フィルタ */}
      <div className="flex items-center gap-2 mb-4">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-auto">
            <SelectValue>{yearFilter === 'all' ? '全期間' : `${yearFilter}年`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全期間</SelectItem>
            {(data?.availableYears ?? []).map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}年
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isFetching && !isLoading && (
          <span className="text-xs text-gray-400">更新中...</span>
        )}
      </div>

      {isLoading ? (
        <SummarySkeleton />
      ) : error ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-red-500">
              データの取得に失敗しました: {error.message}
            </p>
          </CardContent>
        </Card>
      ) : balances.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="収支データがありません"
          description={
            yearFilter === 'all'
              ? 'クローズ済みの割り勘イベントがまだありません'
              : 'この年にクローズされた割り勘イベントがありません'
          }
        />
      ) : (
        <div className="space-y-4">
          {/* 概要 */}
          <div className="flex gap-3 text-center">
            <div className="flex-1">
              <p className="text-lg font-bold text-slate-800">{data?.eventCount ?? 0}</p>
              <p className="text-[10px] text-gray-500">対象イベント</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold text-slate-800">{balances.length}</p>
              <p className="text-[10px] text-gray-500">送金指示</p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800 truncate">
                {formatYen(data?.totalAmount ?? 0)}
              </p>
              <p className="text-[10px] text-gray-500">総送金額</p>
            </div>
          </div>

          {/* 送金リスト */}
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-800 text-base">送金指示</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                ネット化済み。同じペアの往復送金は差し引きしています。
              </p>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-gray-100">
                {balances.map((b) => {
                  const from = memberMap.get(b.fromMemberId);
                  const to = memberMap.get(b.toMemberId);
                  if (!from || !to) return null;
                  return (
                    <li
                      key={`${b.fromMemberId}-${b.toMemberId}`}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2">
                        <MemberChip member={from} />
                        <span className="text-xs text-gray-400">→</span>
                        <MemberChip member={to} />
                      </div>
                      <span className="text-sm font-semibold text-slate-800 tabular-nums">
                        {formatYen(b.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* 収支マトリクス */}
          {members.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-slate-800 text-base">収支マトリクス</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">
                  行 = 支払う人 / 列 = 受け取る人
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto -mx-2">
                  <table className="text-xs w-full border-collapse min-w-max">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="sticky left-0 z-10 bg-white text-left p-2 font-medium text-gray-500 whitespace-nowrap min-w-[80px]">
                          支払う ＼ 受取
                        </th>
                        {members.map((m) => (
                          <th
                            key={m.id}
                            className="p-2 text-center font-medium text-slate-800 whitespace-nowrap min-w-[76px]"
                          >
                            {m.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((from) => (
                        <tr key={from.id} className="border-b border-gray-100 last:border-0">
                          <td className="sticky left-0 z-10 bg-white p-2 whitespace-nowrap font-medium text-slate-800">
                            {from.name}
                          </td>
                          {members.map((to) => {
                            if (from.id === to.id) {
                              return (
                                <td
                                  key={to.id}
                                  className="p-2 text-center text-gray-300 tabular-nums"
                                >
                                  —
                                </td>
                              );
                            }
                            const amount = matrix.get(from.id)?.get(to.id) ?? 0;
                            return (
                              <td key={to.id} className="p-2 text-center tabular-nums">
                                {amount > 0 ? (
                                  <span className="font-semibold text-red-500">
                                    {formatYen(amount)}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
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
          )}
        </div>
      )}
    </div>
  );
}
