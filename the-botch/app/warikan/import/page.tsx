"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from '@/hooks/use-toast';
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
import { useMembers } from '@/hooks/use-members';
import {
  useWalicaImport,
  useWalicaPreview,
  type WalicaPreviewData,
} from '@/hooks/use-walica';

export default function WalicaImportPage() {
  const router = useRouter();
  const [walicaUrl, setWalicaUrl] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<WalicaPreviewData | null>(null);
  const [memberMapping, setMemberMapping] = useState<Record<string, string>>({});

  const { data: appMembers = [] } = useMembers();

  // Step 1: Walica URLからプレビュー取得
  const previewMutation = useWalicaPreview({
    onSuccess: (data) => {
      setPreview(data);
      setError('');
      // 自動マッチング結果をstateに反映
      const mapping: Record<string, string> = {};
      for (const m of data.members) {
        if (m.matchedMemberId) {
          mapping[m.walicaId] = m.matchedMemberId;
        }
      }
      setMemberMapping(mapping);
    },
    onError: (error) => {
      console.error(error);
      setError(error.message);
      setPreview(null);
      toast({ variant: 'destructive', title: 'データの取得に失敗しました', description: error.message });
    },
  });

  const handlePreview = () => {
    if (!walicaUrl.trim()) return;
    setError('');
    setPreview(null);
    previewMutation.mutate(walicaUrl.trim());
  };

  // Step 2: メンバーマッピングを更新
  const updateMapping = (walicaId: string, appMemberId: string) => {
    setMemberMapping((prev) => ({
      ...prev,
      [walicaId]: appMemberId,
    }));
  };

  // Step 3: インポート実行
  const importMutation = useWalicaImport({
    onSuccess: (data) => {
      toast({ title: 'Walicaからインポートしました' });
      router.push(`/warikan/${data.event.id}`);
    },
    onError: (error) => {
      console.error(error);
      setError(error.message);
      toast({ variant: 'destructive', title: 'インポートに失敗しました', description: error.message });
    },
  });

  const handleImport = () => {
    if (!preview) return;
    const unmapped = preview.members.filter((m) => !memberMapping[m.walicaId]);
    if (unmapped.length > 0) {
      setError(`未マッチのメンバーがいます: ${unmapped.map((m) => m.walicaName).join(', ')}`);
      return;
    }
    setError('');
    importMutation.mutate({
      walicaUrl: walicaUrl.trim(),
      memberMapping: preview.members.map((m) => ({
        walicaId: m.walicaId,
        walicaName: m.walicaName,
        appMemberId: memberMapping[m.walicaId],
      })),
    });
  };

  // 全メンバーがマッチ済みか
  const allMapped = preview
    ? preview.members.every((m) => memberMapping[m.walicaId])
    : false;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/warikan" className="text-gray-500 hover:text-gray-700">← 戻る</Link>
        <h2 className="text-xl font-bold text-slate-800">Walicaからインポート</h2>
      </div>

      {/* Step 1: URL入力 */}
      <Card className="mb-4">
        <CardContent className="pt-5">
          <Label>Walica URL</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={walicaUrl}
              onChange={(e) => setWalicaUrl(e.target.value)}
              placeholder="https://walica.jp/g/xxxxx"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
            />
            <Button
              onClick={handlePreview}
              disabled={previewMutation.isPending || !walicaUrl.trim()}
              className="bg-slate-800 hover:bg-slate-700 shrink-0"
            >
              {previewMutation.isPending ? '取得中...' : 'データ取得'}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            WalicaのグループページのURLを貼り付けてください
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Step 2: プレビュー */}
      {preview && (
        <>
          {/* グループ情報 */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-slate-800">グループ情報</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-slate-800">{preview.groupName}</p>
                  <p className="text-xs text-gray-500">グループ名</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-800">{preview.expenseCount}</p>
                  <p className="text-xs text-gray-500">立替件数</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 truncate">
                    ¥{preview.totalAmount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">合計金額</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* メンバーマッチング */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-slate-800">メンバーマッチング</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">
                Walicaのメンバーとアプリのメンバーを紐付けてください
              </p>
              <div className="space-y-3">
                {preview.members.map((m) => (
                  <div key={m.walicaId} className="flex items-center gap-2">
                    <span className="text-sm text-slate-800 w-20 shrink-0 truncate">
                      {m.walicaName}
                    </span>
                    <span className="text-gray-400 shrink-0">→</span>
                    <Select
                      value={memberMapping[m.walicaId] ?? ''}
                      onValueChange={(v) => updateMapping(m.walicaId, v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        {appMembers.map((am) => (
                          <SelectItem key={am.id} value={am.id}>
                            {am.name}（{am.fullName}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {memberMapping[m.walicaId] && (
                      <span className="text-green-500 text-xs shrink-0">✓</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 立替明細プレビュー */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-slate-800">
                立替明細（{preview.expenses.length}件）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {preview.expenses.map((e, i) => (
                  <div key={i} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 truncate">{e.itemName}</p>
                      <p className="text-xs text-gray-500">{e.payerName}が立替</p>
                    </div>
                    <p className="text-sm font-medium text-slate-800 shrink-0 ml-2">
                      ¥{e.amount.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 精算結果プレビュー */}
          {preview.settlements.length > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-slate-800">
                  精算結果（{preview.settlements.length}件）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {preview.settlements.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b last:border-0">
                      <p className="text-sm text-slate-800">
                        {s.senderName} → {s.receiverName}
                      </p>
                      <p className="text-sm font-medium text-slate-800 shrink-0">
                        ¥{s.amount.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: インポート実行 */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" asChild>
              <Link href="/warikan">キャンセル</Link>
            </Button>
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-700"
              onClick={handleImport}
              disabled={importMutation.isPending || !allMapped}
            >
              {importMutation.isPending ? 'インポート中...' : 'インポート実行'}
            </Button>
          </div>

          {!allMapped && (
            <p className="text-xs text-amber-600 mt-2 text-center">
              全メンバーのマッチングを完了してください
            </p>
          )}
        </>
      )}
    </div>
  );
}
