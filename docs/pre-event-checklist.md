# イベント前チェックリスト（開催3日前実施）

MNML イベントの当日にシステム障害を起こさないため、**開催3日前**に以下の疎通確認を実施する。

## 目的

- 本番 URL / DB / 精算計算 / CI の状態を実データで確認する
- 直前に見つかったバグを P0/P1 として即応できるバッファを確保する
- KPI「開催3日前以降の未解決 P0/P1 バグ 0 件」を構造的に担保する

## 実施タイミング

- **開催3日前**（例: 土曜開催なら水曜）
- GitHub Issue テンプレート「イベント前チェックリスト」で Issue を起票し、担当者を割り当てる

## 実施者

- 原則 M層 thebotch 担当
- 不在時は chief または platform に代行を依頼する

---

## チェック項目

### 1. 本番 URL の疎通確認

- [ ] Vercel 本番 URL（`https://the-botch.vercel.app/` またはカスタムドメイン）がトップページで 200 を返す
- [ ] `/otokogi` / `/warikan` / `/calendar` / `/members` の各ページが 200 を返す
- [ ] レスポンス時間が体感で 3 秒以内

確認コマンド例:

```bash
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://the-botch.vercel.app/
```

### 2. Supabase (本番) DB への接続・クエリ

- [ ] `/api/members` が 200 で返り、アクティブメンバー一覧が取得できる
- [ ] `/api/otokogi?cursor=` の 1 ページ目が取得できる
- [ ] `/api/warikan?status=CLOSED` の 1 ページ目が取得できる
- [ ] Supabase ダッシュボードで接続エラーログが直近 24 時間ゼロ

### 3. 精算計算（割り勘・端数処理）の検証

テストイベント（あるいは過去 CLOSED 済みイベント）で、`WarikanSettlement` の合計金額と `WarikanExpense` の合計金額が **1 円単位でも乖離しないこと** を確認する。

- [ ] `POST /api/warikan/:id/settlements`（テストイベント）で精算計算が実行できる
- [ ] `sum(expense.amount) === sum(settlement.amount)` になっている
- [ ] 端数（3人で 100 円等）が特定メンバーに寄せられ、金額が失われない
- [ ] 精算結果の各行が「送金者 → 受領者 / 金額」の形で正しく表示される

確認方法例（sqlite/psql）:

```sql
-- 支出合計
SELECT SUM(amount) FROM "WarikanExpense" WHERE "warikanEventId" = '<test-event-id>';
-- 精算合計
SELECT SUM(amount) FROM "WarikanSettlement" WHERE "warikanEventId" = '<test-event-id>';
```

### 4. Stripe Webhook エンドポイントの疎通（設定済みの場合）

- [ ] Stripe ダッシュボード → Developers → Webhooks → 対象エンドポイントが `Enabled` 状態
- [ ] 直近 24 時間の delivery が全て 2xx
- [ ] Stripe CLI で `stripe trigger payment_intent.succeeded` を投げ、200 が返る

（Stripe 未導入の場合はこの項目をスキップ可）

### 5. 直近 CI / デプロイ状態

- [ ] `gh run list --repo MNML-LLC/the-botch --limit 5` で直近 5 件が全て `completed / success`
- [ ] Vercel の最新デプロイが `Ready`
- [ ] main ブランチと本番デプロイのコミット SHA が一致

確認コマンド例:

```bash
gh run list --repo MNML-LLC/the-botch --limit 5
gh api repos/MNML-LLC/the-botch/deployments --jq '.[0:3][] | {sha, environment, created_at}'
```

---

## 追加確認項目（任意）

- [ ] LIFF 連携ページ (`/liff/link`) が LINE ミニアプリで開ける
- [ ] メンバーの銀行口座情報が表示される（`/api/members/:id/bank-account`）
- [ ] カレンダーの月次表示が正しい（`/api/calendar?year=YYYY&month=M`）

## 異常時の対応

- P0（イベント運用不能・データ喪失リスク）: 即 chief / CEO にエスカレーション、`P0` ラベル付与
- P1（機能不全・回避策あり）: `P1` ラベルで起票、当日までに解消
- P2 以下（見た目・軽微）: 通常フローで別 Issue に切り出す

## 参考

- 発端: [mnml-agents#3301](https://github.com/MNML-LLC/mnml-agents/issues/3301)
- 本ドキュメント Issue: [MNML-LLC/the-botch#288](https://github.com/MNML-LLC/the-botch/issues/288)
