"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Yen } from '@/components/ui/yen';
import { WarikanStatusBadge } from '@/components/ui/warikan-status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { UserCheck } from 'lucide-react';
import {
  useWarikanDetail,
  useWarikanSettlementAction,
  useWarikanSettlements,
} from '@/hooks/use-warikan';
import { toast } from '@/hooks/use-toast';
import { maskAccountNumber } from '@/lib/utils';

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

type WarikanDetail = {
  id: string;
  eventName: string;
  status: 'ENTERING' | 'PAYING' | 'CLOSED';
  manager: Member | null;
  participants: { member: Member }[];
};

const LOCAL_STORAGE_KEY = 'warikan:my-task:selected-member';

function accountTypeLabel(type: BankAccount['accountType']): string {
  return type === 'CHECKING' ? '当座' : '普通';
}

function formatBankAccountText(bank: BankAccount): string {
  return [
    `${bank.bankName} ${bank.branchName}`,
    `${accountTypeLabel(bank.accountType)} ${bank.accountNumber}`,
    bank.accountHolder,
  ].join('\n');
}

async function copyToClipboard(text: string, successLabel: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: `${successLabel}をコピーしました` });
    return true;
  } catch {
    toast({ variant: 'destructive', title: 'コピーに失敗しました' });
    return false;
  }
}

function CopyButton({
  text,
  label,
  className = '',
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleClick = async () => {
    const ok = await copyToClipboard(text, label);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 ${className}`.trim()}
    >
      {copied ? 'コピー済' : `${label}をコピー`}
    </button>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>全体の精算状況</span>
        <span className="font-medium text-slate-700">
          {current}/{total} 件完了（{pct}%）
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
    </div>
  );
}

function SendTaskCard({
  settlement,
  disabled,
  onMarkPaid,
}: {
  settlement: Settlement;
  disabled: boolean;
  onMarkPaid: (s: Settlement) => void;
}) {
  const bank = settlement.toMember.bankAccount;
  const paypayId = settlement.toMember.paypayId;

  const statusPill = settlement.isReceived ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      ✓ 確認済
    </span>
  ) : settlement.isPaid ? (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      送金済（確認待ち）
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      未送金
    </span>
  );

  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">送金先</p>
          <p className="truncate text-base font-bold text-slate-800">
            {settlement.toMember.name} さんに
          </p>
        </div>
        <Yen value={settlement.amount} size="lg" className="shrink-0 font-bold text-slate-800" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        {statusPill}
      </div>

      {paypayId && (
        <div className="mb-2 rounded-md border border-red-100 bg-red-50 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-500">PayPay ID:</p>
            <span className="font-mono text-sm font-medium text-red-600">@{paypayId}</span>
            <CopyButton text={paypayId} label="ID" className="ml-auto" />
          </div>
          <a
            href={`paypay://transfer?userId=${paypayId}&amount=${settlement.amount}`}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            PayPay で送金する
          </a>
        </div>
      )}

      {bank && (
        <div className="mb-3 rounded-md border bg-slate-50 p-2 text-xs text-slate-700">
          <div className="mb-1 flex items-center justify-between">
            <p className="font-medium text-slate-500">振込先</p>
            <CopyButton text={formatBankAccountText(bank)} label="口座情報" />
          </div>
          <dl className="space-y-0.5">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">銀行</dt>
              <dd className="text-right">
                {bank.bankName} {bank.branchName}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">種別</dt>
              <dd className="text-right">{accountTypeLabel(bank.accountType)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">口座番号</dt>
              <dd className="text-right">
                <span className="font-mono">{maskAccountNumber(bank.accountNumber)}</span>{' '}
                <CopyButton text={bank.accountNumber} label="番号" className="ml-1" />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">名義</dt>
              <dd className="text-right">{bank.accountHolder}</dd>
            </div>
          </dl>
        </div>
      )}

      {!paypayId && !bank && (
        <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
          送金先の PayPay ID / 口座情報が未登録です。直接確認してください。
        </p>
      )}

      {!settlement.isPaid && (
        <Button
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={disabled}
          onClick={() => onMarkPaid(settlement)}
        >
          送った ✓
        </Button>
      )}
    </div>
  );
}

function ReceiveTaskCard({
  settlement,
  disabled,
  onMarkReceived,
}: {
  settlement: Settlement;
  disabled: boolean;
  onMarkReceived: (s: Settlement) => void;
}) {
  const statusPill = settlement.isReceived ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      ✓ 確認済
    </span>
  ) : settlement.isPaid ? (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      送金済み（確認してください）
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      待ち
    </span>
  );

  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">受取</p>
          <p className="truncate text-base font-bold text-slate-800">
            {settlement.fromMember.name} さんから
          </p>
        </div>
        <Yen value={settlement.amount} size="lg" className="shrink-0 font-bold text-slate-800" />
      </div>

      <div className="mb-3 flex items-center justify-between">{statusPill}</div>

      {settlement.isPaid && !settlement.isReceived && (
        <Button
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={disabled}
          onClick={() => onMarkReceived(settlement)}
        >
          受取確認 ✓
        </Button>
      )}
    </div>
  );
}

export default function WarikanMyTaskPage() {
  const params = useParams();
  const id = params.id as string;

  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const restoredRef = useRef(false);

  const { data: event, isLoading: loadingEvent } = useWarikanDetail<WarikanDetail>(id);
  const { data: settlements = [], isLoading: loadingSettlements } = useWarikanSettlements<
    Settlement[]
  >(id, !!event && event.status !== 'ENTERING');

  // localStorage から前回選択を復元（イベント取得後、選択肢が有効な場合のみ）
  useEffect(() => {
    if (restoredRef.current || !event) return;
    restoredRef.current = true;
    try {
      const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored && event.participants.some((p) => p.member.id === stored)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage からの初回復元
        setSelectedMemberId(stored);
      }
    } catch {
      /* localStorage 無効時は無視 */
    }
  }, [event]);

  const handleSelectMember = (value: string) => {
    setSelectedMemberId(value);
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, value);
    } catch {
      /* 保存失敗は無視 */
    }
  };

  const settlementActionMutation = useWarikanSettlementAction(id, {
    onSuccess: (_data, variables) => {
      toast({
        title: variables.action === 'pay' ? '送金済みにしました' : '受領を確認しました',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: '操作に失敗しました',
        description: error.message,
      });
    },
  });

  const isMutating = settlementActionMutation.isPending;

  const handleMarkPaid = (settlement: Settlement) => {
    if (isMutating) return;
    const msg = `${settlement.toMember.name}さんへの ¥${settlement.amount.toLocaleString()} の送金を完了しましたか？`;
    if (!confirm(msg)) return;
    settlementActionMutation.mutate({ settlementId: settlement.id, action: 'pay' });
  };

  const handleMarkReceived = (settlement: Settlement) => {
    if (isMutating) return;
    settlementActionMutation.mutate({ settlementId: settlement.id, action: 'receive' });
  };

  const { sendTasks, receiveTasks } = useMemo(() => {
    const send = settlements.filter((s) => s.fromMemberId === selectedMemberId);
    const recv = settlements.filter((s) => s.toMemberId === selectedMemberId);
    const order = (a: Settlement, b: Settlement) => {
      // 未完了を先頭に、同一ステータス内は金額降順
      const aDone = a.isReceived ? 2 : a.isPaid ? 1 : 0;
      const bDone = b.isReceived ? 2 : b.isPaid ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return b.amount - a.amount;
    };
    return {
      sendTasks: [...send].sort(order),
      receiveTasks: [...recv].sort(order),
    };
  }, [settlements, selectedMemberId]);

  const receivedCount = settlements.filter((s) => s.isReceived).length;
  const totalCount = settlements.length;

  if (loadingEvent) {
    return <p className="text-sm text-gray-500">読み込み中...</p>;
  }
  if (!event) {
    return <p className="text-sm text-gray-500">イベントが見つかりません</p>;
  }

  return (
    <div className="max-w-xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/warikan/${id}`} className="text-gray-500 hover:text-gray-700">
            ← 幹事ビュー
          </Link>
          <h2 className="truncate text-xl font-bold text-slate-800">あなたが送る</h2>
        </div>
        <WarikanStatusBadge status={event.status} />
      </div>

      <div className="space-y-4">
        {/* イベント情報 */}
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-base font-bold text-slate-800">{event.eventName}</h3>
            <p className="mt-1 text-xs text-gray-500">
              管理: {event.manager?.name ?? '未設定'}
            </p>
          </CardContent>
        </Card>

        {/* メンバーセレクタ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-800">あなたは？</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedMemberId} onValueChange={handleSelectMember}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="自分を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {event.participants.map((p) => (
                  <SelectItem key={p.member.id} value={p.member.id}>
                    {p.member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-gray-500">
              選択はこのブラウザに保存されます（次回自動で復元）。
            </p>
          </CardContent>
        </Card>

        {/* ステータス別ガイド */}
        {event.status === 'ENTERING' && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-slate-700">
                まだ精算が確定していません。幹事が明細を入力して「精算を確定する」を押すと、ここに送金タスクが表示されます。
              </p>
              <Link
                href={`/warikan/${id}`}
                className="mt-3 inline-block text-sm text-blue-500 hover:underline"
              >
                幹事ビューを開く →
              </Link>
            </CardContent>
          </Card>
        )}

        {event.status !== 'ENTERING' && (
          <>
            {/* 進捗バー */}
            <Card>
              <CardContent className="pt-5">
                <ProgressBar current={receivedCount} total={totalCount} />
              </CardContent>
            </Card>

            {/* メンバー未選択 */}
            {!selectedMemberId && !loadingSettlements && (
              <EmptyState
                icon={UserCheck}
                title="メンバーを選択してください"
                description="上のセレクターから自分を選ぶと、送金タスクが表示されます。"
              />
            )}

            {/* あなたが送る */}
            {selectedMemberId && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-slate-800">あなたが送る</CardTitle>
                    <span className="text-xs text-slate-500">
                      {sendTasks.filter((s) => s.isPaid).length}/{sendTasks.length} 送金済
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {sendTasks.length === 0 ? (
                    <p className="text-sm text-gray-500">送金タスクはありません。</p>
                  ) : (
                    <div className="space-y-3">
                      {sendTasks.map((s) => (
                        <SendTaskCard
                          key={s.id}
                          settlement={s}
                          disabled={isMutating || event.status !== 'PAYING'}
                          onMarkPaid={handleMarkPaid}
                        />
                      ))}
                    </div>
                  )}
                  {event.status === 'CLOSED' && sendTasks.length > 0 && (
                    <p className="mt-3 text-xs text-gray-400">
                      このイベントはクローズ済みのため、操作はできません。
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* あなたが受け取る */}
            {selectedMemberId && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-slate-800">あなたが受け取る</CardTitle>
                    <span className="text-xs text-slate-500">
                      {receiveTasks.filter((s) => s.isReceived).length}/{receiveTasks.length} 受領済
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {receiveTasks.length === 0 ? (
                    <p className="text-sm text-gray-500">受取タスクはありません。</p>
                  ) : (
                    <div className="space-y-3">
                      {receiveTasks.map((s) => (
                        <ReceiveTaskCard
                          key={s.id}
                          settlement={s}
                          disabled={isMutating || event.status !== 'PAYING'}
                          onMarkReceived={handleMarkReceived}
                        />
                      ))}
                    </div>
                  )}
                  {event.status === 'PAYING' && (
                    <p className="mt-3 text-xs text-gray-400">
                      ※ 送金された金額を受け取ったら「受取確認」を押してください。全員の受領で自動的にクローズします。
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
