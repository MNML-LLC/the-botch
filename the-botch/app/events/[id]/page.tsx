"use client";

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, Plus, X } from 'lucide-react';
import {
  useEventDetail,
  useUnlinkEventOtokogi,
  useUnlinkEventWarikan,
} from '@/hooks/use-events';

type Member = {
  id: string;
  name: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

type OtokogiItem = {
  id: string;
  eventDate: string;
  eventName: string;
  amount: number;
  place: string | null;
  memo: string | null;
  hasAlbum: boolean;
  payer: Member;
  participants: { member: Member }[];
};

type WarikanItem = {
  id: string;
  eventName: string;
  status: 'ENTERING' | 'PAYING' | 'CLOSED';
  detailDeadline: string | null;
  paymentDeadline: string | null;
  memo: string | null;
  manager: Member | null;
  participants: { member: Member }[];
  _count: { expenses: number };
};

type Tab = 'warikan' | 'otokogi';

function eventTypeLabel(type: string) {
  switch (type) {
    case 'TRIP': return '旅行';
    case 'HANGOUT': return '飲み会';
    case 'ACTIVITY': return 'アクティビティ';
    default: return 'その他';
  }
}

function eventTypeBadgeColor(type: string) {
  switch (type) {
    case 'TRIP': return 'bg-blue-100 text-blue-700';
    case 'HANGOUT': return 'bg-green-100 text-green-700';
    case 'ACTIVITY': return 'bg-purple-100 text-purple-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function warikanStatusBadge(status: string) {
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function MemberAvatar({ member, size = 'sm' }: { member: Member; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'md' ? 'w-9 h-9 text-sm' : 'w-6 h-6 text-[10px]';
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold shrink-0 ${member.colorBg} ${member.colorText}`}
      title={member.name}
    >
      {member.initial}
    </div>
  );
}

function OtokogiCard({
  item,
  onUnlink,
  unlinking,
}: {
  item: OtokogiItem;
  onUnlink: (id: string) => void;
  unlinking: boolean;
}) {
  return (
    <div className="bg-white rounded-lg p-3 border shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          <MemberAvatar member={item.payer} size="md" />
          <div className="min-w-0">
            <Link href={`/otokogi`} className="font-medium text-slate-800 hover:underline truncate block">
              {item.eventName}
            </Link>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatShortDate(item.eventDate)} / {item.payer.name}
              {item.place && ` / ${item.place}`}
            </p>
            {item.memo && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{item.memo}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.participants.map((p) => (
                <MemberAvatar key={p.member.id} member={p.member} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <p className="font-bold text-slate-800 text-sm">¥{item.amount.toLocaleString()}</p>
          <button
            onClick={() => onUnlink(item.id)}
            disabled={unlinking}
            className="text-xs text-gray-400 hover:text-red-500 transition flex items-center gap-0.5"
            title="紐付け解除"
          >
            <X size={12} />
            解除
          </button>
        </div>
      </div>
    </div>
  );
}

function WarikanCard({
  item,
  onUnlink,
  unlinking,
}: {
  item: WarikanItem;
  onUnlink: (id: string) => void;
  unlinking: boolean;
}) {
  return (
    <div className="bg-white rounded-lg p-3 border shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/warikan/${item.id}`} className="font-medium text-slate-800 hover:underline truncate">
              {item.eventName}
            </Link>
            {warikanStatusBadge(item.status)}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            管理: {item.manager?.name ?? '未設定'} / 明細 {item._count.expenses}件
          </p>
          {item.paymentDeadline && (
            <p className="text-xs text-gray-500">
              期日: {new Date(item.paymentDeadline).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
            </p>
          )}
          {item.memo && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-wrap">{item.memo}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.participants.map((p) => (
              <MemberAvatar key={p.member.id} member={p.member} />
            ))}
          </div>
        </div>
        <button
          onClick={() => onUnlink(item.id)}
          disabled={unlinking}
          className="text-xs text-gray-400 hover:text-red-500 transition flex items-center gap-0.5 shrink-0"
          title="紐付け解除"
        >
          <X size={12} />
          解除
        </button>
      </div>
    </div>
  );
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('warikan');
  const [fabOpen, setFabOpen] = useState(false);

  const { data: event, isLoading, error } = useEventDetail(id);

  const unlinkOtokogiMutation = useUnlinkEventOtokogi(id, {
    onError: () => alert('紐付け解除に失敗しました'),
  });

  const unlinkWarikanMutation = useUnlinkEventWarikan(id, {
    onError: () => alert('紐付け解除に失敗しました'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div>
        <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-4">
          <ChevronLeft size={16} />
          戻る
        </button>
        <p className="text-sm text-gray-500">
          {(error as Error)?.message === 'not_found' ? 'イベントが見つかりません' : '読み込みに失敗しました'}
        </p>
      </div>
    );
  }

  const dateLabel = event.endDate && event.endDate !== event.date
    ? `${formatDate(event.date)} 〜 ${formatDate(event.endDate)}`
    : formatDate(event.date);

  const warikanSection = (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">割り勘</h3>
        <Link
          href={`/warikan/new?eventId=${id}&from=/events/${id}`}
          className="text-xs text-slate-600 hover:text-slate-800 font-medium"
        >
          + 追加
        </Link>
      </div>
      {event.warikanEvents.length === 0 ? (
        <p className="text-sm text-gray-400 py-3 text-center">紐づく割り勘はありません</p>
      ) : (
        event.warikanEvents.map((item) => (
          <WarikanCard
            key={item.id}
            item={item}
            onUnlink={(wid) => {
              if (confirm('割り勘の紐付けを解除しますか？（割り勘は削除されません）')) {
                unlinkWarikanMutation.mutate(wid);
              }
            }}
            unlinking={unlinkWarikanMutation.isPending}
          />
        ))
      )}
    </div>
  );

  const otokogiSection = (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">男気</h3>
        <Link
          href={`/otokogi/new?eventId=${id}&from=/events/${id}`}
          className="text-xs text-slate-600 hover:text-slate-800 font-medium"
        >
          + 追加
        </Link>
      </div>
      {event.otokogiEvents.length === 0 ? (
        <p className="text-sm text-gray-400 py-3 text-center">紐づく男気はありません</p>
      ) : (
        event.otokogiEvents.map((item) => (
          <OtokogiCard
            key={item.id}
            item={item}
            onUnlink={(oid) => {
              if (confirm('男気の紐付けを解除しますか？（男気イベントは削除されません）')) {
                unlinkOtokogiMutation.mutate(oid);
              }
            }}
            unlinking={unlinkOtokogiMutation.isPending}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="pb-20 sm:pb-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => router.back()}
          className="p-1 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-slate-800 truncate">{event.title}</h2>
      </div>

      {/* イベント情報カード */}
      <Card className="mb-4">
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${eventTypeBadgeColor(event.eventType)}`}>
              {eventTypeLabel(event.eventType)}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-800">{dateLabel}</p>
          {event.description && (
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{event.description}</p>
          )}
          {event.participants.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {event.participants.map((p) => (
                <MemberAvatar key={p.member.id} member={p.member} size="sm" />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PC: 縦並び表示（sm以上） */}
      <div className="hidden sm:block space-y-6">
        {warikanSection}
        {otokogiSection}
      </div>

      {/* SP: タブ切替（sm未満） */}
      <div className="sm:hidden">
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'warikan' as Tab, label: '割り勘', count: event.warikanEvents.length },
            { key: 'otokogi' as Tab, label: '男気', count: event.otokogiEvents.length },
          ]).map((tab) => (
            <button
              key={tab.key}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition flex items-center justify-center gap-1 ${
                activeTab === tab.key ? 'bg-slate-800 text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                  activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'warikan' ? warikanSection : otokogiSection}
      </div>

      {/* SP: FAB（sm未満） */}
      <div className="sm:hidden fixed bottom-6 right-4 z-50">
        {fabOpen && (
          <div className="absolute bottom-14 right-0 flex flex-col gap-2 items-end">
            <Link
              href={`/otokogi/new?eventId=${id}&from=/events/${id}`}
              onClick={() => setFabOpen(false)}
              className="flex items-center gap-2 bg-white border shadow-md rounded-full px-4 py-2 text-sm font-medium text-slate-800 hover:bg-gray-50 whitespace-nowrap"
            >
              男気を追加
            </Link>
            <Link
              href={`/warikan/new?eventId=${id}&from=/events/${id}`}
              onClick={() => setFabOpen(false)}
              className="flex items-center gap-2 bg-white border shadow-md rounded-full px-4 py-2 text-sm font-medium text-slate-800 hover:bg-gray-50 whitespace-nowrap"
            >
              割り勘を追加
            </Link>
          </div>
        )}
        <button
          onClick={() => setFabOpen((o) => !o)}
          className={`w-12 h-12 rounded-full bg-slate-800 text-white shadow-lg flex items-center justify-center transition-transform ${
            fabOpen ? 'rotate-45' : ''
          }`}
          aria-label="新規追加"
        >
          <Plus size={22} />
        </button>
      </div>

      {/* FAB背景クリックで閉じる */}
      {fabOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40"
          onClick={() => setFabOpen(false)}
        />
      )}
    </div>
  );
}
