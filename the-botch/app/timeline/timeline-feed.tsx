"use client";

import { useMemo } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Yen } from '@/components/ui/yen';
import { EVENT_TYPE_LABELS } from '@/lib/constants';

type Member = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

type TimelineItem = {
  id: string;
  type: 'otokogi' | 'warikan_settlement' | 'event_created' | 'warikan_closed';
  occurredAt: string;
  actor: Member | null;
  payload: Record<string, unknown>;
  href: string;
};

type TimelineResponse = {
  data: TimelineItem[];
  nextCursor: string | null;
};

const TYPE_META: Record<TimelineItem['type'], { icon: string; label: string; chipBg: string }> = {
  otokogi: { icon: '🥇', label: '男気', chipBg: 'bg-amber-100 text-amber-700' },
  warikan_settlement: { icon: '💰', label: '精算', chipBg: 'bg-blue-100 text-blue-700' },
  event_created: { icon: '📅', label: 'イベント', chipBg: 'bg-purple-100 text-purple-700' },
  warikan_closed: { icon: '✅', label: '完了', chipBg: 'bg-green-100 text-green-700' },
};

function formatRelative(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'たった今';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}日前`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}週間前`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}ヶ月前`;
  const yr = Math.floor(day / 365);
  return `${yr}年前`;
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${dd} ${hh}:${mm}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function sectionLabel(iso: string, now: Date): string {
  const today0 = startOfDay(now);
  const t0 = startOfDay(new Date(iso));
  const diffDays = Math.round((today0 - t0) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (diffDays <= 7) return '今週';
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function renderText(item: TimelineItem): React.ReactNode {
  const actorName = item.actor?.name ?? '誰か';
  if (item.type === 'otokogi') {
    const amount = Number(item.payload.amount ?? 0);
    const place = (item.payload.place as string | null) ?? null;
    const eventName = (item.payload.eventName as string) ?? '男気';
    return (
      <>
        <span className="font-medium">{actorName}</span>
        {' が '}
        {place ? (
          <>
            <span className="text-slate-700">{place}</span>
            {' で '}
          </>
        ) : null}
        <Yen value={amount} className="font-bold" />
        {' 支払いました'}
        <span className="ml-1 text-xs text-gray-500">#{eventName}</span>
      </>
    );
  }
  if (item.type === 'warikan_settlement') {
    const amount = Number(item.payload.amount ?? 0);
    const to = item.payload.toMember as Member | null;
    const phase = (item.payload.phase as string) === 'received' ? '受領' : '送金';
    const warikanName = (item.payload.warikanEventName as string) ?? '';
    return (
      <>
        <span className="font-medium">{actorName}</span>
        {' が '}
        <span className="font-medium">{to?.name ?? '誰か'}</span>
        {' に '}
        <Yen value={amount} className="font-bold" />
        {' を'}
        {phase}
        {warikanName ? <span className="ml-1 text-xs text-gray-500">#{warikanName}</span> : null}
      </>
    );
  }
  if (item.type === 'event_created') {
    const title = (item.payload.title as string) ?? 'イベント';
    const date = (item.payload.date as string) ?? null;
    const type = (item.payload.eventType as string) ?? 'OTHER';
    const dateStr = date ? new Date(date).toLocaleDateString('ja-JP') : '';
    return (
      <>
        <span className="font-medium">{actorName}</span>
        {' が '}
        <span className="font-medium">{title}</span>
        {' を追加'}
        {dateStr ? ` (${dateStr})` : ''}
        <span className="ml-1 text-xs text-gray-500">
          #{EVENT_TYPE_LABELS[type as keyof typeof EVENT_TYPE_LABELS] ?? type}
        </span>
      </>
    );
  }
  if (item.type === 'warikan_closed') {
    const eventName = (item.payload.eventName as string) ?? '割り勘';
    return (
      <>
        <span className="font-medium">{eventName}</span>
        {' の精算が完了'}
      </>
    );
  }
  return null;
}

async function fetchTimeline({ pageParam }: { pageParam: string | null }): Promise<TimelineResponse> {
  const params = new URLSearchParams();
  if (pageParam) params.set('before', pageParam);
  const res = await fetch(`/api/timeline?${params.toString()}`);
  if (!res.ok) throw new Error('タイムラインの取得に失敗しました');
  return res.json() as Promise<TimelineResponse>;
}

export default function TimelineFeed() {
  const now = useMemo(() => new Date(), []);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ['timeline'],
    queryFn: fetchTimeline,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const items = useMemo(() => {
    const flat = data?.pages.flatMap((p) => p.data) ?? [];
    // 日付セクション見出しの差し込み
    const sections: Array<{ label: string; items: TimelineItem[] }> = [];
    for (const it of flat) {
      const label = sectionLabel(it.occurredAt, now);
      const last = sections[sections.length - 1];
      if (last && last.label === label) {
        last.items.push(it);
      } else {
        sections.push({ label, items: [it] });
      }
    }
    return sections;
  }, [data, now]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-500">読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-red-600">
            エラー: {error instanceof Error ? error.message : '不明なエラー'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-500">まだアクティビティがありません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3" data-testid="timeline-feed">
      {items.map((section) => (
        <div key={section.label} className="grid gap-2">
          <h2 className="text-xs font-semibold text-gray-500 px-1 sticky top-14 bg-gray-50 py-1 z-10">
            {section.label}
          </h2>
          {section.items.map((item) => {
            const meta = TYPE_META[item.type];
            return (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-slate-300 transition"
                data-timeline-item={item.type}
              >
                <div className="flex gap-3">
                  {item.actor ? (
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${item.actor.colorBg} ${item.actor.colorText}`}
                    >
                      {item.actor.initial}
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm shrink-0">
                      ?
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.chipBg}`}
                      >
                        <span aria-hidden>{meta.icon}</span>
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatRelative(item.occurredAt, now)} / {formatAbsolute(item.occurredAt)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 leading-relaxed break-words">
                      {renderText(item)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ))}
      <div className="flex justify-center pt-2">
        {hasNextPage ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? '読み込み中...' : 'もっと見る'}
          </Button>
        ) : (
          <p className="text-xs text-gray-400">これ以上ありません</p>
        )}
      </div>
    </div>
  );
}
