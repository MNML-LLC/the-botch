"use client";

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Swords, Trophy } from 'lucide-react';
import { useOtokogiBadges, useOtokogiEvents, useOtokogiRanking } from '@/hooks/use-otokogi';
import { useScrollRestoration } from '@/hooks/use-scroll-restoration';
import { Yen } from '@/components/ui/yen';
import { formatDateBoth } from '@/lib/date-utils';
import type { PeriodState } from '@/lib/date-utils';
import { PeriodFilter, DEFAULT_PERIOD_STATE } from '@/components/ui/period-filter';
import { ClutchBadge } from '@/components/otokogi/clutch-badge';
import { RankingBarChart } from '@/components/otokogi/ranking-bar-chart';
import { StatsContent } from './stats-content';

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
  // Issue #401: 横棒グラフ skeleton。1 位は hero (大きめの棒・アバター)、
  // 2-3 位は medium、4-6 位は compact。
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => {
        const isHero = i === 0;
        return (
          <div key={i} className="rounded-lg border bg-white p-2.5 sm:p-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <Skeleton className={isHero ? 'w-10 sm:w-11 h-9' : 'w-8 h-8 rounded-full'} />
              <Skeleton
                className={isHero ? 'w-11 h-11 sm:w-12 sm:h-12 rounded-full' : 'w-8 h-8 sm:w-9 sm:h-9 rounded-full'}
              />
              <div className="flex-1 min-w-0 space-y-1">
                <Skeleton className={isHero ? 'h-4 w-24' : 'h-3 w-20'} />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className={isHero ? 'h-5 w-24' : 'h-4 w-16'} />
            </div>
            <Skeleton className={`mt-2 w-full ${isHero ? 'h-4' : 'h-2.5'} rounded-full`} />
          </div>
        );
      })}
    </div>
  );
}

type Tab = 'history' | 'ranking' | 'stats';

const TABS: { key: Tab; label: string }[] = [
  { key: 'history', label: '履歴' },
  { key: 'ranking', label: 'ランキング' },
  { key: 'stats', label: '統計' },
];

function parseTab(raw: string | null): Tab {
  if (raw === 'ranking' || raw === 'stats' || raw === 'history') return raw;
  return 'history';
}

function OtokogiPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = useMemo(() => parseTab(searchParams.get('tab')), [searchParams]);

  const setActiveTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'history') {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const query = params.toString();
      router.replace(`/otokogi${query ? `?${query}` : ''}`, { scroll: false });
    },
    [router, searchParams],
  );

  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD_STATE);

  const {
    data: eventsData,
    isLoading: eventsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useOtokogiEvents(period);

  const events = eventsData?.pages.flatMap((page) => page.data) ?? [];

  const { data: rankingResponse, isLoading: rankingLoading } = useOtokogiRanking(period);
  const rankingData = rankingResponse?.ranking ?? [];

  // Issue #368 / #401: 各行の称号 chips に使うバッジマップ + 期間ラベル
  const { badgesByMember, periodLabel } = useOtokogiBadges(period);

  useScrollRestoration(!eventsLoading);


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
        {TABS.map((tab) => (
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

      {/* 期間フィルタ（3 tab 共通） */}
      <div className="mb-4">
        <PeriodFilter value={period} onChange={setPeriod} accent="otokogi" />
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
              description={period.period === 'all' ? '最初の勝負を記録してみましょう' : '別の期間を選ぶか、新しく記録してください'}
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
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 break-words line-clamp-2">
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
                          <ClutchBadge amount={event.amount} className="ml-1.5 align-middle" />
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 break-words">
                          <span className="tabular-nums">{formatDateBoth(event.eventDate)}</span> / {event.payer.name}
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
                      <Yen value={event.amount} size="sm" className="font-bold text-slate-800" />
                      <Button variant="outline" size="sm" asChild className="min-h-[44px] px-3 text-xs">
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

      {/* ランキングタブ (Issue #401: 横棒グラフで視覚化 / CEO 2026-11-05) */}
      {activeTab === 'ranking' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-800">男気ランキング</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              期間フィルタ内の支払総額を横棒グラフで比較。棒の長さ = 1 位との相対比率。
            </p>
          </CardHeader>
          <CardContent>
            {rankingLoading ? (
              <OtokogiRankingSkeleton />
            ) : rankingData.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="ランキングデータがありません"
                description="男気イベントを記録するとランキングが表示されます"
                action={{ label: '+ 記録する', href: '/otokogi/new' }}
              />
            ) : (
              <RankingBarChart
                periodLabel={periodLabel}
                ranking={rankingData}
                badgesByMember={badgesByMember}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* 統計タブ (Issue #389: /otokogi/stats を統合) */}
      {activeTab === 'stats' && <StatsContent period={period} />}
    </div>
  );
}

export default function OtokogiPage() {
  return (
    <Suspense fallback={<OtokogiHistorySkeleton />}>
      <OtokogiPageInner />
    </Suspense>
  );
}
