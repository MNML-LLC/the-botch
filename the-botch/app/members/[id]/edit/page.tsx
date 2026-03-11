"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type BankAccountData = {
  bankName: string;
  branchName: string;
  accountType: 'SAVINGS' | 'CHECKING';
  accountNumber: string;
  accountHolder: string;
};

type MemberData = {
  name: string;
  fullName: string;
  initial: string;
  colorBg: string;
  colorText: string;
  paypayId: string | null;
  isActive: boolean;
};

const COLOR_OPTIONS = [
  { label: 'アンバー', bg: 'bg-amber-100', text: 'text-amber-700', accent: 'border-amber-400 bg-amber-50', dot: 'bg-amber-400' },
  { label: 'ブルー', bg: 'bg-blue-100', text: 'text-blue-700', accent: 'border-blue-400 bg-blue-50', dot: 'bg-blue-400' },
  { label: 'グリーン', bg: 'bg-green-100', text: 'text-green-700', accent: 'border-green-400 bg-green-50', dot: 'bg-green-400' },
  { label: 'パープル', bg: 'bg-purple-100', text: 'text-purple-700', accent: 'border-purple-400 bg-purple-50', dot: 'bg-purple-400' },
  { label: 'レッド', bg: 'bg-red-100', text: 'text-red-700', accent: 'border-red-400 bg-red-50', dot: 'bg-red-400' },
  { label: 'グレー', bg: 'bg-gray-100', text: 'text-gray-700', accent: 'border-gray-400 bg-gray-50', dot: 'bg-gray-400' },
];

