"use client";

import { useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';

type Member = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

type ParticipantMember = {
  id: string;
  name: string;
};

type WarikanEvent = {
  id: string;
  eventName: string;
  status: 'ENTERING' | 'PAYING' | 'CLOSED';
  detailDeadline: string | null;
  paymentDeadline: string | null;
  memo: string | null;
  createdAt: string;
  manager: Member | null;
  participants: { member: ParticipantMember }[];
  _count: { expenses: number; settlements: number };
};

type WarikanResponse = {
  data: WarikanEvent[];
  nextCursor: string | null;
};

function statusBadge(status: string) {
  switch (status) {
    case 'ENTERING':
      return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">明細入力中</span>;
    case 'PAYING':
      return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">支払待ち</span>;
    case 'CLOSED':
      return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">クローズ</span>;
    default:
      return null;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'ENTERING': return '明細入力中';
    case 'PAYING': return '支払待ち';
    case 'CLOSED': return 'クローズ';
    default: return status;
  }
}

export default function WarikanListPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');

  const fetchWarikanEvents = useCallback(async ({ pageParam }: { pageParam: string | null }) => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (yearFilter !== 'all') params.set('year', yearFilter);
    if (pageParam) params.set('cursor', pageParam);

    const res = await fetch(`/api/warikan?${params.toString()}`);
    if (!res.ok) throw new Error('割り勘イベントの取得に失敗しました');
    return res.json() as Promise<WarikanResponse>;
  }, [statusFilter, yearFilter]);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['warikan', statusFilter, yearFilter],
    queryFn: fetchWarikanEvents,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 5 * 60 * 1000, // 5分キャッシュ
    gcTime: 10 * 60 * 1000,   // 10分GC
  });

  const events = data?.pages.flatMap((page) => page.data) ?? [];

  // 年度リスト生成
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-800">割り勘管理</h2>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/warikan/import">Walica取込</Link>
          </Button>
          <Button asChild className="bg-slate-800 hover:bg-slate-700">
            <Link href="/warikan/new">+ 新規作成</Link>
          </Button>
        </div>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-auto">
            <SelectValue>{statusFilter === 'all' ? '全てのステータス' : statusLabel(statusFilter)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全てのステータス</SelectItem>
            <SelectItem value="ENTERING">明細入力中</SelectItem>
            <SelectItem value="PAYING">支払待ち</SelectItem>
            <SelectItem value="CLOSED">クローズ</SelectItem>
          </SelectContent>
        </Select>

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

      {/* リスト */}
      {isLoading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500">該当する割り勘イベントがありません</p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Link key={event.id} href={`/warikan/${event.id}`}>
              <Card className="hover:border-amber-300 transition cursor-pointer">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-800">{event.eventName}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        管理: {event.manager?.name ?? '未設定'}
                      </p>
                    </div>
                    {statusBadge(event.status)}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>{event.participants.length}人参加</span>
                    <span>明細 {event._count.expenses}件</span>
                    {event.paymentDeadline && (
                      <span>期日: {new Date(event.paymentDeadline).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {event.participants.map((p) => (
                      <span key={p.member.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {p.member.name}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {/* もっと見るボタン */}
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? '読み込み中...' : 'もっと見る'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
