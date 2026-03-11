"use client";

import { useState, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// 統計タブのrecharts (~150KB gzipped) を遅延読み込み（初期バンドルから除外）
const StatsSection = dynamic(() => import('./stats-section'), {
  loading: () => <p className="text-sm text-gray-500">統計データを準備中...</p>,
});

type Member = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

type OtokogiEvent = {
  id: string;
  eventDate: string;
  eventName: string;
  amount: number;
  place: string | null;
  hasAlbum: boolean;
  payer: Member;
  participants: { member: Member }[];
};

type OtokogiResponse = {
  data: OtokogiEvent[];
  nextCursor: string | null;
};

type RankingEntry = {
  rank: number;
  memberId: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
  count: number;
  totalPaid: number;
};

type Tab = 'history' | 'ranking' | 'stats';

export default function OtokogiPage() {
  const [activeTab, setActiveTab] = useState<Tab>('history');
  const [yearFilter, setYearFilter] = useState('all');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  // 男気イベント一覧（カーソルベースページネーション）
  const fetchOtokogiEvents = useCallback(async ({ pageParam }: { pageParam: string | null }) => {
    const params = new URLSearchParams();
    if (yearFilter !== 'all') params.set('year', yearFilter);
    if (pageParam) params.set('cursor', pageParam);

    const res = await fetch(`/api/otokogi?${params.toString()}`);
    if (!res.ok) throw new Error('男気イベントの取得に失敗しました');
    return res.json() as Promise<OtokogiResponse>;
  }, [yearFilter]);

  const {
    data: eventsData,
    isLoading: eventsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['otokogi', yearFilter],
    queryFn: fetchOtokogiEvents,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const events = eventsData?.pages.flatMap((page) => page.data) ?? [];

  // ランキングデータ取得（ページネーション対象外）
  const { data: rankingResponse, isLoading: rankingLoading } = useQuery({
    queryKey: ['otokogi-ranking', yearFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (yearFilter !== 'all') params.set('year', yearFilter);
      const res = await fetch(`/api/otokogi/ranking?${params.toString()}`);
      if (!res.ok) throw new Error('ランキングの取得に失敗しました');
      return res.json() as Promise<{ ranking: RankingEntry[] }>;
    },

  });
  const rankingData = rankingResponse?.ranking ?? [];

  const loading = activeTab === 'history' ? eventsLoading : rankingLoading;

  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-slate-800">男気管理</h2>
        <Button asChild className="bg-slate-800 hover:bg-slate-700">
          <Link href="/otokogi/new">+ 記録する</Link>
        </Button>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        {[
          { key: 'history' as Tab, label: '履歴' },
          { key: 'ranking' as Tab, label: 'ランキング' },
          { key: 'stats' as Tab, label: '統計' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              activeTab === tab.key ? 'bg-slate-800 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 年度フィルタ（履歴・ランキング） */}
      {activeTab !== 'stats' && (
        <div className="flex gap-2 mb-4">
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
      )}

      {/* 履歴タブ */}
      {activeTab === 'history' && (
        <div>
          {eventsLoading ? (
            <p className="text-sm text-gray-500">読み込み中...</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-gray-500">該当するイベントがありません</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="bg-white rounded-lg p-3 border shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${event.payer.colorBg} ${event.payer.colorText}`}>
                        {event.payer.initial}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{event.eventName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(event.eventDate)} / {event.payer.name}
                          {event.place && ` / ${event.place}`}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {event.participants.map((p) => (
                            <div
                              key={p.member.id}
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${p.member.colorBg} ${p.member.colorText}`}
                              title={p.member.name}
                            >
                              {p.member.initial}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="font-bold text-slate-800 shrink-0 text-sm">¥{event.amount.toLocaleString()}</p>
                  </div>
                </div>
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
      )}

      {/* ランキングタブ（API から取得） */}
      {activeTab === 'ranking' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-800">支払額ランキング</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-gray-500">読み込み中...</p>
            ) : rankingData.length === 0 ? (
              <p className="text-sm text-gray-500">データがありません</p>
            ) : (
              <div className="space-y-3">
                {rankingData.map((member) => (
                  <div key={member.memberId} className="flex items-center gap-2 sm:gap-3">
                    <span className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold shrink-0 ${
                      member.rank === 1 ? 'bg-amber-100 text-amber-700' : member.rank === 2 ? 'bg-gray-100 text-gray-600' : member.rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'
                    }`}>
                      {member.rank}
                    </span>
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${member.colorBg} ${member.colorText}`}>
                      {member.initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{member.name}</p>
                      <p className="text-xs text-gray-500">{member.count}回</p>
                    </div>
                    <p className="font-bold text-sm sm:text-base text-slate-800 shrink-0">¥{member.totalPaid.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 統計タブ（recharts遅延読み込み） */}
      {activeTab === 'stats' && <StatsSection />}
    </div>
  );
}