export default function MemberEditPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams();
  const id = params.id as string;

  // フォーム状態
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [initial, setInitial] = useState('');
  const [colorBg, setColorBg] = useState('bg-gray-100');
  const [colorText, setColorText] = useState('text-gray-700');
  const [paypayId, setPaypayId] = useState('');
  const [isActive, setIsActive] = useState(true);

  // 口座フォーム状態
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [accountType, setAccountType] = useState<'SAVINGS' | 'CHECKING'>('SAVINGS');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [hasBankAccount, setHasBankAccount] = useState(false);

  // メンバー情報取得
  const { data: member, isPending: memberLoading } = useQuery({
    queryKey: ['member-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/members/${id}`);
      if (!res.ok) throw new Error('メンバー情報の取得に失敗しました');
      return res.json() as Promise<MemberData>;
    },
  });

  // 口座情報取得（メンバー情報とは独立、失敗してもメンバー表示に影響しない）
  const { data: bankAccount, isError: bankError } = useQuery({
    queryKey: ['member-bank-account', id],
    queryFn: async () => {
      const res = await fetch(`/api/members/${id}/bank-account`);
      if (!res.ok) throw new Error('口座情報の取得に失敗しました');
      return res.json() as Promise<BankAccountData | null>;
    },
  });

  // メンバー情報をフォームに反映
  useEffect(() => {
    if (member) {
      setName(member.name);
      setFullName(member.fullName);
      setInitial(member.initial);
      setColorBg(member.colorBg);
      setColorText(member.colorText);
      setPaypayId(member.paypayId || '');
      setIsActive(member.isActive);
    }
  }, [member]);

  // 口座情報をフォームに反映
  useEffect(() => {
    if (bankAccount) {
      setBankName(bankAccount.bankName);
      setBranchName(bankAccount.branchName);
      setAccountType(bankAccount.accountType);
      setAccountNumber(bankAccount.accountNumber);
      setAccountHolder(bankAccount.accountHolder);
      setHasBankAccount(true);
    }
  }, [bankAccount]);

  // メンバー更新
  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          fullName,
          initial,
          colorBg,
          colorText,
          paypayId: paypayId || null,
          isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '更新に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['member-detail', id] });
      router.push('/members');
    },
    onError: (error: Error) => {
      alert(error.message);
    },
  });

  // 口座保存
  const saveBankMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/members/${id}/bank-account`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName,
          branchName,
          accountType,
          accountNumber,
          accountHolder,
        } satisfies BankAccountData),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '口座情報の保存に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      setHasBankAccount(true);
      queryClient.invalidateQueries({ queryKey: ['member-bank-account', id] });
      alert('口座情報を保存しました');
    },
    onError: (error: Error) => {
      alert(error.message);
    },
  });

  // 口座削除
  const deleteBankMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/members/${id}/bank-account`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '口座情報の削除に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      setBankName('');
      setBranchName('');
      setAccountType('SAVINGS');
      setAccountNumber('');
      setAccountHolder('');
      setHasBankAccount(false);
      queryClient.invalidateQueries({ queryKey: ['member-bank-account', id] });
      alert('口座情報を削除しました');
    },
    onError: (error: Error) => {
      alert(error.message);
    },
  });

  const handleColorSelect = (bg: string, text: string) => {
    setColorBg(bg);
    setColorText(text);
  };

  const handleSubmit = () => {
    if (!name || !fullName || !initial) return;
    updateMutation.mutate();
  };

  const handleSaveBankAccount = () => {
    if (!bankName || !branchName || !accountNumber || !accountHolder) {
      alert('口座情報を全て入力してください');
      return;
    }
    if (!/^\d{1,7}$/.test(accountNumber)) {
      alert('口座番号は7桁以下の数字で入力してください');
      return;
    }
    saveBankMutation.mutate();
  };

  const handleDeleteBankAccount = () => {
    if (!confirm('口座情報を削除しますか？')) return;
    deleteBankMutation.mutate();
  };

  const isBankMutating = saveBankMutation.isPending || deleteBankMutation.isPending;

  if (memberLoading) return <p className="text-sm text-gray-500">読み込み中...</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/members" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h2 className="text-xl font-bold text-slate-800">メンバー編集</h2>
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

          <hr className="border-gray-200" />

          {/* 口座情報 */}
          <div>
            <h4 className="text-sm font-bold text-slate-800 mb-3">口座情報</h4>
            {bankError && (
              <p className="text-sm text-red-500 mb-2">口座情報の取得に失敗しました</p>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>銀行名</Label>
                  <Input
                    className="mt-1"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="例: 三菱UFJ銀行"
                    maxLength={50}
                  />
                </div>
                <div>
                  <Label>支店名</Label>
                  <Input
                    className="mt-1"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="例: 渋谷支店"
                    maxLength={50}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>口座種別</Label>
                  <Select value={accountType} onValueChange={(v) => setAccountType(v as 'SAVINGS' | 'CHECKING')}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAVINGS">普通</SelectItem>
                      <SelectItem value="CHECKING">当座</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>口座番号</Label>
                  <Input
                    className="mt-1 font-mono"
                    value={accountNumber}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 7);
                      setAccountNumber(v);
                    }}
                    placeholder="例: 1234567"
                    inputMode="numeric"
                    maxLength={7}
                  />
                </div>
              </div>
              <div>
                <Label>口座名義（カナ）</Label>
                <Input
                  className="mt-1"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="例: ウチヤマ ユウキ"
                  maxLength={100}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleSaveBankAccount}
                  disabled={isBankMutating || !bankName || !branchName || !accountNumber || !accountHolder}
                >
                  {saveBankMutation.isPending ? '保存中...' : '口座情報を保存'}
                </Button>
                {hasBankAccount && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 border-red-200 hover:bg-red-50"
                    onClick={handleDeleteBankAccount}
                    disabled={isBankMutating}
                  >
                    削除
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-400">
                精算画面で振込先として表示されます
              </p>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* アクティブ切り替え */}
          <div className="flex items-center justify-between">
            <Label>アクティブメンバー</Label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/members">キャンセル</Link>
            </Button>
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-700"
              onClick={handleSubmit}
              disabled={updateMutation.isPending || !name || !fullName || !initial}
            >
              {updateMutation.isPending ? '保存中...' : '保存する'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
