"use client";

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/amount-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ParticipantSelector } from '@/components/participant-selector';
import { useMembers } from '@/hooks/use-members';
import {
  useOtokogiEvent,
  useUpdateOtokogi,
  type OtokogiEventDetail,
} from '@/hooks/use-otokogi';

type Member = {
  id: string;
  name: string;
};

function EditForm({ id, event, members }: { id: string; event: OtokogiEventDetail; members: Member[] }) {
  const router = useRouter();
  const [eventDate, setEventDate] = useState(new Date(event.eventDate).toISOString().slice(0, 10));
  const [eventName, setEventName] = useState(event.eventName);
  const [payerId, setPayerId] = useState(event.payerId ?? event.payer.id);
  const [amount, setAmount] = useState(String(event.amount));
  const [place, setPlace] = useState(event.place ?? '');
  const [hasAlbum, setHasAlbum] = useState(event.hasAlbum);
  const [memo, setMemo] = useState(event.memo ?? '');
  const [participantIds, setParticipantIds] = useState<string[]>(
    event.participants.map((p) => p.member.id)
  );

  const toggleParticipant = (memberId: string) => {
    setParticipantIds((prev) =>
      prev.includes(memberId) ? prev.filter((p) => p !== memberId) : [...prev, memberId]
    );
  };

  const amountNum = Number(amount) || 0;
  const perPerson = participantIds.length > 0 ? Math.round(amountNum / participantIds.length) : 0;

  const updateMutation = useUpdateOtokogi(id, {
    onSuccess: () => {
      toast({ title: '男気イベントを更新しました' });
      router.push('/otokogi');
    },
    onError: (error) => {
      console.error(error);
      toast({ variant: 'destructive', title: '更新に失敗しました', description: error.message });
    },
  });

  const handleSubmit = () => {
    if (!eventDate || !eventName || !payerId || !amount || participantIds.length === 0) return;
    updateMutation.mutate({
      eventDate,
      eventName,
      payerId,
      amount: amountNum,
      place: place || null,
      hasAlbum,
      memo: memo || null,
      participantIds,
    });
  };

  return (
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

        <hr className="border-gray-200" />

        <div>
          <Label className="mb-2">男（奢った人）</Label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {members.map((m) => (
              <label
                key={m.id}
                className={`flex items-center justify-center gap-1 border-2 rounded-lg px-3 py-3 cursor-pointer transition ${
                  payerId === m.id ? 'border-amber-400 bg-amber-50' : 'hover:border-amber-400'
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

        <ParticipantSelector
          label="参加者（奢った人含む全員）"
          members={members}
          selectedIds={participantIds}
          onToggle={toggleParticipant}
        />

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
            disabled={updateMutation.isPending || !eventDate || !eventName || !payerId || !amount || participantIds.length === 0}
          >
            {updateMutation.isPending ? '更新中...' : '更新する'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OtokogiEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: event, isLoading, isError } = useOtokogiEvent(id);
  const { data: members = [] } = useMembers();

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/otokogi" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h2 className="text-xl font-bold text-slate-800">男気を編集する</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : isError || !event ? (
        <p className="text-sm text-red-500">男気イベントの取得に失敗しました。</p>
      ) : (
        <EditForm key={event.id} id={id} event={event} members={members} />
      )}
    </div>
  );
}
