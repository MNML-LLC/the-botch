# The botch

イベント参加者のじゃんけん勝負と精算を管理する Next.js アプリ。

## 技術スタック

- Next.js 15 / React 19
- MongoDB + Prisma
- Supabase
- Tailwind CSS

## セットアップ

```bash
cd danketsu-app
npm install
cp .env.example .env.local  # 値を記入
npx prisma generate
npm run dev
```

http://localhost:3000 で起動。

## 運用

MNML イベント開催3日前に、GitHub Issue テンプレート「イベント前チェックリスト」で Issue を起票し、本番 URL・DB 接続・精算計算・CI の疎通を確認する（詳細: [`docs/pre-event-checklist.md`](docs/pre-event-checklist.md)）。

<!-- auto-deploy test 1785190713 -->
