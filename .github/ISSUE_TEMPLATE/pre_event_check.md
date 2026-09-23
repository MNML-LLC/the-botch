---
name: イベント前チェックリスト
about: 開催3日前に実施する本番URL・DB接続・精算計算の疎通確認
title: "[Pre-event Check] "
labels: ["pre-event-check"]
---

<!-- 詳細は docs/pre-event-checklist.md を参照 -->

## 対象イベント

- イベント名:
- 開催日:
- 実施日（開催3日前）:
- 担当者:

## チェック項目

### 1. 本番 URL の疎通確認

- [ ] Vercel 本番 URL がトップページで 200 を返す
- [ ] `/otokogi` / `/warikan` / `/calendar` / `/members` の各ページが 200 を返す
- [ ] レスポンス時間が体感で 3 秒以内

### 2. Supabase (本番) DB への接続・クエリ

- [ ] `/api/members` が 200 で返る
- [ ] `/api/otokogi?cursor=` の 1 ページ目が取得できる
- [ ] `/api/warikan?status=CLOSED` の 1 ページ目が取得できる
- [ ] Supabase ダッシュボードで接続エラーが直近 24 時間ゼロ

### 3. 精算計算（割り勘・端数処理）の検証

- [ ] `POST /api/warikan/:id/settlements`（テストイベント）で精算計算が実行できる
- [ ] `sum(expense.amount) === sum(settlement.amount)` になっている
- [ ] 端数（3人で 100 円等）が特定メンバーに寄せられ、金額が失われない

### 4. Stripe Webhook エンドポイントの疎通（設定済みの場合）

- [ ] Stripe ダッシュボードで Webhook が `Enabled`
- [ ] 直近 24 時間の delivery が全て 2xx
- [ ] `stripe trigger` で 200 が返る（Stripe CLI 導入済みの場合）

### 5. 直近 CI / デプロイ状態

- [ ] `gh run list --limit 5` で直近 5 件が全て success
- [ ] Vercel の最新デプロイが `Ready`
- [ ] main と本番デプロイのコミット SHA が一致

## 検出された問題

<!-- 見つかった不具合を書く。P0/P1 は別 Issue に切り出しリンクを貼る -->

- [ ] 問題なし
- 検出した Issue: (なし / #xxx)

## 実施結果

- 実施日時:
- 実施者:
- 結果: (OK / 一部 NG / NG)
- メモ:
