"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { ParticipantSelector } from '@/components/participant-selector';
import { useMembers } from '@/hooks/use-members';
import { useEvents } from '@/hooks/use-events';
import { useCreateWarikan } from '@/hooks/use-warikan';

function WarikanNewForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [eventName, setEventName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [eventId, setEventId] = useState(searchParams.get('eventId') ?? '');
  const [detailDeadline, setDetailDeadline] = useState('');
  const [paymentDeadline, setPaymentDeadline] = useState('');
  const [memo, setMemo] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);

  const { data: members = [] } = useMembers();
  const { data: events = [] } = useEvents();

  const toggleParticipant = (id: string) => {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const selectAllParticipants = () => {
    setParticipantIds(members.map((m) => m.id));
  };

  const clearAllParticipants = () => {
    setParticipantIds([]);
  };

  const createMutation = useCreateWarikan({
    onSuccess: () => {
      toast({ title: '割り勘イベントを作成しました' });
      const from = searchParams.get('from');
      router.push(from ?? '/warikan');
    },
    onError: (error) => {
      console.error(error);
      toast({ variant: 'destructive', title: '作成に失敗しました', description: error.message });
    },
  });

  const handleSubmit = () => {
    if (!eventName || participantIds.length === 0) return;
    createMutation.mutate({
      eventName,
      managerId: managerId || null,
      eventId: (eventId && eventId !== 'none') ? eventId : null,
      detailDeadline: detailDeadline || null,
      paymentDeadline: paymentDeadline || null,
      memo: memo || null,
      participantIds,
    });
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/warikan" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h2 className="text-xl font-bold text-slate-800">新規割り勘</h2>
      </div>

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
              <Select value={eventId} onValueChange={setEventId}>
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
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent>
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

          <ParticipantSelector
            members={members}
            selectedIds={participantIds}
            onToggle={toggleParticipant}
            onSelectAll={selectAllParticipants}
            onClearAll={clearAllParticipants}
          />

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

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/warikan">キャンセル</Link>
            </Button>
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-700"
              onClick={handleSubmit}
              disabled={createMutation.isPending || !eventName || participantIds.length === 0}
            >
              {createMutation.isPending ? '保存中...' : '保存する'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WarikanNewPage() {
  return (
    <Suspense fallback={null}>
      <WarikanNewForm />
    </Suspense>
  );
}
