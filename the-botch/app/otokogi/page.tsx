"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Swords, Trophy } from 'lucide-react';
import {
  useOtokogiEvents,
  useOtokogiRanking,
  type OtokogiRankingEntry,
  type OtokogiRankingMetric,
} from '@/hooks/use-otokogi';
import { useScrollRestoration } from '@/hooks/use-scroll-restoration';
import { getCurrentFiscalYear } from '@/lib/date-utils';

function OtokogiHistorySkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg p-3 border shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex gap-1 pt-0.5">
                  <Skeleton className="w-5 h-5 rounded-full" />
                  <Skeleton className="w-5 h-5 rounded-full" />
                  <Skeleton className="w-5 h-5 rounded-full" />
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OtokogiRankingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 sm:gap-3">
          <Skeleton className="w-7 h-7 sm:w-8 sm:h-8 rounded-full shrink-0" />
          <Skeleton className="w-7 h-7 sm:w-8 sm:h-8 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-4 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

type Tab = 'history' | 'ranking';

const RANKING_METRIC_LABELS: { key: OtokogiRankingMetric; label: string; shortLabel: string }[] = [
  { key: 'total', label: '支払額', shortLabel: '支払額' },
  { key: 'rate', label: '男気率', shortLabel: '男気率' },
  { key: 'clutch', label: 'クラッチ力', shortLabel: 'クラッチ' },
  { key: 'streak', label: 'ストリーク', shortLabel: '連続' },
  { key: 'generosity', label: '気前度', shortLabel: '気前' },
];

const yenFmt = new Intl.NumberFormat('ja-JP');

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatYen(value: number | null): string {
  if (value === null) return '—';
  return `¥${yenFmt.format(value)}`;
}

function metricPrimary(entry: OtokogiRankingEntry, metric: OtokogiRankingMetric): string {
  switch (metric) {
    case 'total':
      return `¥${entry.totalPaid.toLocaleString()}`;
    case 'rate':
      return formatPercent(entry.otokogiRate);
    case 'clutch':
      return formatPercent(entry.clutchRate);
    case 'streak':
      return `最長${entry.maxStreak}回`;
    case 'generosity':
      return formatYen(entry.generosity);
  }
}

function metricSubline(entry: OtokogiRankingEntry, metric: OtokogiRankingMetric): string {
  switch (metric) {
    case 'total':
      return `${entry.count}回`;
    case 'rate':
      return `払 ¥${entry.totalPaid.toLocaleString()} / 参 ¥${entry.participatedTotal.toLocaleString()}`;
    case 'clutch':
      return `${entry.clutchParticipatedCount}回中${entry.clutchPaidCount}回`;
    case 'streak':
      return `現在 ${entry.currentStreak}回連続`;
    case 'generosity':
      return `${entry.count}回払 / 累計¥${entry.totalPaid.toLocaleString()}`;
  }
}

export default function OtokogiPage() {
  const currentFiscalYear = getCurrentFiscalYear();
  const [activeTab, setActiveTab] = useState<Tab>('history');
  // デフォルトは今年度 (fiscal year, 11月開始)。全期間を見たい場合は 'all' を選択。
  const [yearFilter, setYearFilter] = useState<string>(String(currentFiscalYear));
  const [rankingMetric, setRankingMetric] = useState<OtokogiRankingMetric>('total');

  const years = Array.from({ length: 4 }, (_, i) => currentFiscalYear - i);

  const {
    data: eventsData,
    isLoading: eventsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useOtokogiEvents(yearFilter);

  const events = eventsData?.pages.flatMap((page) => page.data) ?? [];

  const { data: rankingResponse, isLoading: rankingLoading } = useOtokogiRanking(
    yearFilter,
    rankingMetric
  );
  const rankingData = rankingResponse?.ranking ?? [];
  const clutchThreshold = rankingResponse?.clutchThreshold ?? 50000;

  const loading = activeTab === 'history' ? eventsLoading : rankingLoading;

  useScrollRestoration(!eventsLoading);

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
        <Link
          href="/otokogi/stats"
          className="flex-1 py-2 text-sm font-medium rounded-md transition text-gray-600 hover:text-gray-900 text-center"
        >
          統計
        </Link>
      </div>

      {/* 年度フィルタ */}
      <div className="flex gap-2 mb-4">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-auto">
            <SelectValue>{yearFilter === 'all' ? '全期間' : `${yearFilter}年度`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全期間</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}年度</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 履歴タブ */}
      {activeTab === 'history' && (
        <div>
          {eventsLoading ? (
            <OtokogiHistorySkeleton />
          ) : events.length === 0 ? (
            <EmptyState
              icon={Swords}
              title="該当する男気イベントがありません"
              description={yearFilter === 'all' ? '最初の勝負を記録してみましょう' : '別の年度を選ぶか、新しく記録してください'}
              action={{ label: '+ 記録する', href: '/otokogi/new' }}
            />
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
                        <p className="font-medium text-slate-800 truncate">
                          {event.eventName}
                          {event.hasAlbum && (
                            <span
                              className="ml-1.5 text-xs align-middle text-gray-500"
                              title="写真あり"
                              aria-label="写真あり"
                            >
                              📷
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDate(event.eventDate)} / {event.payer.name}
                          {event.place && ` / ${event.place}`}
                        </p>
                        {event.memo && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{event.memo}</p>
                        )}
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
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <p className="font-bold text-slate-800 text-sm">¥{event.amount.toLocaleString()}</p>
                      <Button variant="outline" size="sm" asChild className="h-6 px-2 text-xs">
                        <Link href={`/otokogi/${event.id}/edit`}>編集</Link>
                      </Button>
                    </div>
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
            <CardTitle className="text-slate-800">男気ランキング</CardTitle>
            {/* 指標切替タブ */}
            <div className="flex gap-1 mt-2 overflow-x-auto -mx-1 px-1">
              {RANKING_METRIC_LABELS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setRankingMetric(m.key)}
                  className={`px-3 py-1 text-xs rounded-full border transition whitespace-nowrap ${
                    rankingMetric === m.key
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-slate-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-1.5">
              {rankingMetric === 'total' && '期間中に自分が払った金額の合計'}
              {rankingMetric === 'rate' && '参加した会の総額に対して自分がどれだけ払ったか'}
              {rankingMetric === 'clutch' && `高額イベント（¥${clutchThreshold.toLocaleString()}以上）での payer 率`}
              {rankingMetric === 'streak' && '同じ人が連続で払った最長回数（と現在の連続数）'}
              {rankingMetric === 'generosity' && '1回あたりの平均 payer 額'}
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <OtokogiRankingSkeleton />
            ) : rankingData.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="ランキングデータがありません"
                description="男気イベントを記録するとランキングが表示されます"
                action={{ label: '+ 記録する', href: '/otokogi/new' }}
              />
            ) : (
              <div className="space-y-3">
                {rankingData.map((member) => (
                  <div key={member.memberId} className="flex items-start gap-2 sm:gap-3">
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
                      <p className="text-[11px] text-gray-500 truncate">{metricSubline(member, rankingMetric)}</p>
                      {/* 他指標の併記（コンパクト） */}
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[10px] text-gray-400">
                        {RANKING_METRIC_LABELS.filter((m) => m.key !== rankingMetric).map((m) => (
                          <span key={m.key}>
                            {m.shortLabel}: <span className="text-gray-500">{metricPrimary(member, m.key)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="font-bold text-sm sm:text-base text-slate-800 shrink-0">
                      {metricPrimary(member, rankingMetric)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
