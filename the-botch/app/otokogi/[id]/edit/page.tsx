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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ParticipantSelector } from '@/components/participant-selector';
import { ImageUpload } from '@/components/otokogi/image-upload';
import { useMembers } from '@/hooks/use-members';
import {
  useDeleteOtokogi,
  useOtokogiEvent,
  useUpdateOtokogi,
  type OtokogiEventDetail,
  type OtokogiEventType,
} from '@/hooks/use-otokogi';
import { Yen } from '@/components/ui/yen';
import { MIN_OTOKOGI_AMOUNT } from '@/lib/constants';

// eventType "auto" = 自動判定 (null として送信)
const EVENT_TYPE_AUTO = 'auto' as const;
type EventTypeFormValue = OtokogiEventType | typeof EVENT_TYPE_AUTO;

const EVENT_TYPE_OPTIONS: { value: EventTypeFormValue; label: string }[] = [
  { value: EVENT_TYPE_AUTO, label: '自動判定' },
  { value: 'TRIP', label: '🏞️ 旅行' },
  { value: 'HANGOUT', label: '🍻 飲み会' },
  { value: 'ACTIVITY', label: '🏃 アクティビティ' },
  { value: 'OTHER', label: '📦 その他' },
];

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
  const [wasJanken, setWasJanken] = useState(event.wasJanken ?? false);
  const [eventType, setEventType] = useState<EventTypeFormValue>(
    event.eventType ?? EVENT_TYPE_AUTO
  );
  const [memo, setMemo] = useState(event.memo ?? '');
  const [participantIds, setParticipantIds] = useState<string[]>(
    event.participants.map((p) => p.member.id)
  );
  const [imageCount, setImageCount] = useState(event.images.length);

  const toggleParticipant = (memberId: string) => {
    setParticipantIds((prev) =>
      prev.includes(memberId) ? prev.filter((p) => p !== memberId) : [...prev, memberId]
    );
  };

  const amountNum = Number(amount) || 0;
  const perPerson = participantIds.length > 0 ? Math.round(amountNum / participantIds.length) : 0;
  // 男気は ¥10,000 以上から成立 (CEO ルール / Issue #354)
  const amountBelowMin = amountNum > 0 && amountNum < MIN_OTOKOGI_AMOUNT;

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

  const deleteMutation = useDeleteOtokogi(id, {
    onSuccess: () => {
      toast({ title: '男気イベントを削除しました' });
      router.push('/otokogi');
    },
    onError: (error) => {
      console.error(error);
      toast({ variant: 'destructive', title: '削除に失敗しました', description: error.message });
    },
  });

  const isMutating = updateMutation.isPending || deleteMutation.isPending;

  const handleSubmit = () => {
    if (!eventDate || !eventName || !payerId || !amount || participantIds.length === 0) return;
    if (amountBelowMin) return;
    updateMutation.mutate({
      eventDate,
      eventName,
      payerId,
      amount: amountNum,
      place: place || null,
      hasAlbum,
      wasJanken,
      eventType: eventType === EVENT_TYPE_AUTO ? null : eventType,
      memo: memo || null,
      participantIds,
    });
  };

  const handleDelete = () => {
    if (isMutating) return;
    if (!confirm('この男気イベントを削除しますか？\nこの操作は取り消せません。')) return;
    deleteMutation.mutate();
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

        <div>
          <Label>カテゴリ</Label>
          <Select
            value={eventType}
            onValueChange={(v) => setEventType(v as EventTypeFormValue)}
          >
            <SelectTrigger className="mt-1 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400 mt-1">
            「自動判定」はイベント名・場所・金額から推定します
          </p>
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
              className={`pl-7 text-right font-mono ${
                amountBelowMin ? 'border-red-400 focus-visible:ring-red-400' : ''
              }`}
              placeholder="0"
              value={amount}
              onChange={setAmount}
              aria-invalid={amountBelowMin}
            />
          </div>
          {amountBelowMin ? (
            <p className="text-xs text-red-500 mt-1">
              男気は ¥{MIN_OTOKOGI_AMOUNT.toLocaleString()} 以上から成立します
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">
              ¥{MIN_OTOKOGI_AMOUNT.toLocaleString()} 以上から男気として成立します
            </p>
          )}
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
              <Yen value={perPerson} size="lg" className="font-bold text-slate-800" />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              <Yen value={amountNum} size="xs" /> &divide; {participantIds.length}人 = <Yen value={perPerson} size="xs" />
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={wasJanken}
              onCheckedChange={(checked) => setWasJanken(checked === true)}
            />
            <span className="text-sm">じゃんけんで決めた（勝率計算の対象になる）</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={hasAlbum}
              onCheckedChange={(checked) => setHasAlbum(checked === true)}
              disabled={imageCount > 0}
            />
            <span className="text-sm">
              アルバムあり
              {imageCount > 0 && (
                <span className="text-xs text-gray-500 ml-2">
                  （写真 {imageCount} 枚に基づき自動更新）
                </span>
              )}
            </span>
          </label>
        </div>

        <hr className="border-gray-200" />

        <div>
          <Label className="mb-2">写真（最大10枚 / 1枚3MBまで / 長辺2048px に自動リサイズ）</Label>
          <div className="mt-2">
            <ImageUpload
              otokogiEventId={id}
              initialImages={event.images}
              blobEnabled={event.blobEnabled}
              onImagesChange={(imgs) => {
                setImageCount(imgs.length);
                setHasAlbum(imgs.length > 0);
              }}
            />
          </div>
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
            disabled={isMutating || !eventDate || !eventName || !payerId || !amount || participantIds.length === 0 || amountBelowMin}
          >
            {updateMutation.isPending ? '更新中...' : '更新する'}
          </Button>
        </div>

        <div className="pt-2 border-t border-gray-200">
          <Button
            variant="outline"
            className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={handleDelete}
            disabled={isMutating}
          >
            {deleteMutation.isPending ? '削除中...' : '削除する'}
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
