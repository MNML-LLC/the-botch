# CLAUDE.md — the-botch

## Repository Purpose

`info-mnml/the-botch` は MNML メンバー向けの内部 Web アプリ。以下の機能を提供する:

- **男気イベント** (otokogi): じゃんけん勝負による支払い担当決定と履歴管理
- **割り勘** (warikan): イベント費用の立替・精算管理
- **カレンダー**: MNML イベントのスケジュール管理
- **メンバー管理**: アクティブメンバーのプロフィール・銀行口座情報

デプロイ先: Vercel (Tokyo リージョン `hnd1`)

---

## MNML 組織との関係

| 項目 | 値 |
|------|-----|
| 管轄 M 層 | **thebotch** |
| 関連 M 層 | events（イベント連携）、shift（出欠連携の可能性） |
| 利用者 | MNML 全メンバー（chief / ba / consulting / thebotch / shift / web / events / sns） |

---

## claude-code-action 運用ルール

### トリガー

- GitHub Issue 本文または最初のコメントに `@claude` を含めることで発火
- `## 経緯 / ## 要件 / ## 受け入れ条件` セクションを含む Issue テンプレートを使うこと

### ブランチ・マージ

- claude-code-action は `claude/issue-<num>-<YYYYMMDD>-<HHMM>` ブランチを自動作成
- `main` への直接 push は禁止
- PR に `auto-merge` ラベルを付けると自動マージ（squash merge）される
- 自動マージせず M 層レビューを経たい場合はラベルを付けない

### PR / コミット規約

- PR タイトルおよびコミットメッセージは**英語**で記述
- コミットメッセージは `<type>: <summary>` 形式（例: `feat: add warikan settlement export`）
- 既存テスト・lint がある場合は必ず通してから PR を作成

### Issue / PR テンプレート期待値

Issue には以下のセクションを含めること:

```
## 経緯
## 要件
## 受け入れ条件
```

---

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| フレームワーク | Next.js 15+ (App Router) / React 19 |
| 言語 | TypeScript 5（strict モード） |
| DB | PostgreSQL + Prisma ORM |
| スタイリング | Tailwind CSS v4 |
| 状態管理 | Zustand / TanStack Query |
| フォーム | React Hook Form + Zod |
| UI コンポーネント | shadcn/ui (Radix UI ベース) |
| 単体テスト | Vitest |
| E2E テスト | Playwright |
| ランタイム | Node.js ^22.12.0 |
| デプロイ | Vercel |

---

## ディレクトリ構造

```
the-botch/          # リポルート
├── CLAUDE.md
├── README.md
└── the-botch/      # Next.js アプリルート
    ├── app/
    │   ├── api/        # Route Handlers
    │   ├── calendar/   # カレンダーページ
    │   ├── members/    # メンバー管理ページ
    │   ├── otokogi/    # 男気イベントページ
    │   └── warikan/    # 割り勘ページ
    ├── components/
    │   ├── layout/     # ヘッダー・ナビゲーション等
    │   └── ui/         # shadcn/ui コンポーネント
    ├── lib/            # ユーティリティ・Prisma クライアント
    ├── prisma/
    │   ├── schema.prisma
    │   └── migrations/
    ├── tests/          # Vitest 単体テスト
    └── e2e/            # Playwright E2E テスト
```

---

## コーディング規約

### TypeScript / React

- `strict: true` を維持。`any` は原則禁止
- コンポーネントは関数コンポーネント（`const Foo: React.FC` or 型推論）
- Server Component / Client Component の境界を明確に。`"use client"` は最小限に
- パスエイリアス `@/*` を使用（`../../` の多段は避ける）

### Linting / Formatting

```bash
cd the-botch
npm run lint        # ESLint (next lint)
npm run test        # Vitest 単体テスト
npm run test:e2e    # Playwright E2E テスト
```

- PR 作成前に `npm run lint` と `npm run test` を必ず実行してエラーがないことを確認
- `next lint` がエラーを出す場合は修正してからコミット

### Prisma

- スキーマ変更後は `npx prisma generate` を実行
- マイグレーションは `npx prisma migrate dev --name <description>` で作成
- `schema.prisma` のモデル名はパスカルケース、`@@map` でスネークケースのテーブル名を指定

### API Routes

- `app/api/**/*.ts` の Route Handlers は Vercel 設定で最大 10 秒タイムアウト
- レスポンスは `NextResponse.json()` を使用
- エラーは適切な HTTP ステータスコードを返す

---

## セキュリティ・機密情報

以下のファイルは**絶対にコミットしない**:

- `.env`, `.env.local`, `.env.production` など `.env*` ファイル（`.env.example` は除く）
- `credentials*.json`, `service-account*.json`
- `.tokens*.json`
- `*.pem`, `*.key`

環境変数の追加が必要な場合は `.env.example` にキー名（値なし）を追加し、実際の値は Vercel の Environment Variables に設定する。

---

## ローカル開発セットアップ

```bash
cd the-botch
npm install
cp .env.example .env.local   # DATABASE_URL 等を記入
npx prisma generate
npx prisma migrate dev
npm run dev                  # http://localhost:3000
```
