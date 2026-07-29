"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Swords, Wallet } from 'lucide-react';
import { useMemberDetail, type MemberProfileWarikanEvent } from '@/hooks/use-members';
import { WARIKAN_STATUS_LABELS } from '@/lib/constants';

function formatShortDate(date: string) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function warikanDisplayDate(event: MemberProfileWarikanEvent) {
  return event.displayDate ?? event.paymentDeadline ?? event.detailDeadline ?? event.createdAt;
}

function warikanStatusBadge(status: MemberProfileWarikanEvent['status']) {
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

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <Skeleton className="w-14 h-14 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-40 rounded-md" />
      <Skeleton className="h-40 rounded-md" />
    </div>
  );
}

export default function MemberProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const { data: member, isPending, isError } = useMemberDetail(id);

  if (isPending) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/members" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
          <h2 className="text-xl font-bold text-slate-800">メンバー詳細</h2>
        </div>
        <ProfileSkeleton />
      </div>
    );
  }

  if (isError || !member) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/members" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
          <h2 className="text-xl font-bold text-slate-800">メンバー詳細</h2>
        </div>
        <p className="text-sm text-red-500">メンバー情報の取得に失敗しました</p>
      </div>
    );
  }

  const otokogiEvents = member.otokogiParticipations.map((p) => p.otokogiEvent);
  const warikanEvents = member.warikanParticipations.map((p) => p.warikanEvent);
  const { stats } = member;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/members" className="text-gray-500 hover:text-gray-700 shrink-0">← 戻る</Link>
          <h2 className="text-xl font-bold text-slate-800 truncate">メンバー詳細</h2>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/members/${id}/edit`}>編集</Link>
        </Button>
      </div>

      {/* プロフィール + 統計 */}
      <Card className="mb-4">
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${member.colorBg} ${member.colorText}`}>
              {member.initial}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-slate-800 text-lg truncate">{member.name}</p>
                {!member.isActive && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">非アクティブ</span>
                )}
              </div>
              <p className="text-sm text-gray-500 truncate">{member.fullName}</p>
              {member.paypayId && (
                <p className="text-xs text-red-500 font-mono mt-0.5">@{member.paypayId}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="text-center rounded-md border border-gray-200 py-2">
              <p className="text-xs text-gray-500">男気参加</p>
              <p className="font-bold text-slate-800 mt-0.5">{stats.otokogiParticipationCount}<span className="text-xs font-normal text-gray-500 ml-0.5">回</span></p>
            </div>
            <div className="text-center rounded-md border border-gray-200 py-2">
              <p className="text-xs text-gray-500">割り勘参加</p>
              <p className="font-bold text-slate-800 mt-0.5">{stats.warikanParticipationCount}<span className="text-xs font-normal text-gray-500 ml-0.5">回</span></p>
            </div>
            <div className="text-center rounded-md border border-gray-200 py-2">
              <p className="text-xs text-gray-500">累計支払額</p>
              <p className="font-bold text-slate-800 mt-0.5">¥{stats.totalPaid.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="text-xs text-gray-500 rounded-md bg-gray-50 px-3 py-2">
              男気で支払った額
              <span className="block font-semibold text-slate-700 mt-0.5">
                ¥{stats.otokogiPaidTotal.toLocaleString()}
                <span className="text-xs font-normal text-gray-500 ml-1">/ {stats.otokogiPaidCount}件</span>
              </span>
            </div>
            <div className="text-xs text-gray-500 rounded-md bg-gray-50 px-3 py-2">
              割り勘で立替えた額
              <span className="block font-semibold text-slate-700 mt-0.5">
                ¥{stats.warikanPaidTotal.toLocaleString()}
                <span className="text-xs font-normal text-gray-500 ml-1">/ {stats.warikanPaidCount}件</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 参加した男気イベント */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-slate-800 text-base">参加した男気イベント（{otokogiEvents.length}件）</CardTitle>
        </CardHeader>
        <CardContent>
          {otokogiEvents.length === 0 ? (
            <EmptyState
              icon={Swords}
              title="参加した男気イベントがありません"
            />
          ) : (
            <div className="space-y-2">
              {otokogiEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/otokogi/${event.id}/edit`}
                  className="block rounded-lg border bg-white p-3 shadow-sm hover:border-slate-400 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${event.payer.colorBg} ${event.payer.colorText}`}>
                        {event.payer.initial}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{event.eventName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatShortDate(event.eventDate)} / 支払: {event.payer.name}
                          {event.place && ` / ${event.place}`}
                        </p>
                      </div>
                    </div>
                    <p className="font-bold text-slate-800 text-sm shrink-0">¥{event.amount.toLocaleString()}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 参加した割り勘イベント */}
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-800 text-base">参加した割り勘イベント（{warikanEvents.length}件）</CardTitle>
        </CardHeader>
        <CardContent>
          {warikanEvents.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="参加した割り勘イベントがありません"
            />
          ) : (
            <div className="space-y-2">
              {warikanEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/warikan/${event.id}`}
                  className="block rounded-lg border bg-white p-3 shadow-sm hover:border-slate-400 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{event.eventName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatShortDate(warikanDisplayDate(event))}</p>
                    </div>
                    <div className="shrink-0">{warikanStatusBadge(event.status)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
