"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateMember } from '@/hooks/use-members';

const COLOR_OPTIONS = [
  { label: 'アンバー', bg: 'bg-amber-100', text: 'text-amber-700', accent: 'border-amber-400 bg-amber-50', dot: 'bg-amber-400' },
  { label: 'ブルー', bg: 'bg-blue-100', text: 'text-blue-700', accent: 'border-blue-400 bg-blue-50', dot: 'bg-blue-400' },
  { label: 'グリーン', bg: 'bg-green-100', text: 'text-green-700', accent: 'border-green-400 bg-green-50', dot: 'bg-green-400' },
  { label: 'パープル', bg: 'bg-purple-100', text: 'text-purple-700', accent: 'border-purple-400 bg-purple-50', dot: 'bg-purple-400' },
  { label: 'レッド', bg: 'bg-red-100', text: 'text-red-700', accent: 'border-red-400 bg-red-50', dot: 'bg-red-400' },
  { label: 'グレー', bg: 'bg-gray-100', text: 'text-gray-700', accent: 'border-gray-400 bg-gray-50', dot: 'bg-gray-400' },
];

export default function MemberNewPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [initial, setInitial] = useState('');
  const [colorBg, setColorBg] = useState('bg-gray-100');
  const [colorText, setColorText] = useState('text-gray-700');
  const [paypayId, setPaypayId] = useState('');

  const handleColorSelect = (bg: string, text: string) => {
    setColorBg(bg);
    setColorText(text);
  };

  const createMutation = useCreateMember({
    onSuccess: () => {
      toast({ title: 'メンバーを追加しました' });
      router.push('/members');
    },
    onError: (error) => {
      console.error(error);
      toast({ variant: 'destructive', title: '作成に失敗しました', description: error.message });
    },
  });

  const handleSubmit = () => {
    if (!name || !fullName || !initial) return;
    createMutation.mutate({
      name,
      fullName,
      initial,
      colorBg,
      colorText,
      paypayId: paypayId || null,
    });
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/members" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h2 className="text-xl font-bold text-slate-800">メンバー追加</h2>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-5">
          {/* 基本情報 */}
          <div>
            <h4 className="text-sm font-bold text-slate-800 mb-3">基本情報</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>表示名</Label>
                <Input
                  className="mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: ゆうき"
                />
              </div>
              <div>
                <Label>姓</Label>
                <Input
                  className="mt-1"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="例: 内山"
                />
              </div>
            </div>
          </div>

          <div>
            <Label>イニシャル（アバター用）</Label>
            <Input
              className="mt-1 w-20 text-center"
              maxLength={1}
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              placeholder="Y"
            />
          </div>

          {/* テーマカラー */}
          <div>
            <Label className="mb-2">テーマカラー</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {COLOR_OPTIONS.map((c) => (
                <label
                  key={c.label}
                  className={`flex items-center justify-center gap-2 border-2 rounded-lg px-3 py-3 cursor-pointer transition ${
                    colorBg === c.bg ? c.accent : 'hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="color"
                    className="sr-only"
                    checked={colorBg === c.bg}
                    onChange={() => handleColorSelect(c.bg, c.text)}
                  />
                  <span className={`w-4 h-4 rounded-full ${c.dot}`}></span>
                  <span className="text-xs">{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* プレビュー */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">プレビュー:</span>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${colorBg} ${colorText}`}>
              {initial || '?'}
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* PayPay連携 */}
          <div>
            <h4 className="text-sm font-bold text-slate-800 mb-3">PayPay連携</h4>
            <div>
              <Label>PayPay ID</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-red-500 font-mono text-sm">@</span>
                <Input
                  className="pl-7 font-mono"
                  value={paypayId}
                  onChange={(e) => setPaypayId(e.target.value)}
                  placeholder="例: yuki_uchiyama"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                PayPayアプリ &gt; マイページ &gt; PayPay ID で確認できます
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/members">キャンセル</Link>
            </Button>
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-700"
              onClick={handleSubmit}
              disabled={createMutation.isPending || !name || !fullName || !initial}
            >
              {createMutation.isPending ? '保存中...' : '追加する'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
