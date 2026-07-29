"use client";

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
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Wallet } from 'lucide-react';
import { WARIKAN_STATUS_LABELS } from '@/lib/constants';
import { useState } from 'react';
import { useWarikanList } from '@/hooks/use-warikan';

function WarikanListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full shrink-0" />
            </div>
            <div className="flex items-center gap-4 mt-2">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function statusBadge(status: string) {
  switch (status) {
    case 'ENTERING':
      return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{WARIKAN_STATUS_LABELS.ENTERING}</span>;
    case 'PAYING':
      return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{WARIKAN_STATUS_LABELS.PAYING}</span>;
    case 'CLOSED':
      return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{WARIKAN_STATUS_LABELS.CLOSED}</span>;
    default:
      return null;
  }
}

function statusLabel(status: string) {
  if (status in WARIKAN_STATUS_LABELS) {
    return WARIKAN_STATUS_LABELS[status as keyof typeof WARIKAN_STATUS_LABELS];
  }
  return status;
}

export default function WarikanListPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useWarikanList(statusFilter, yearFilter);

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
            <SelectItem value="ENTERING">{WARIKAN_STATUS_LABELS.ENTERING}</SelectItem>
            <SelectItem value="PAYING">{WARIKAN_STATUS_LABELS.PAYING}</SelectItem>
            <SelectItem value="CLOSED">{WARIKAN_STATUS_LABELS.CLOSED}</SelectItem>
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
        <WarikanListSkeleton />
      ) : events.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="該当する割り勘イベントがありません"
          description={statusFilter === 'all' && yearFilter === 'all' ? '新しい割り勘イベントを作成してみましょう' : 'フィルタを変更するか、新規作成してください'}
          action={{ label: '+ 新規作成', href: '/warikan/new' }}
        />
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
                      {event.memo && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{event.memo}</p>
                      )}
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
