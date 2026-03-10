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
