"use client";

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useMembers } from '@/hooks/use-members';
import { useCreateEvent } from '@/hooks/use-events';

const EVENT_TYPES = [
  { value: 'HANGOUT', label: '飲み会' },
  { value: 'TRIP', label: '旅行' },
  { value: 'ACTIVITY', label: 'アクティビティ' },
  { value: 'OTHER', label: 'その他' },
];

export default function NewEventPage() {
  const router = useRouter();
  const membersInitialized = useRef(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState('HANGOUT');
  const [createdById, setCreatedById] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);

  const { data: members = [] } = useMembers();

  // 初回ロード時に全メンバーを参加者として選択
  if (members.length > 0 && !membersInitialized.current) {
    setParticipantIds(members.map((m) => m.id));
    membersInitialized.current = true;
  }

  const toggleParticipant = (id: string) => {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const createMutation = useCreateEvent({
    onSuccess: () => {
      router.push('/calendar');
    },
    onError: (error) => {
      alert(error.message);
    },
  });

  const handleSubmit = () => {
    if (!title || !date || !createdById) return;
    createMutation.mutate({
      title,
      date,
      endDate: endDate || null,
      description: description || null,
      eventType,
      createdById,
      participantIds,
    });
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/calendar" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h2 className="text-xl font-bold text-slate-800">予定を追加</h2>
      </div>
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">予定を追加</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* タイトル */}
        <div>
          <Label>タイトル</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 韓国旅行、忘年会"
          />
        </div>

        {/* 種類 */}
        <div>
          <Label>種類</Label>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 日付 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>開始日</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>終了日（任意）</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        {/* メモ */}
        <div>
          <Label>メモ（任意）</Label>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="場所、集合時間など"
          />
        </div>

        {/* 作成者 */}
        <div>
          <Label>登録者</Label>
          <Select value={createdById} onValueChange={setCreatedById}>
            <SelectTrigger>
              <SelectValue placeholder="選択..." />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 参加者 */}
        <div>
          <Label>参加者</Label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {members.map((m) => (
              <label
                key={m.id}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                  participantIds.includes(m.id) ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                }`}
              >
                <Checkbox
                  checked={participantIds.includes(m.id)}
                  onCheckedChange={() => toggleParticipant(m.id)}
                />
                <span className="text-sm text-slate-800">{m.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 送信ボタン */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" asChild>
            <Link href="/calendar">キャンセル</Link>
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title || !date || !createdById || createMutation.isPending}
            className="flex-1 bg-slate-800 hover:bg-slate-700"
          >
            {createMutation.isPending ? '登録中...' : '予定を登録'}
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
