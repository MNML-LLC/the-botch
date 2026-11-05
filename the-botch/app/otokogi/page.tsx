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
import { RankingMvpList } from '@/components/otokogi/ranking-mvp-list';
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
  return (
    <div className="space-y-3">
      {/* MVP 大カード skeleton (Issue #401) */}
      <div className="rounded-xl bg-white border p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <Skeleton className="w-14 sm:w-16 h-14 shrink-0" />
          <Skeleton className="w-14 h-14 sm:w-16 sm:h-16 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-7 w-40" />
            <div className="flex gap-1 pt-0.5">
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
          </div>
        </div>
      </div>
      {/* 2 位以下の行 skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 sm:gap-3 bg-white rounded-lg border p-2.5 sm:p-3">
            <Skeleton className="w-8 h-8 rounded-full shrink-0" />
            <Skeleton className="w-9 h-9 sm:w-10 sm:h-10 rounded-full shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-4 w-20 shrink-0" />
          </div>
        ))}
      </div>
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

  // Issue #401: ランキング 1 位 (MVP) を大カードに、2 位以下は行表示。
  // 各行に期間フィルタ内判定の称号 chips を併記する。
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

      {/* ランキングタブ (Issue #401 CEO 2026-11-05 再方針:
          MVP 大カード 1 枚 + 2 位以下の中サイズ行表示 + 各行に称号 chips に統合) */}
      {activeTab === 'ranking' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-800">男気ランキング</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              期間フィルタ内の支払総額 DESC。1 位は MVP として大きく、称号は各行に chip で併記。
            </p>
          </CardHeader>
          <CardContent>
            {rankingLoading ? (
              <OtokogiRankingSkeleton />
            ) : rankingData.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="期間内に男気の記録なし"
                description="男気イベントを記録するとランキングが表示されます"
                action={{ label: '+ 記録する', href: '/otokogi/new' }}
              />
            ) : (
              <RankingMvpList
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
