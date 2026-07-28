"use client";

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMembers } from '@/hooks/use-members';
import { useEvents } from '@/hooks/use-events';
import { useUpdateWarikan, useWarikanDetail } from '@/hooks/use-warikan';
import { WARIKAN_STATUS_LABELS } from '@/lib/constants';

type Member = { id: string; name: string; fullName: string };
type EventItem = { id: string; title: string; date: string };

type WarikanBasicInfo = {
  id: string;
  eventName: string;
  status: 'ENTERING' | 'PAYING' | 'CLOSED';
  managerId: string | null;
  detailDeadline: string | null;
  paymentDeadline: string | null;
  memo: string | null;
  walicaUrl: string | null;
  eventId: string | null;
  event: { id: string; title: string } | null;
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

function EditForm({
  id,
  event,
  members,
  events,
}: {
  id: string;
  event: WarikanBasicInfo;
  members: Member[];
  events: EventItem[];
}) {
  const router = useRouter();
  const [eventName, setEventName] = useState(event.eventName);
  const [managerId, setManagerId] = useState(event.managerId ?? '');
  const [eventId, setEventId] = useState(event.eventId ?? event.event?.id ?? '');
  const [detailDeadline, setDetailDeadline] = useState(toDateInputValue(event.detailDeadline));
  const [paymentDeadline, setPaymentDeadline] = useState(toDateInputValue(event.paymentDeadline));
  const [memo, setMemo] = useState(event.memo ?? '');
  const [walicaUrl, setWalicaUrl] = useState(event.walicaUrl ?? '');

  const updateMutation = useUpdateWarikan(id, {
    onSuccess: () => {
      toast({ title: '基本情報を更新しました' });
      router.push(`/warikan/${id}`);
    },
    onError: (error) => {
      console.error(error);
      toast({ variant: 'destructive', title: '更新に失敗しました', description: error.message });
    },
  });

  const handleSubmit = () => {
    if (!eventName) return;
    updateMutation.mutate({
      eventName,
      managerId: managerId || null,
      eventId: eventId && eventId !== 'none' ? eventId : null,
      detailDeadline: detailDeadline || null,
      paymentDeadline: paymentDeadline || null,
      memo: memo || null,
      walicaUrl: walicaUrl || null,
    });
  };

  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        <div>
          <Label>イベント名</Label>
          <Input
            className="mt-1"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="例: 20260306_テニス"
          />
        </div>

        {events.length > 0 && (
          <div>
            <Label>カレンダーイベント（任意）</Label>
            <Select value={eventId || 'none'} onValueChange={setEventId}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="紐づけるイベントを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">なし</SelectItem>
                {events.map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>
                    {ev.title}（{new Date(ev.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>管理大臣</Label>
            <Select value={managerId || 'none'} onValueChange={(v) => setManagerId(v === 'none' ? '' : v)}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue placeholder="選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未設定</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}（{m.fullName}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>明細追加期日</Label>
            <Input
              type="date"
              className="mt-1"
              value={detailDeadline}
              onChange={(e) => setDetailDeadline(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>支払期日</Label>
          <Input
            type="date"
            className="mt-1"
            value={paymentDeadline}
            onChange={(e) => setPaymentDeadline(e.target.value)}
          />
        </div>

        <div>
          <Label>メモ（任意）</Label>
          <Textarea
            className="mt-1"
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="備考があれば"
          />
        </div>

        <div>
          <Label>walica URL（任意）</Label>
          <Input
            className="mt-1"
            value={walicaUrl}
            onChange={(e) => setWalicaUrl(e.target.value)}
            placeholder="https://walica.jp/..."
          />
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" asChild>
            <Link href={`/warikan/${id}`}>キャンセル</Link>
          </Button>
          <Button
            className="flex-1 bg-slate-800 hover:bg-slate-700"
            onClick={handleSubmit}
            disabled={updateMutation.isPending || !eventName}
          >
            {updateMutation.isPending ? '更新中...' : '更新する'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WarikanEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: event, isLoading, isError } = useWarikanDetail<WarikanBasicInfo>(id);
  const { data: members = [] } = useMembers();
  const { data: events = [] } = useEvents();

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/warikan/${id}`} className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h2 className="text-xl font-bold text-slate-800">基本情報を編集</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : isError || !event ? (
        <p className="text-sm text-red-500">割り勘イベントの取得に失敗しました。</p>
      ) : event.status === 'CLOSED' ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-gray-600">
              {WARIKAN_STATUS_LABELS.CLOSED}済みのイベントは編集できません。
            </p>
            <div className="mt-4">
              <Button variant="outline" asChild>
                <Link href={`/warikan/${id}`}>詳細に戻る</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <EditForm key={event.id} id={id} event={event} members={members} events={events} />
      )}
    </div>
  );
}
