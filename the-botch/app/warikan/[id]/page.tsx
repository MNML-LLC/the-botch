"use client";

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

type BankAccount = {
  bankName: string;
  branchName: string;
  accountType: 'SAVINGS' | 'CHECKING';
  accountNumber: string;
  accountHolder: string;
};

type Member = {
  id: string;
  name: string;
  fullName: string;
  initial: string;
  colorBg: string;
  colorText: string;
  paypayId: string | null;
  bankAccount?: BankAccount | null;
};

type ExpenseDebtor = {
  memberId: string;
  member: Member;
};

type Expense = {
  id: string;
  payerId: string;
  description: string;
  amount: number;
  payer: Member;
  debtors: ExpenseDebtor[];
};

type Settlement = {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  isPaid: boolean;
  isReceived: boolean;
  fromMember: Member;
  toMember: Member;
};

type LinkedEvent = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  eventType: string;
};

type WarikanDetail = {
  id: string;
  eventName: string;
  status: 'ENTERING' | 'PAYING' | 'CLOSED';
  detailDeadline: string | null;
  paymentDeadline: string | null;
  memo: string | null;
  walicaUrl: string | null;
  manager: Member | null;
  event: LinkedEvent | null;
  participants: { member: Member }[];
  expenses: Expense[];
  settlements: Settlement[];
};

