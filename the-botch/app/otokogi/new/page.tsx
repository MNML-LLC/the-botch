"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/amount-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useCreateOtokogi } from '@/hooks/use-otokogi';

function OtokogiNewForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventName, setEventName] = useState('');
  const [eventId, setEventId] = useState(searchParams.get('eventId') ?? '');
  const [payerId, setPayerId] = useState('');
  const [amount, setAmount] = useState('');
  const [place, setPlace] = useState('');
  const [hasAlbum, setHasAlbum] = useState(false);
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

  const amountNum = Number(amount) || 0;
  const perPerson = participantIds.length > 0 ? Math.round(amountNum / participantIds.length) : 0;

  const createMutation = useCreateOtokogi({
    onSuccess: () => {
      toast({ title: '男気イベントを登録しました' });
      const from = searchParams.get('from');
      router.push(from ?? '/otokogi');
    },
    onError: (error) => {
      console.error(error);
      toast({ variant: 'destructive', title: '登録に失敗しました', description: error.message });
    },
  });

  const handleSubmit = () => {
    if (!eventDate || !eventName || !payerId || !amount || participantIds.length === 0) return;
    createMutation.mutate({
      eventDate,
      eventName,
      payerId,
      amount: amountNum,
      place: place || null,
      hasAlbum,
      memo: memo || null,
      eventId: (eventId && eventId !== 'none') ? eventId : null,
      participantIds,
    });
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/otokogi" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h2 className="text-xl font-bold text-slate-800">男気を記録する</h2>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>日付</Label>
              <Input
                type="date"
                className="mt-1"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div>
              <Label>場所</Label>
              <Input
                className="mt-1"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="例: 中目黒"
              />
            </div>
          </div>

          <div>
            <Label>イベント・店名</Label>
            <Input
              className="mt-1"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="例: chapter"
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

          <hr className="border-gray-200" />

          {/* 奢った人 */}
          <div>
            <Label className="mb-2">男（奢った人）</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {members.map((m) => (
                <label
                  key={m.id}
                  className={`flex items-center justify-center gap-1 border-2 rounded-lg px-3 py-3 cursor-pointer transition ${
                    payerId === m.id
                      ? 'border-amber-400 bg-amber-50'
                      : 'hover:border-amber-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="payer"
                    className="sr-only"
                    checked={payerId === m.id}
                    onChange={() => setPayerId(m.id)}
                  />
                  <span className="text-sm font-medium">{m.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>支払額</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-2 text-gray-500">&yen;</span>
              <AmountInput
                className="pl-7 text-right font-mono"
                placeholder="0"
                value={amount}
                onChange={setAmount}
              />
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* 参加者 */}
          <ParticipantSelector
            label="参加者（奢った人含む全員）"
            members={members}
            selectedIds={participantIds}
            onToggle={toggleParticipant}
            onSelectAll={selectAllParticipants}
            onClearAll={clearAllParticipants}
          />

          {/* 期待値表示 */}
          {amountNum > 0 && participantIds.length > 0 && (
            <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700">期待値（1人あたり）</span>
                <span className="font-bold text-lg text-slate-800">¥{perPerson.toLocaleString()}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                ¥{amountNum.toLocaleString()} &divide; {participantIds.length}人 = ¥{perPerson.toLocaleString()}
              </p>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={hasAlbum}
                onCheckedChange={(checked) => setHasAlbum(checked === true)}
              />
              <span className="text-sm">アルバムあり</span>
            </label>
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

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/otokogi">キャンセル</Link>
            </Button>
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-700"
              onClick={handleSubmit}
              disabled={createMutation.isPending || !eventDate || !eventName || !payerId || !amount || participantIds.length === 0}
            >
              {createMutation.isPending ? '登録中...' : '登録する'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OtokogiNewPage() {
  return (
    <Suspense fallback={null}>
      <OtokogiNewForm />
    </Suspense>
  );
}
