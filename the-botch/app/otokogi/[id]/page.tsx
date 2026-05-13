"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ImageUpload, type OtokogiImageData } from '@/components/otokogi/image-upload';

type Member = {
  id: string;
  name: string;
  fullName: string;
  initial: string;
  colorBg: string;
  colorText: string;
};

type OtokogiEvent = {
  id: string;
  eventDate: string;
  eventName: string;
  payerId: string;
  amount: number;
  place: string | null;
  hasAlbum: boolean;
  memo: string | null;
  eventId: string | null;
  payer: Member;
  participants: { member: Member }[];
  images: OtokogiImageData[];
};

export default function OtokogiDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [eventName, setEventName] = useState('');
  const [payerId, setPayerId] = useState('');
  const [amount, setAmount] = useState('');
  const [place, setPlace] = useState('');
  const [memo, setMemo] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);

  const { data: event, isLoading } = useQuery<OtokogiEvent>({
    queryKey: ['otokogi-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/otokogi/${id}`);
      if (!res.ok) throw new Error('イベントの取得に失敗しました');
      return res.json();
    },
  });

  useEffect(() => {
    if (!event) return;
    setEventDate(new Date(event.eventDate).toISOString().slice(0, 10));
    setEventName(event.eventName);
    setPayerId(event.payerId);
    setAmount(String(event.amount));
    setPlace(event.place ?? '');
    setMemo(event.memo ?? '');
    setParticipantIds(event.participants.map((p) => p.member.id));
  }, [event]);

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ['members'],
    queryFn: async () => {
      const res = await fetch('/api/members');
      if (!res.ok) throw new Error('メンバーの取得に失敗しました');
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/otokogi/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventDate,
          eventName,
          payerId,
          amount: Number(amount),
          place: place || null,
          memo: memo || null,
          participantIds,
        }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['otokogi-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['otokogi'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-ranking'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-stats'] });
      setEditing(false);
    },
    onError: () => alert('更新に失敗しました'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/otokogi/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['otokogi'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-ranking'] });
      queryClient.invalidateQueries({ queryKey: ['otokogi-stats'] });
      router.push('/otokogi');
    },
    onError: () => alert('削除に失敗しました'),
  });

  const toggleParticipant = (memberId: string) => {
    setParticipantIds((prev) =>
      prev.includes(memberId) ? prev.filter((p) => p !== memberId) : [...prev, memberId],
    );
  };

  const handleDelete = () => {
    if (!confirm('このイベントを削除しますか？')) return;
    deleteMutation.mutate();
  };

  const startEditing = () => {
    if (!event) return;
    setEventDate(new Date(event.eventDate).toISOString().slice(0, 10));
    setEventName(event.eventName);
    setPayerId(event.payerId);
    setAmount(String(event.amount));
    setPlace(event.place ?? '');
    setMemo(event.memo ?? '');
    setParticipantIds(event.participants.map((p) => p.member.id));
    setEditing(true);
  };

  if (isLoading || !event) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/otokogi" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        </div>
        <p className="text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/otokogi" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h2 className="text-xl font-bold text-slate-800 truncate">{event.eventName}</h2>
      </div>

      {/* 詳細カード */}
      {!editing ? (
        <Card className="mb-4">
          <CardContent className="pt-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">{formatDate(event.eventDate)}{event.place && ` / ${event.place}`}</p>
                <p className="font-semibold text-slate-800 text-lg mt-0.5">{event.eventName}</p>
              </div>
              <p className="font-bold text-xl text-slate-800 shrink-0">¥{event.amount.toLocaleString()}</p>
            </div>

            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${event.payer.colorBg} ${event.payer.colorText}`}>
                {event.payer.initial}
              </div>
              <span className="text-sm text-slate-700">{event.payer.name} が奢った</span>
            </div>

            <div className="flex flex-wrap gap-1">
              {event.participants.map((p) => (
                <div
                  key={p.member.id}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${p.member.colorBg} ${p.member.colorText}`}
                  title={p.member.name}
                >
                  {p.member.initial}
                </div>
              ))}
              <span className="text-xs text-gray-500 self-center ml-1">{event.participants.length}人参加</span>
            </div>

            {event.memo && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{event.memo}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={startEditing}
              >
                編集
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:border-red-300"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                削除
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-4">
          <CardContent className="pt-5 space-y-4">
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
              />
            </div>

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
                <Input
                  type="number"
                  min={1}
                  className="pl-7 text-right font-mono"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label className="mb-2">参加者</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {members.map((m) => {
                  const checked = participantIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 border cursor-pointer ${
                        checked ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleParticipant(m.id)}
                      />
                      <span className={`text-sm ${checked ? '' : 'text-gray-400'}`}>{m.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>メモ（任意）</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditing(false)}
              >
                キャンセル
              </Button>
              <Button
                className="flex-1 bg-slate-800 hover:bg-slate-700"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || !eventName || !payerId || !amount || participantIds.length === 0}
              >
                {updateMutation.isPending ? '保存中...' : '保存する'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 写真セクション */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">写真</h3>
          <ImageUpload
            otokogiEventId={id}
            initialImages={event.images}
          />
        </CardContent>
      </Card>
    </div>
  );
}