function statusBadge(status: string) {
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

function maskAccountNumber(num: string): string {
  if (num.length <= 3) return num;
  return '****' + num.slice(-3);
}

function accountTypeLabel(type: string): string {
  return type === 'CHECKING' ? '当座' : '普通';
}

function formatShortDate(date: string | null) {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function WarikanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  // 明細追加フォーム
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expensePayerId, setExpensePayerId] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDebtorIds, setExpenseDebtorIds] = useState<Set<string>>(new Set());
  // 明細編集
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editPayerId, setEditPayerId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDebtorIds, setEditDebtorIds] = useState<Set<string>>(new Set());

  // イベント詳細取得
  const { data: event, isLoading: loading } = useQuery({
    queryKey: ['warikan-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/warikan/${id}`);
      if (!res.ok) throw new Error('割り勘イベントの取得に失敗しました');
      return res.json() as Promise<WarikanDetail>;
    },
  });

  const invalidateDetail = () => queryClient.invalidateQueries({ queryKey: ['warikan-detail', id] });

  // 明細追加
  const addExpenseMutation = useMutation({
    mutationFn: async () => {
      const allSelected = event && expenseDebtorIds.size === event.participants.length;
      const debtorIds = allSelected ? undefined : [...expenseDebtorIds];
      const res = await fetch(`/api/warikan/${id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payerId: expensePayerId,
          description: expenseDescription,
          amount: Number(expenseAmount),
          ...(debtorIds && { debtorIds }),
        }),
      });
      if (!res.ok) throw new Error('追加に失敗しました');
      return res.json();
    },
    onSuccess: () => {
      setExpensePayerId('');
      setExpenseDescription('');
      setExpenseAmount('');
      setExpenseDebtorIds(new Set());
      setShowExpenseForm(false);
      invalidateDetail();
    },
    onError: () => {
      alert('追加に失敗しました');
    },
  });

  const handleAddExpense = () => {
    if (!expensePayerId || !expenseDescription || !expenseAmount) return;
    addExpenseMutation.mutate();
  };

  const startEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setEditPayerId(expense.payerId);
    setEditDescription(expense.description);
    setEditAmount(String(expense.amount));
    const debtorMemberIds = expense.debtors.map((d) => d.memberId);
    // debtorsが空 or 全員 → 全員選択
    if (debtorMemberIds.length === 0 || (event && debtorMemberIds.length === event.participants.length)) {
      setEditDebtorIds(new Set(event?.participants.map((p) => p.member.id) ?? []));
    } else {
      setEditDebtorIds(new Set(debtorMemberIds));
    }
  };

  const cancelEditExpense = () => {
    setEditingExpenseId(null);
  };

  // 明細更新
  const updateExpenseMutation = useMutation({
    mutationFn: async () => {
      const amountNum = Number(editAmount);
      const allSelected = event && editDebtorIds.size === event.participants.length;
      const debtorIds = allSelected ? undefined : [...editDebtorIds];
      const res = await fetch(`/api/warikan/${id}/expenses/${editingExpenseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payerId: editPayerId,
          description: editDescription,
          amount: amountNum,
          ...(debtorIds && { debtorIds }),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? '更新に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      setEditingExpenseId(null);
      invalidateDetail();
    },
    onError: (error: Error) => {
      alert(error.message);
    },
  });

  const handleUpdateExpense = () => {
    if (!editPayerId || !editDescription || !editAmount || editDebtorIds.size === 0) return;
    if (isMutating) return;
    const amountNum = Number(editAmount);
    if (!Number.isInteger(amountNum) || amountNum <= 0) {
      alert('金額は1以上の整数を入力してください');
      return;
    }
    updateExpenseMutation.mutate();
  };

  // 明細削除
  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const res = await fetch(`/api/warikan/${id}/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? '削除に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateDetail();
    },
    onError: (error: Error) => {
      alert(error.message);
    },
  });

  const handleDeleteExpense = (expenseId: string) => {
    if (isMutating) return;
    if (!confirm('この明細を削除しますか？')) return;
    deleteExpenseMutation.mutate(expenseId);
  };

  // 精算計算
  const calculateSettlementsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/warikan/${id}/settlements`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '精算計算に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      invalidateDetail();
    },
    onError: (error: Error) => {
      alert(error.message);
    },
  });

  const handleCalculateSettlements = () => {
    calculateSettlementsMutation.mutate();
  };

  // 精算アクション（送金済み/受領確認）
  const settlementActionMutation = useMutation({
    mutationFn: async ({ settlementId, action }: { settlementId: string; action: 'pay' | 'receive' }) => {
      const res = await fetch(`/api/warikan/${id}/settlements/${settlementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('操作に失敗しました');
      return res.json();
    },
    onSuccess: () => {
      invalidateDetail();
    },
  });

  const handleSettlementAction = (settlementId: string, action: 'pay' | 'receive') => {
    if (isMutating) return;
    settlementActionMutation.mutate({ settlementId, action });
  };

  // ステータス変更
  const statusChangeMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const res = await fetch(`/api/warikan/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('ステータス変更に失敗しました');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      invalidateDetail();
    },
  });

  const handleStatusChange = (newStatus: string) => {
    if (isMutating) return;
    statusChangeMutation.mutate(newStatus);
  };

  // イベント削除
  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/warikan/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? '削除に失敗しました');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warikan'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      router.push('/warikan');
    },
    onError: (error: Error) => {
      alert(error.message);
    },
  });

  const handleDeleteEvent = () => {
    if (isMutating) return;
    if (!confirm('この割り勘イベントを削除しますか？\n関連する立替明細・精算結果も全て削除されます。')) return;
    deleteEventMutation.mutate();
  };

  const isMutating = addExpenseMutation.isPending || updateExpenseMutation.isPending || deleteExpenseMutation.isPending || calculateSettlementsMutation.isPending || settlementActionMutation.isPending || statusChangeMutation.isPending || deleteEventMutation.isPending;

  if (loading) return <p className="text-sm text-gray-500">読み込み中...</p>;
  if (!event) return <p className="text-sm text-gray-500">イベントが見つかりません</p>;

  const totalExpenses = event.expenses.reduce((sum, e) => sum + e.amount, 0);
  const perPerson = event.participants.length > 0 ? Math.round(totalExpenses / event.participants.length) : 0;
  const receivedCount = event.settlements.filter((s) => s.isReceived).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/warikan" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
          <h2 className="text-xl font-bold text-slate-800">精算詳細</h2>
        </div>
        <button
          type="button"
          className="text-xs text-red-500 hover:text-red-700 hover:underline"
          onClick={handleDeleteEvent}
          disabled={isMutating}
        >
          削除
        </button>
      </div>

      <div className="space-y-4">
        {/* イベント情報 */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 truncate">{event.eventName}</h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">管理: {event.manager?.name ?? '未設定'}</p>
              </div>
              <Select value={event.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-auto shrink-0">
                  {statusBadge(event.status)}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENTERING">明細入力中</SelectItem>
                  <SelectItem value="PAYING">支払待ち</SelectItem>
                  <SelectItem value="CLOSED">クローズ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
              <div><span className="text-gray-400">明細追加期日:</span> {formatShortDate(event.detailDeadline)}</div>
              <div><span className="text-gray-400">支払期日:</span> {formatShortDate(event.paymentDeadline)}</div>
            </div>
            {event.event && (
              <div className="mt-2 text-sm text-gray-600">
                <span className="text-gray-400">イベント:</span>{' '}
                <Link href={`/calendar`} className="text-blue-500 hover:underline">
                  {event.event.title}（{formatShortDate(event.event.date)}{event.event.endDate ? `〜${formatShortDate(event.event.endDate)}` : ''}）
                </Link>
              </div>
            )}
            <div className="mt-3">
              <span className="text-xs text-gray-400">参加者:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {event.participants.map((p) => (
                  <span key={p.member.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                    {p.member.name}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 立替明細 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-800">立替明細</CardTitle>
          </CardHeader>
          <CardContent>
            {event.expenses.length === 0 ? (
              <p className="text-sm text-gray-500">まだ明細がありません</p>
            ) : (
              <div className="space-y-2">
                {event.expenses.map((expense) => {
                  const isAllMembers = expense.debtors.length === 0 || expense.debtors.length === event.participants.length;
                  const debtorNames = isAllMembers ? '全員' : expense.debtors.map((d) => d.member.name).join('・');

                  // 編集モード
                  if (editingExpenseId === expense.id) {
                    return (
                      <div key={expense.id} className="bg-gray-50 rounded-lg p-3 border space-y-2">
                        <div className="flex gap-2">
                          <Select value={editPayerId} onValueChange={setEditPayerId}>
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="立替者" />
                            </SelectTrigger>
                            <SelectContent>
                              {event.participants.map((p) => (
                                <SelectItem key={p.member.id} value={p.member.id}>
                                  {p.member.name}（{p.member.fullName}）
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            className="w-28 text-right font-mono"
                            placeholder="金額"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                          />
                        </div>
                        <Input
                          placeholder="内容（例: コート代）"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                        />
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs text-gray-500">対象者</Label>
                            <button
                              type="button"
                              className="text-xs text-blue-500 hover:underline"
                              onClick={() => {
                                if (editDebtorIds.size === event.participants.length) {
                                  setEditDebtorIds(new Set());
                                } else {
                                  setEditDebtorIds(new Set(event.participants.map((p) => p.member.id)));
                                }
                              }}
                            >
                              {editDebtorIds.size === event.participants.length ? '全解除' : '全選択'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {event.participants.map((p) => {
                              const checked = editDebtorIds.has(p.member.id);
                              return (
                                <button
                                  key={p.member.id}
                                  type="button"
                                  className={`text-xs px-2 py-1 rounded-full border transition ${
                                    checked
                                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                                      : 'bg-gray-50 text-gray-400 border-gray-200'
                                  }`}
                                  onClick={() => {
                                    const next = new Set(editDebtorIds);
                                    if (checked) {
                                      next.delete(p.member.id);
                                    } else {
                                      next.add(p.member.id);
                                    }
                                    setEditDebtorIds(next);
                                  }}
                                >
                                  {p.member.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={cancelEditExpense}
                          >
                            キャンセル
                          </Button>
                          <Button
                            size="sm"
                            className="bg-slate-800 hover:bg-slate-700"
                            onClick={handleUpdateExpense}
                            disabled={isMutating || !editPayerId || !editDescription || !editAmount || editDebtorIds.size === 0}
                          >
                            保存
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={expense.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{expense.payer.name}</p>
                        <p className="text-xs text-gray-500 truncate">{expense.description}</p>
                        <p className="text-xs text-gray-400 truncate">対象: {debtorNames}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="font-bold text-sm text-slate-800">¥{expense.amount.toLocaleString()}</p>
                        {event.status === 'ENTERING' && (
                          <>
                            <button
                              type="button"
                              className="text-xs text-blue-500 hover:underline"
                              onClick={() => startEditExpense(expense)}
                            >
                              編集
                            </button>
                            <button
                              type="button"
                              className="text-xs text-red-500 hover:underline"
                              onClick={() => handleDeleteExpense(expense.id)}
                              disabled={isMutating}
                            >
                              削除
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="mt-3 pt-3 border-t font-bold text-slate-800">
                  <div className="flex justify-between">
                    <span>合計</span>
                    <span>¥{totalExpenses.toLocaleString()}</span>
                  </div>
                  <p className="text-xs font-normal text-gray-500 text-right mt-0.5">1人あたり ¥{perPerson.toLocaleString()}</p>
                </div>
              </div>
            )}

            {/* 明細追加フォーム */}
            {event.status === 'ENTERING' && (
              <>
                {showExpenseForm ? (
                  <div className="mt-4 bg-gray-50 rounded-lg p-3 border space-y-2">
                    <div className="flex gap-2">
                      <Select value={expensePayerId} onValueChange={setExpensePayerId}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="立替者" />
                        </SelectTrigger>
                        <SelectContent>
                          {event.participants.map((p) => (
                            <SelectItem key={p.member.id} value={p.member.id}>
                              {p.member.name}（{p.member.fullName}）
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="w-28 text-right font-mono"
                        placeholder="金額"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                      />
                    </div>
                    <Input
                      placeholder="内容（例: コート代）"
                      value={expenseDescription}
                      onChange={(e) => setExpenseDescription(e.target.value)}
                    />
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-gray-500">対象者</Label>
                        <button
                          type="button"
                          className="text-xs text-blue-500 hover:underline"
                          onClick={() => {
                            if (expenseDebtorIds.size === event.participants.length) {
                              setExpenseDebtorIds(new Set());
                            } else {
                              setExpenseDebtorIds(new Set(event.participants.map((p) => p.member.id)));
                            }
                          }}
                        >
                          {expenseDebtorIds.size === event.participants.length ? '全解除' : '全選択'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {event.participants.map((p) => {
                          const checked = expenseDebtorIds.has(p.member.id);
                          return (
                            <button
                              key={p.member.id}
                              type="button"
                              className={`text-xs px-2 py-1 rounded-full border transition ${
                                checked
                                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                                  : 'bg-gray-50 text-gray-400 border-gray-200'
                              }`}
                              onClick={() => {
                                const next = new Set(expenseDebtorIds);
                                if (checked) {
                                  next.delete(p.member.id);
                                } else {
                                  next.add(p.member.id);
                                }
                                setExpenseDebtorIds(next);
                              }}
                            >
                              {p.member.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowExpenseForm(false)}
                      >
                        キャンセル
                      </Button>
                      <Button
                        size="sm"
                        className="bg-slate-800 hover:bg-slate-700"
                        onClick={handleAddExpense}
                        disabled={isMutating || !expensePayerId || !expenseDescription || !expenseAmount || expenseDebtorIds.size === 0}
                      >
                        追加
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:border-amber-400 hover:text-amber-600 transition"
                    onClick={() => {
                      setExpenseDebtorIds(new Set(event.participants.map((p) => p.member.id)));
                      setShowExpenseForm(true);
                    }}
                  >
                    + 立替を追加
                  </button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* 精算計算ボタン */}
        {event.status === 'ENTERING' && event.expenses.length > 0 && (
          <Button
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium"
            onClick={handleCalculateSettlements}
            disabled={isMutating}
          >
            精算を計算する
          </Button>
        )}

        {/* 精算結果 */}
        {event.settlements.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-800">精算結果</CardTitle>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                  {receivedCount}/{event.settlements.length} 受領済
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {event.settlements.map((settlement) => (
                  <div key={settlement.id} className="bg-gray-50 rounded-lg p-3 border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-sm min-w-0">
                        <span className="font-medium shrink-0">{settlement.fromMember.name}</span>
                        <span className="text-gray-400 shrink-0">&rarr;</span>
                        <span className="font-medium shrink-0">{settlement.toMember.name}</span>
                      </div>
                      <span className="font-bold text-sm sm:text-lg shrink-0 ml-2">¥{settlement.amount.toLocaleString()}</span>
                    </div>
                    {settlement.toMember.paypayId && (
                      <p className="text-xs text-gray-500 mb-2">
                        送金先: <span className="text-red-500 font-mono font-medium">@{settlement.toMember.paypayId}</span>
                      </p>
                    )}
                    {settlement.toMember.bankAccount && (
                      <p className="text-xs text-gray-500 mb-2">
                        振込先: {settlement.toMember.bankAccount.bankName} {settlement.toMember.bankAccount.branchName}{' '}
                        {accountTypeLabel(settlement.toMember.bankAccount.accountType)}{' '}
                        <span className="font-mono">{maskAccountNumber(settlement.toMember.bankAccount.accountNumber)}</span>{' '}
                        {settlement.toMember.bankAccount.accountHolder}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {settlement.toMember.paypayId && (
                        <a
                          href={`paypay://transfer?userId=${settlement.toMember.paypayId}&amount=${settlement.amount}`}
                          className="inline-flex items-center gap-1 bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium hover:bg-red-600 transition"
                        >
                          Pay 送金
                        </a>
                      )}
                      {!settlement.isPaid && event.status !== 'CLOSED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isMutating}
                          onClick={() => handleSettlementAction(settlement.id, 'pay')}
                        >
                          送金済み
                        </Button>
                      )}
                      {settlement.isPaid && !settlement.isReceived && event.status !== 'CLOSED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-green-600 border-green-300"
                          disabled={isMutating}
                          onClick={() => handleSettlementAction(settlement.id, 'receive')}
                        >
                          受領確認
                        </Button>
                      )}
                      {settlement.isReceived && (
                        <span className="text-xs text-green-600 font-medium">受領済み</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                ※ 立替者（受取人）が「受領確認」をチェック。全員受領で自動的にクローズ
              </p>
            </CardContent>
          </Card>
        )}

        {/* メモ */}
        {event.memo && (
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-800">メモ</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">{event.memo}</p>
            </CardContent>
          </Card>
        )}

        {/* walicaリンク */}
        {event.walicaUrl && (
          <div className="bg-blue-50 rounded-xl p-4 shadow-sm border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white text-xs font-bold">W</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">walicaで確認</p>
                <p className="text-xs text-gray-500">移行前のwalicaデータを参照</p>
              </div>
              <a href={event.walicaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-sm font-medium hover:underline">
                開く &rarr;
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
