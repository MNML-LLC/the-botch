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

---

## API 仕様

Next.js Route Handlers (`the-botch/app/api/**/route.ts`) の全エンドポイント一覧。実装追加・重複防止のリファレンス。

### 共通ルール

- ベース URL: `/api`
- レスポンス: `NextResponse.json()`（`Content-Type: application/json`）
- エラー形式: `{ "error": "日本語メッセージ" }`（一部エンドポイントは追加フィールドあり）
- ボディサイズ上限: 1MB（`MAX_BODY_BYTES`, `lib/api-validation.ts`）
- メンバー ID 配列（`participantIds` / `debtorIds` / `memberIds`）は最大 50 件（`MAX_PARTICIPANTS`）
- Vercel タイムアウト: 10 秒
- 日付は ISO 8601 文字列（`YYYY-MM-DD` または `YYYY-MM-DDTHH:mm:ssZ`）で受け付ける
- ID は UUID v4 想定（`idString`: 1〜36 文字）
- 金額は正の整数（1〜1,000,000,000）
- 共通エラーコード:
  - `400` バリデーションエラー / 不正なステータス遷移 / JSON パース失敗 / ボディサイズ超過
  - `404` リソース未発見（Prisma `P2025` / `P2003` を含む）
  - `409` 一意制約違反（Prisma `P2002`） / メンバー非アクティブ化時の進行中割り勘参加
  - `500` 想定外エラー（詳細はサーバーログに出力、レスポンスは fallback メッセージ）

### `/api/calendar`

| Method | Path | 説明 |
|---|---|---|
| GET | `/api/calendar` | 月次カレンダー（イベント + 男気 + 割り勘） |

**GET `/api/calendar`**

- クエリ: `year=YYYY`（省略時: 現在年）, `month=1〜12`（省略時: 現在月）
- レスポンス 200: `{ events: Event[], otokogiEvents: OtokogiEvent[], warikanEvents: (WarikanEvent & { displayDate: string | null })[] }`
  - `events`: `date` / `endDate` がその月に重なるカレンダーイベント
  - `otokogiEvents`: `eventDate` がその月に含まれる男気イベント
  - `warikanEvents`: `detailDeadline` / `paymentDeadline` / `displayDate` のいずれかがその月に含まれる割り勘イベント
- キャッシュ: `Cache-Control: private, max-age=300`

### `/api/events`

Prisma モデル `Event`（カレンダーイベント）を操作する。

| Method | Path | 説明 |
|---|---|---|
| GET | `/api/events` | イベント一覧（年月フィルタ可） |
| POST | `/api/events` | イベント作成 |
| GET | `/api/events/:id` | イベント詳細（男気・割り勘の紐付き含む） |
| PUT | `/api/events/:id` | イベント更新（部分更新可） |
| DELETE | `/api/events/:id` | イベント削除 |
| DELETE | `/api/events/:id/otokogi/:otokogiId` | 男気イベントの紐付け解除（`eventId → null`） |
| DELETE | `/api/events/:id/warikan/:warikanId` | 割り勘イベントの紐付け解除（`eventId → null`） |

**GET `/api/events`**

- クエリ: `year=YYYY`, `month=1〜12`（`year` と `month` は同時指定時のみフィルタ）
- レスポンス 200: `Array<{ id, title, date, endDate, createdAt, createdBy: { id, name }, _count: { participants }, otokogiEvents: {id}[], warikanEvents: {id}[] }>`
- キャッシュ: `Cache-Control: private, max-age=300`

**POST `/api/events`**

- ボディ:
  ```json
  {
    "title": "string (1〜200)",
    "date": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD | null | 省略可",
    "description": "string (≤1000) | null | 省略可",
    "eventType": "TRIP | HANGOUT | ACTIVITY | OTHER (default: HANGOUT)",
    "createdById": "member uuid",
    "participantIds": ["member uuid", ...] // 省略可、最大 50
  }
  ```
- レスポンス 201: `Event`（`createdBy` + `participants.member` を include）

**GET `/api/events/:id`**

- レスポンス 200: `Event`（`createdBy` / `participants.member` / `otokogiEvents.{payer,participants}` / `warikanEvents.{manager,participants,_count.expenses}` を include）
- レスポンス 404: イベント未発見
- キャッシュ: `Cache-Control: private, max-age=600`

**PUT `/api/events/:id`**

- ボディ（すべて optional の部分更新）: `title` / `date` / `endDate` / `description` / `eventType` / `participantIds`
- `participantIds` を指定すると全参加者を差し替える
- レスポンス 200: 更新後の `Event`

**DELETE `/api/events/:id`**

- レスポンス 200: `{ success: true }` / 404: イベント未発見

**DELETE `/api/events/:id/otokogi/:otokogiId`**

- 男気イベントの `eventId` を `null` に更新（男気レコード自体は残す）
- レスポンス 200: `{ success: true }` / 404: イベント未発見 or 該当男気なし

**DELETE `/api/events/:id/warikan/:warikanId`**

- 割り勘イベントの `eventId` を `null` に更新（割り勘レコード自体は残す）
- レスポンス 200: `{ success: true }` / 404: イベント未発見 or 該当割り勘なし

### `/api/members`

| Method | Path | 説明 |
|---|---|---|
| GET | `/api/members` | アクティブメンバー一覧 |
| POST | `/api/members` | メンバー作成 |
| GET | `/api/members/:id` | メンバー詳細（累計統計・参加履歴含む） |
| PUT | `/api/members/:id` | メンバー更新（部分更新可） |
| DELETE | `/api/members/:id` | メンバー論理削除（`isActive: false`） |
| GET | `/api/members/:id/bank-account` | 口座情報取得 |
| PUT | `/api/members/:id/bank-account` | 口座情報 upsert |
| DELETE | `/api/members/:id/bank-account` | 口座情報削除 |

**GET `/api/members`**

- クエリなし。`isActive: true` かつ `name ASC` で返す
- レスポンス 200: `Array<Member & { bankAccount: { id } | null }>`
- キャッシュ: `Cache-Control: private, max-age=300`

**POST `/api/members`**

- ボディ:
  ```json
  {
    "name": "string (1〜100, unique)",
    "fullName": "string (1〜100)",
    "initial": "string (1 char)",
    "colorBg": "string (≤50) | 省略可 (default: bg-gray-100)",
    "colorText": "string (≤50) | 省略可 (default: text-gray-700)",
    "paypayId": "string (≤100) | null | 省略可"
  }
  ```
- レスポンス 201: `Member` / 409: `name` 重複（`P2002`）

**GET `/api/members/:id`**

- レスポンス 200: `Member & { otokogiParticipations, warikanParticipations, stats: { otokogiParticipationCount, warikanParticipationCount, otokogiPaidCount, otokogiPaidTotal, warikanPaidCount, warikanPaidTotal, totalPaid } }`
- レスポンス 404: メンバー未発見
- キャッシュ: `Cache-Control: private, max-age=600`

**PUT `/api/members/:id`**

- ボディ（すべて optional）: `name` / `fullName` / `initial` / `colorBg` / `colorText` / `paypayId` / `isActive`
- `isActive: false` に変更する場合、進行中（`ENTERING` / `PAYING`）の割り勘に参加中なら 409 `{ error, inProgressCount }`
- レスポンス 200: `Member` / 404: 未発見

**DELETE `/api/members/:id`**

- 論理削除（`isActive: false`）。進行中割り勘参加者は 409 `{ error, inProgressCount }`
- レスポンス 200: `Member` / 404: 未発見

**GET `/api/members/:id/bank-account`**

- レスポンス 200: `BankAccount | null`（未登録は `null`） / 404: メンバー未発見
- キャッシュ: `Cache-Control: private, max-age=600`

**PUT `/api/members/:id/bank-account`**

- ボディ:
  ```json
  {
    "bankName": "string (1〜50)",
    "branchName": "string (1〜50)",
    "accountType": "SAVINGS | CHECKING",
    "accountNumber": "string (1〜7 桁の数字)",
    "accountHolder": "string (1〜100)"
  }
  ```
- upsert（memberId で一意）。レスポンス 200: `BankAccount` / 404: メンバー未発見（`P2003`）

**DELETE `/api/members/:id/bank-account`**

- レスポンス 200: `{ success: true }` / 404: 口座未登録（`P2025`）

### `/api/otokogi`

| Method | Path | 説明 |
|---|---|---|
| GET | `/api/otokogi` | 男気イベント一覧（カーソルページネーション） |
| POST | `/api/otokogi` | 男気イベント作成 |
| GET | `/api/otokogi/:id` | 男気イベント詳細 |
| PATCH | `/api/otokogi/:id` | 男気イベント部分更新 |
| DELETE | `/api/otokogi/:id` | 男気イベント削除 |
| GET | `/api/otokogi/stats` | 男気統計（キャッシュ有） |
| GET | `/api/otokogi/ranking` | 支払額ランキング |
| GET | `/api/otokogi/member-summary` | メンバー別収支サマリー |

**GET `/api/otokogi`**

- クエリ: `year=YYYY` / `payer=<memberId>` / `cursor=<eventId>`（前ページ末尾の ID）
- ページサイズ: 20 固定
- レスポンス 200: `{ data: OtokogiEvent[], nextCursor: string | null }`
- キャッシュ: `Cache-Control: private, max-age=60`

**POST `/api/otokogi`**

- ボディ:
  ```json
  {
    "eventDate": "YYYY-MM-DD",
    "eventName": "string (1〜100)",
    "payerId": "member uuid",
    "amount": 1〜1000000000,
    "place": "string (≤100) | null | 省略可",
    "hasAlbum": "boolean | 省略可 (default: false)",
    "memo": "string (≤1000) | null | 省略可",
    "eventId": "event uuid | null | 省略可",
    "participantIds": ["member uuid", ...] // 1〜50, 必須
  }
  ```
- レスポンス 201: `OtokogiEvent`（`payer` + `participants.member` include）
- 副作用: `/api/otokogi/stats` のキャッシュ無効化

**GET `/api/otokogi/:id`**

- レスポンス 200: `OtokogiEvent`（`payer` + `participants.member` include）
- レスポンス 404: 未発見
- キャッシュ: `Cache-Control: private, max-age=600`

**PATCH `/api/otokogi/:id`**

- ボディ（すべて optional）: `eventDate` / `eventName` / `payerId` / `amount` / `place` / `hasAlbum` / `memo` / `participantIds`（1〜50）
- `participantIds` 指定時はトランザクションで全差し替え
- レスポンス 200: 更新後の `OtokogiEvent` / 404: 未発見（`P2025`）
- 副作用: 統計キャッシュ無効化

**DELETE `/api/otokogi/:id`**

- レスポンス 200: `{ success: true }` / 404: 未発見（`P2025`）
- 副作用: 統計キャッシュ無効化

**GET `/api/otokogi/stats`**

- クエリ: `year=YYYY`（後方互換） / `from=YYYY-MM-DD` + `to=YYYY-MM-DD`（優先） / `memberIds=id1,id2`（カンマ区切り）
- レスポンス 200: `{ totalCount, totalAmount, averageAmount, perMember, monthlyTrend, heatmap, deviationScores, streaks, cumulativeRace, records, otokogiByMember, totalOtokogiAmount }`
- サーバー内メモリキャッシュあり（`lib/stats-cache.ts`、書き込み時に無効化）

**GET `/api/otokogi/ranking`**

- クエリ: `year=YYYY`（省略時は全期間）
- レスポンス 200: `{ ranking: Array<{ rank, memberId, name, initial, colorBg, colorText, count, totalPaid }> }`（`totalPaid DESC` ソート）
- キャッシュ: `Cache-Control: private, max-age=60, stale-while-revalidate=300`

**GET `/api/otokogi/member-summary`**

- クエリ: `from=YYYY-MM-DD` / `to=YYYY-MM-DD` / `memberIds=id1,id2`
- レスポンス 200: `{ members: Array<{ memberId, memberName, participationCount, payerCount, payerRate, actualPaid, shouldHavePaid, otokogiAmount, averagePaymentAmount, maxSingleOtokogi, jankenWinRate: null }>, hasJankenData: false }`

### `/api/warikan`

| Method | Path | 説明 |
|---|---|---|
| GET | `/api/warikan` | 割り勘イベント一覧（カーソルページネーション） |
| POST | `/api/warikan` | 割り勘イベント作成 |
| GET | `/api/warikan/:id` | 割り勘イベント詳細 |
| PATCH | `/api/warikan/:id` | 割り勘イベント部分更新（`status` は不可） |
| DELETE | `/api/warikan/:id` | 割り勘イベント削除 |
| GET | `/api/warikan/:id/export` | 精算結果を CSV でダウンロード |
| POST | `/api/warikan/:id/revert-to-entering` | `PAYING → ENTERING` に戻す（Settlement 全削除） |
| GET | `/api/warikan/:id/expenses` | 立替明細一覧 |
| POST | `/api/warikan/:id/expenses` | 立替明細追加（精算自動再計算） |
| PATCH | `/api/warikan/:id/expenses/:expenseId` | 立替明細更新（精算自動再計算） |
| DELETE | `/api/warikan/:id/expenses/:expenseId` | 立替明細削除（精算自動再計算） |
| GET | `/api/warikan/:id/settlements` | 精算結果一覧 |
| POST | `/api/warikan/:id/settlements` | 精算計算 + `ENTERING → PAYING` |
| PATCH | `/api/warikan/:id/settlements/:settlementId` | 送金・受領ステータス更新 |
| POST | `/api/warikan/:id/settlements/bulk-complete` | 全精算完了 + `PAYING → CLOSED` |
| GET | `/api/warikan/member-summary` | メンバー間累積収支サマリー |

**ステータス遷移**

```
ENTERING (明細入力中) → PAYING (支払待ち) → CLOSED (クローズ)
                     ↑ /revert-to-entering ↓ 全 Settlement 受領 or /bulk-complete
```

- `PATCH /api/warikan/:id` はステータス変更を受け付けない（`status` 指定は 400）
- `CLOSED` のイベントは編集不可（400）
- `ENTERING` のみ参加者・明細を変更できる（それ以外は 400）

**GET `/api/warikan`**

- クエリ: `status=ENTERING|PAYING|CLOSED` / `year=YYYY` / `cursor=<eventId>`
- ページサイズ: 20 固定
- レスポンス 200: `{ data: WarikanEvent[], nextCursor: string | null }`（`manager` / `participants.member{id,name}` / `_count.{expenses,settlements}` include）
- キャッシュ: `Cache-Control: private, max-age=300`

**POST `/api/warikan`**

- ボディ:
  ```json
  {
    "eventName": "string (1〜200)",
    "managerId": "member uuid | null | 省略可",
    "detailDeadline": "YYYY-MM-DD | null | 省略可",
    "paymentDeadline": "YYYY-MM-DD | null | 省略可",
    "memo": "string (≤1000) | null | 省略可",
    "walicaUrl": "string (≤255) | null | 省略可",
    "eventId": "event uuid | null | 省略可",
    "participantIds": ["member uuid", ...] // 1〜50, 必須
  }
  ```
- `displayDate` は `eventName` / `paymentDeadline` / `detailDeadline` から `computeDisplayDate()` で自動算出
- レスポンス 201: `WarikanEvent`（`manager` + `participants.member` include）

**GET `/api/warikan/:id`**

- レスポンス 200: `WarikanEvent`（`manager` / `event` / `participants.member` / `_count.{expenses,settlements}` include。明細・精算は個別 API）
- レスポンス 404: 未発見
- キャッシュ: `no-store, must-revalidate`（`dynamic = 'force-dynamic'`）

**PATCH `/api/warikan/:id`**

- ボディ（すべて optional）: `eventName` / `managerId` / `detailDeadline` / `paymentDeadline` / `memo` / `walicaUrl` / `eventId` / `participantIds`
- `status` を指定すると 400（専用エンドポイント経由のみ）
- `participantIds` は `ENTERING` のみ変更可（それ以外は 400）
- `eventName` / `detailDeadline` / `paymentDeadline` が変更されると `displayDate` を再算出
- レスポンス 200: 更新後の `WarikanEvent` / 400: `CLOSED` / 404: 未発見

**DELETE `/api/warikan/:id`**

- レスポンス 200: `{ success: true }` / 404: 未発見（`P2025`）
- カスケードで参加者・明細・精算も削除される

**GET `/api/warikan/:id/export`**

- レスポンス 200: `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="warikan_<eventName>_<YYYY-MM-DD>.csv"`
- CSV セクション: `# イベント情報` / `# 立替明細` / `# 精算フロー`
- レスポンス 404: 未発見

**POST `/api/warikan/:id/revert-to-entering`**

- 前提: `status === 'PAYING'`（それ以外は 400）
- 全 `WarikanSettlement` を削除 + ステータスを `ENTERING` に戻す
- レスポンス 200: 更新後の `WarikanEvent` / 404: 未発見

**GET `/api/warikan/:id/expenses`**

- レスポンス 200: `Array<WarikanExpense & { payer, debtors.member }>`（`createdAt DESC`）
- キャッシュ: `Cache-Control: private, max-age=60`

**POST `/api/warikan/:id/expenses`**

- 前提: `status === 'ENTERING'`（それ以外は 400）
- ボディ:
  ```json
  {
    "payerId": "member uuid",
    "description": "string (1〜200)",
    "amount": 1〜1000000000,
    "debtorIds": ["member uuid", ...] // 省略・空配列は全参加者
  }
  ```
- 副作用: 精算（`WarikanSettlement`）を全削除 → `calculateSettlements()` で再計算 → 一括作成
- レスポンス 201: `WarikanExpense`（`payer` + `debtors.member` include）

**PATCH `/api/warikan/:id/expenses/:expenseId`**

- 前提: `status === 'ENTERING'`（それ以外は 400）
- ボディ（すべて optional）: `payerId` / `description` / `amount` / `debtorIds`（1〜50）
- `debtorIds` の全 ID がイベント参加者に含まれない場合は 400
- 副作用: 精算再計算
- レスポンス 200: 更新後の `WarikanExpense` / 404: イベントまたは明細未発見

**DELETE `/api/warikan/:id/expenses/:expenseId`**

- 前提: `status === 'ENTERING'`（それ以外は 400）
- 副作用: 精算再計算
- レスポンス 200: `{ success: true }` / 404: イベントまたは明細未発見

**GET `/api/warikan/:id/settlements`**

- レスポンス 200: `Array<WarikanSettlement & { fromMember(+paypayId), toMember(+bankAccount) }>`（`amount DESC`）
- キャッシュ: `no-store, must-revalidate`（`dynamic = 'force-dynamic'`）

**POST `/api/warikan/:id/settlements`**

- 前提: `status === 'ENTERING'` かつ 明細 ≥ 1 かつ 参加者 ≥ 2（それ以外は 400）
- 副作用: 既存 Settlement 全削除 → `calculateSettlements()` で再生成 → ステータス `PAYING` に遷移
- レスポンス 200: `WarikanEvent & { summary: { totalAmount, settlementCount } }`

**PATCH `/api/warikan/:id/settlements/:settlementId`**

- 前提: `status === 'PAYING'`（それ以外は 400）
- ボディ: `{ "action": "pay" | "receive" }`
  - `pay`: `isPaid: true, paidAt: now`
  - `receive`: `isReceived: true, receivedAt: now`（未送金の精算に対しては 400）
- 副作用: 全 Settlement が `isReceived` なら自動で `CLOSED` に遷移
- レスポンス 200: `{ settlement, eventClosed: boolean }` / 404: 未発見

**POST `/api/warikan/:id/settlements/bulk-complete`**

- 前提: `status === 'PAYING'` かつ Settlement 件数 ≥ 1（それ以外は 400）
- 全 Settlement を `isPaid + isReceived = true` に一括更新 + `CLOSED` に遷移
- レスポンス 200: `{ event: WarikanEvent, updatedCount: number }`

**GET `/api/warikan/member-summary`**

- クエリ: `year=YYYY`（1970〜9999。省略時は全期間 CLOSED 対象）
- 全 `CLOSED` イベントの `WarikanSettlement` を集計し、メンバー間ペアで純収支（ネット化）を返す
- レスポンス 200: `{ members: Member[], balances: Array<{ fromMemberId, toMemberId, amount }>, eventCount: number, totalAmount: number, availableYears: number[] }`
- レスポンス 400: `year` が不正

### 対象外エンドポイント

以下は本ドキュメントの対象外（Issue #85 スコープ外）:

- `/api/walica/preview`, `/api/walica/import` — Walica インポート機能

---
# MNML 会社方針（自動注入）

## M層 兼任マップ

<!-- gen-map-start -->
| エージェント | 役割 / 担当リポ |
|---|---|
| ba | 経理・法務・調達 / MNML-LLC/mnml-tools |
| chief | 参謀・横断管理専任 / MNML-LLC/issues |
| consulting | ITコンサル業務支援 / MNML-LLC/consulting, MNML-LLC/cdp-dashboard, MNML-LLC/floor2d3d |
| events | イベント告知 / MNML-LLC/events |
| platform | mnml-agents 基盤管理 / MNML-LLC/mnml-agents |
| shift | シフト管理 / MNML-LLC/shift-scheduler-ai, MNML-LLC/shift-scheduler-ai-liff |
| sns | SNS運用 / MNML-LLC/sns_manage, MNML-LLC/postiz-app |
| spotify | プレイリスト整理 / MNML-LLC/spotify-playlist-organizer |
| thebotch | イベント精算 / MNML-LLC/the-botch |
| trading | 予測市場・トレーディング / MNML-LLC/trading |
| web | コーポレートサイト / MNML-LLC/mnml-web |

合計 **11 M層**。
<!-- gen-map-end -->

削除済み（管轄不要）:
- MNML-LLC/claude-agent-guide
- MNML-LLC/gc-workspace
- MNML-LLC/gascity
- MNML-LLC/gas-town
- MNML-LLC/mnml-ba
- MNML-LLC/mnml-ops

横断系（chief 担当）:
- MNML-LLC/issues — 全社課題管理。chief が巡回・トリアージ（Triage大臣概念は chief に統合）

備考: shift M層が shift-scheduler-ai と shift-scheduler-ai-liff の両リポを管轄。
廃止M層: oa / sa / h-a / pmo / vdu-agents / shift_liff。
sa-monitor / sa-registry も 2026-04 に完全廃止（Issue #447）。監査・通知は alert_channel + bot に移行済。

---
# MNML 開発ルール（自動注入）

# mnml-agents

MNML マルチエージェント基盤。Slack をインターフェースに、Claude (Max Plan) でAIエージェントを並行実行する。
月次業務自動化（旧 mnml-ops）も統合済み。

## 仕事の進め方プロセス（全エージェント・厳守）

CEOや上位層からインプットを受けたとき、まず以下の6つのどれに当たるかを分類する。

| 用語 | 定義 | 例 |
|---|---|---|
| **要求** | 定性的な望み。「〜したい」レベル。まだ曖昧 | 「売上を上げたい」 |
| **要件** | 要求を定量化・具体化したもの。測定可能 | 「Q3末までに売上20%増」 |
| **問題** | あるべき姿と現状のギャップ（何が間違っているか） | 「CVRが業界平均の半分」 |
| **課題** | 問題を解決するために取り組むべきテーマ（何に向かうか） | 「顧客体験の改善」 |
| **論点** | 課題を解くための具体的な問い（どこを掘るか） | 「なぜCVRが低いのか？」 |
| **タスク** | 具体的な実行アクション（何をするか） | 「CTAボタンの位置変更」 |

### 進め方の順序（厳守）

```
要求 → 要件（定量化）→ 問題定義 → 課題設定 → 論点洗い出し → タスク実行 → 管理
```

- 要求が来たら**要件に落とすまで着手しない**（定量化・期限・成功定義を確認）
- 問題が定義されるまで**課題を設定しない**
- 課題が設定されるまで**タスクに分解しない**
- 論点なき実行は禁止（「なぜやるか」を言語化できない状態で動かない）
- 上流が未確定な状態で受け取ったら、不足している段階まで遡って確認する

## 用語定義

**用語の解釈ブレを防ぐため、`docs/glossary.md` を参照すること。**
CEO 用法の用語集 SoT。誤解しがちな語 (三線・MSO・Issue・1線/2線/3線・VDU 等) を集約。

## アーキテクチャ

```
Slack (UI: 議論の SoT)
  → bot.py (常駐: Bolt Socket Mode 受信)
  → IF層 (Claude CLI 起動毎: 分類・整形・直接応答)
  → M層 (Division 別の常駐 Claude セッション。CEO と対話して要件確定)
                         ↓ 要件確定
       ┌─ W層 (社内): agents/workers/ サブエージェントを直接 DELEGATE
       └─ ベンダー (Web Claude): GitHub Issue 起票
                ↓ @claude メンション (+ auto-merge ラベル)
            → ベンダー (Web Claude) ← claude-code-action 経由で呼び出し — リモート実行、Mac mini負荷ゼロ
                ↓ branch + commit + push
            → PR 自動作成 → (auto-merge なら) squash merge → Issue auto-close
                ↑ ラベル無しの場合は M層レビュー → CEO 確認 → マージ
                         ↓
  → Slack thread に結果通知
tools/ — 月次業務自動化パイプライン (BA配下のツール群、Slack/M層から起動)
```

### 3層構造の定義
- **M層**: 要件確定 + 軽い指示。Thin M層原則で工数を使わない
- **W層**: M層が委譲する社内作業者 (`agents/workers/` 配下: coder, architect, tester, docs, legal-reviewer, pjm, reviewer, tax, researcher, web_operator 等)。今後も拡張前提
- **ベンダー (Web Claude)**: M層が GitHub Issue を起票して claude-code-action 経由で発注する外部開発リソース

M層は W層 と ベンダー の**両方を委譲先として選べる** (並列の選択肢)。

### ライフサイクル
- bot.py は launchd 常駐 (Mac mini)
- IF層 は CLI subprocess (タスクごと)
- **M層 は常駐 Claude セッション** (`bot/persistent_session.py`、`--resume` で会話継続。1年OAuthトークン経由認証)
- **W層 は M層が直接 DELEGATE するローカル実行** (`agents/workers/` 配下のサブエージェント)
- **ベンダー (Web Claude) は GitHub Issue + claude-code-action 経由でリモート実行** (旧 GASTOWN polecat/refinery は廃止)

### M層レビュー原則
- W層 または ベンダー (Web Claude) の成果物 (PR) は M層がレビュー、または `auto-merge` ラベルで自動マージ
- ラベルなし → M層レビュー → 承認後マージ (CEO確認が必要な変更はM層が判断)
- ラベルあり → CI通過後 squash merge → Issue auto-close
- W層 または ベンダー (Web Claude) の成果物を M層レビューなしで CEO に直接上げてはならない (重要決定)

## 開発プロセス (組織図準拠)

新プロセスの全フローは `docs/project-lifecycle.md` 参照。要点:

### 1. 議論フェーズ (Slack thread)
- CEO が Slack で要望を投げる
- IF層 → M層 へ振り分け (Routing AI)
- M層 が CEO と対話して要件を確定 (Slack thread = 議論の SoT)

### 2. Issue 起票フェーズ (M層の責務)
要件確定後、M層 が GitHub Issue を起票する。Issue body のテンプレ:

```markdown
## 経緯
(Slack thread の議論サマリ — なぜこの要件になったか)

## 要件
(確定した実装内容)

## 受け入れ条件
- [ ] (Done の定義)

## smoke test 結果
(PRマージ前 or マージ直後に、実データで動作確認した結果を記載。数値・件数など具体的に)
- 実施日時:
- 実施内容:
- 結果:

## メタデータ
- 依頼者: (CEO / 自発)
- M層: (chief / platform / trading / ba / consulting / thebotch / shift / web / events / sns / spotify)
- Slack thread: (URL or thread_ts)

@claude
```

`auto-merge` ラベルを付ければ、CI 通過後に自動 squash merge + Issue close。

起票先リポは案件に応じて選択 (mnml-agents / the-botch / mnml-web / mnml-tools 等 計14リポ)。

### 3. 実行フェーズ (ベンダー (Web Claude) が自動)
- claude-code-action 経由で ベンダー (Web Claude) が Issue 本文を読んで実装
- branch 作成 → commit → push (通常 45秒〜数分)
- workflow が `gh pr create` で PR 自動作成
- `auto-merge` ラベルあり → `gh pr merge --squash --delete-branch`
- workflow が `gh issue close` で Issue 自動クローズ

### 4. 完了通知
- Slack thread に PR URL / マージ結果を M層 が返信
- M層 が CEO に「完了しました」と報告

## smoke test / verified ラベル（要件充足検証、全ベンダー (Web Claude) 厳守）

**PR マージ = 完了ではない。要件が実際に実現できているかは実データで動かして初めて検証される。**

- ベンダー (Web Claude) は、実データに対する処理を伴う変更（バッチ処理・API連携・金額計算等）を実装した場合、PR 作成前 or 直後に**実データ相当の入力で1回動作確認**し、結果を Issue の「smoke test 結果」セクションに記載すること
  - 記載内容: 実施日時・実施内容・数値/件数などの具体的な結果
  - 純粋なドキュメント更新・設定変更等、実行確認の対象がない変更は smoke test 対象外（その旨を「smoke test 結果」に明記する）
- smoke test 結果を記載した Issue は M層 が確認し `verified` ラベルを付与する
- smoke test 未実施のまま Issue が close された場合、`issue_patrol.py`（週次巡回）が `merged-unverified` ラベルを自動付与し、CEO に集計報告する
- 詳細は `docs/done-definition.md` の「smoke test / verified ラベル」を参照

## 各リポの claude-code-action 共通設定 (14リポ展開済み)
- `.github/workflows/claude.yml` — `anthropics/claude-code-action@v1` + 自動PR作成 + auto-merge step
- GitHub Secret `CLAUDE_CODE_OAUTH_TOKEN` (1年OAuthトークン。ykfrost / uki の複数アカウントに分散設定。各リポに1アカウントのトークンを設定し、単一アカウントへの依存を回避している。Mac mini 上の3アカウントプールと共用)
  - **AI認証専用**（Anthropic の Claude モデル呼び出し用）。GitHub の push 権限とは無関係
- GitHub Secret `GH_ADMIN_PAT` — **全14リポの repo secret として個別設定。`workflow` スコープ必須**
  - org secret（Free プラン非対応。MNML-LLC は Free プラン + 全リポ private のため利用不可 / Issue #968）の代替
  - `claude-reusable.yml` の `github_token: ${{ secrets.GH_ADMIN_PAT || github.token }}` で push に使用される GitHub PAT
  - 無いと既定の GITHUB_TOKEN にフォールバックし、`.github/workflows/` 配下のファイルを push できない（Issue #997）
  - 設定・再発行手順: `docs/operations/github_admin_pat.md`（実行: `scripts/set_admin_pat_repos.sh`）
- Actions の PR 作成権限 (`default_workflow_permissions=write`, `can_approve_pull_request_reviews=true`)
- `auto-merge` ラベル

並列実行可能。Mac mini のメモリ制約は受けない。

## ディレクトリ構造

- `bot/` — Slack Bot (Bolt + Socket Mode) + Routing AI / Dispatcher 実装
- `agents/if/` — IF層: タスクルーティング・直接応答
- `agents/managers/` — M層: Division別マネージャー (1線VDU + 2線バックオフィス)
  - `chief/` — 参謀・横断管理専任 (Issue巡回・Triage大臣)
  - `platform/` — platform: mnml-agents 基盤担当 (bot/agents/tools の改善・実装)
  - `trading/` — trading: 予測市場・トレーディング (1線VDU)
  - `ba/` — BA: 経理・法務・調達・mnml ブランド (2線)
  - `consulting/` — consulting: ITコンサル業務支援 (1線)
  - `thebotch/` — thebotch: イベント精算アプリ (1線VDU)
  - `shift/` — shift: シフト管理 (1線VDU、LIFF含む)
  - `web/` — web: コーポレートサイト (1線)
  - `events/` — events: イベント告知 (1線)
  - `sns/` — sns: SNS 投稿運用 (1線)
  - `spotify/` — spotify: Spotify プレイリスト整理・API 連携 (1線)
- `agents/workers/` — W層: スキルプール (research/dev/doc/design 等。GitHub Issue 経由で起動)
- `agents/ai-ops/` — AI運用補助 (sa-monitor デーモン、sa-registry レジストリ)
- `tools/` — 月次業務自動化 (経費・請求書・報告書・メール・予定調整)
- `scripts/` — 起動・停止・管理スクリプト

## tools/ 構成

- `tools/accounting/` — MFクラウド経費の自動仕訳・登録
- `tools/invoice/` — MFクラウド請求書の確定・PDF取得
- `tools/work_report/` — Outlook カレンダー → 月次作業報告書(Excel)
- `tools/mail_filing/` — メール添付ファイル自動取得・振り分け
- `tools/scheduler/` — Outlook カレンダー連携の予定調整
- `tools/shared/` — OAuth基盤・Slack通知・MS Graph共通

## 技術スタック

- Python 3.12
- slack-bolt (Socket Mode)
- claude CLI (subprocess) — Max Plan内、API課金なし
- httpx / pydantic-settings / rich
- ops固有: anthropic, playwright, openpyxl, jpholiday
- GitHub Actions: claude-code-action@v1 (OAuth 1年トークン経由)

## 実行方法

```bash
# Bot
scripts/start.sh

# ops パイプライン（リポジトリルートから実行）
python -m accounting.pipeline run
python -m invoice.pipeline status
python -m mail_filing.pipeline run
python -m work_report.pipeline run
python -m scheduler.pipeline free-slots
```

## Git ワークフロー（全エージェント共通）

### コミットルール
- コミットメッセージは英語
- ブランチ内のコミットは確認不要
- コミット前に `git diff --staged` で差分を確認する
- `.env`、`.tokens*.json`、credentials 等の機密ファイルをコミットしない
- 意味のある単位でコミットする（1機能1コミットが目安）
- **closing keyword（`fix` / `fixes` / `fixed` / `close` / `closes` / `closed` / `resolve` / `resolves` / `resolved` + `#番号`）は、その PR が実際に解決する対象 Issue のみに使う**
  - 経緯・文脈として他の Issue を参照する場合は closing keyword を使わず、`ref #番号` / `関連: #番号` / `see #番号` のような中立形式で書く
  - 理由: default branch へマージされたコミットメッセージや PR 本文中の closing keyword は GitHub が自動的に対象 Issue のクローズ指示として解釈するため、未解決の別 Issue まで誤クローズしてしまう（実例: PR #1109 のコミットメッセージ内「fix #1096」参照で、未解決の #1096 が誤ってクローズされた）
  - コミットメッセージだけでなく PR 本文・PR タイトルにも同じルールが適用される（PR マージ時に本文の closing keyword も評価される）

### プッシュルール
- push 前に `git pull --rebase` で最新を取得する
- force push は原則禁止（CEO の明示的承認が必要）
- main へのマージ（PR）は CEO 確認必須 — ただし `auto-merge` ラベル付きは例外
- main ブランチへの直接 push は CEO 承認必須

### 承認フロー
```
[通常]   Issue → claude-code-action → PR → M層レビュー → CEO確認 → マージ
[自動]   Issue (auto-merge ラベル) → claude-code-action → PR → CI通過 → squash merge → Issue close
```

### チェック機構
- `ruff format .` を実行してフォーマットを修正し、その後 `ruff format --check .` でエラーゼロを確認する（コミット前必須）
- `python3 -m py_compile` で構文チェック（コミット前）
- **`python -m pytest tests/` を直接走らせないこと**（fork bomb 再発防止 / Issue #459）
- pytest は Slack bot 経由 (`bot.quality_gate.run_quality_gate`) または CI でのみ実行する

## 報告ルール（全エージェント共通）

- **実行結果の捏造禁止**: コマンドやAPIの実行結果は、必ずツール（Bash等）を実際に呼び出して取得すること
- **未検証で完了報告しない**: 実行してみないと成否がわからない処理は、実際に動かして結果を確認してから報告する
- **ファイル存在の実証**: ファイルを保存したと報告する場合、保存先のパスとファイルサイズを `ls -la` 等で確認した結果を含めること

## 成果物の重複防止（全エージェント共通）

作業開始前に、以下を必ず確認すること。同じ成果物を二重に作らない。

1. **既存成果物の確認**: output/ 内の既存ファイル一覧を確認する
2. **同一Issueの確認**: 同じ Issue に紐づく成果物が既にないか確認する
3. **更新優先**: 既存の成果物がある場合は新規作成ではなく更新する
4. **ファイル名規則**: `DESIGN_{テーマ}_{Issue番号}.html` とする。Issue番号なしのファイルを作らない
5. **既存コードの確認**: 新しいモジュール・関数を作る前に、同じ機能が既に実装されていないか確認する
6. **調査の重複回避**: 調査を開始する前に、同じテーマの過去の調査結果（Slackスレッド・Issue・knowledge/）がないか確認する

## 運用ルール（全エージェント共通）

- CEO に見せるファイルはローカル保存ではなくOneDriveに配置する。URLを共有すること
- 設計・報告は平易な言葉で説明する。技術用語を避け、CEOにわかる言葉を使う
- 手順案内時はMac mini / MacBook のどちらで実行するかを必ず明記する
- 実装が動作するか実際にテスト/検証してから完了報告すること。未検証のまま完了と言わない
- 判断を仰ぐ際は選択肢だけ並べず、各案のメリット・デメリットを整理し推奨案を明示する

## HTMLファイルのデプロイルール

HTMLファイルを生成・出力した場合は、必ずCloudflare Pages（mnml-docs.pages.dev）にデプロイし、公開URLを共有すること。
デプロイには `cf_deploy` ACTIONタグを使用する。

```
<<ACTION>>
{"type": "cf_deploy", "path": "相対パス/output.html", "issue": 123}
<</ACTION>>
```

- `path`: リポジトリルートからの相対パス
- `issue`: 紐づくIssue番号（任意。省略時は `general/` に配置）
- デプロイ後、公開URL（`https://mnml-docs.pages.dev/issue-{number}/filename.html`）がSlackスレッドに投稿される
- ngrokは使わない

### URL設計
- パス形式: `issue-{番号}/{ファイル名}.html`（例: `issue-119/design.html`）
- Issue番号なし: `general/{ファイル名}.html`
- Issue番号が異なれば別パスになり、混ざらない
- 同一Issue・同名ファイルの再デプロイは**上書き**される
- 版を残したい場合はファイル名を変える（例: `design_v2.html`）

## 会議運営ループ（Issue #868）

CEO から会議の登録・変更・一覧・停止を指示されたら、以下の ACTION タグで操作する（設定ファイルの直編集はしない）。
登録された会議は、設定タイミング（開催の lead_hours 時間前）に対象チャンネルへアジェンダスレッドが自動発行され、
持ち越しTODO・記入依頼・課題管理表リンクが含まれる。TODO はスレッド内の各TODOメッセージに ✅ リアクションで完了できる。

```
<<ACTION>>
{"type": "meeting_upsert", "meeting_id": "cfcl", "name": "CFCL定例", "channel": "#cfcl-teirei", "weekdays": [2], "time": "10:00", "lead_hours": 24, "tracker_url": "https://..."}
<</ACTION>>
```

- `meeting_id`: 英小文字/数字/-/_ 32文字以内。既存IDなら指定項目のみ更新（部分更新可）
- `weekdays`: 0=月 〜 6=日 の整数リスト（毎週繰り返し）
- `time`: 開催時刻 "HH:MM"、`lead_hours`: アジェンダ発行タイミング（開催の何時間前か、既定24）
- `tracker_url`: 会議ごとの課題管理表リンク（任意）
- 停止: `{"type": "meeting_stop", "meeting_id": "cfcl"}` / 再開: meeting_upsert で `"enabled": true`
- 一覧: `{"type": "meeting_list"}`
- 議事録取り込み: `{"type": "meeting_minutes", "meeting_id": "cfcl", "minutes": "# 議事録..."}` —
  最新アジェンダスレッドに本文を投稿し、決定事項・ネクストアクションを抽出してTODO登録する。
  議事録パイプライン（#859）の出力を会議に紐付けるときに使う
- 参加者がアジェンダスレッドに `# 議事録` で始まるテキストを直接貼った場合は bot が自動で取り込む（ACTION不要）
- 議事録形式は #859 の一律形式（`## 決定事項` / `## ネクストアクション`）。ネクストアクションは「担当: 内容」形式だと担当者が分離される

## フロー図・ダイアグラム作成ルール

HTMLでスイムレーン図やフロー図を作成・編集する際、以下を必ず守ること。

### 矢印の接続
- **矢印は必ずノードの枠（辺）から出す**。ノードの中心から出てはならない
- 始点・終点は、矢印の方向に応じた辺の中点に置く（右へ向かう矢印なら右辺から出す）

### 線の重複・交差禁止
- **矢印が他のノード（接続先でないノード）を横切ってはならない**
- 同じ行の別列にノードがある場合、水平矢印がそのノードの上を通過しないようルーティングする
- 複数の矢印が同じ経路を共有してはならない（一筆書きで辿れること）

### 分岐（OK/NG）の描画
- 判断ノード（ダイヤモンド）からの分岐は、OK/NGで異なる辺から出す
- **NG行を先（判断ノードの直下）に配置し、OK行をその下に配置する**
- NG矢印: 判断ノードの下辺から出る → 直下のNG行へ（短距離）
- OK矢印: 判断ノードの左辺から出る → NG行を迂回してOK行へ（左側を大回り）

### 戻り矢印（NG戻り・ループ）のルーティング
- **グリッドの外側を大回りさせる**。途中のノードを横切らない
- 右バイパス（NG戻り）: ノード右辺 → グリッド右端外側 → ターゲット上方 → ターゲット上辺に入る（4セグメント: →↑←↓）
- 左バイパス（OK分岐）: ノード左辺 → グリッド左端外側 → ターゲット左辺に入る
- 距離が長いほど外側のマージンを大きく取る（複数の戻り線が自然に分離される）

### 同一ノードの質問/応答フロー
- 同じノードを質問フローと応答フローが共有する場合、質問は上（水平）、応答は下（弧を描く）を通す
- または、応答用の専用ノード行を追加して完全に分離する

## 図表（表・グラフ）作成ルール

レポート・スライド・HTML成果物・議事録などで **表** や **グラフ** を作成する際は、以下の最重要ルールを必ず守ること。全77ルール（共通20 / 表20 / グラフ37）の全文と根拠は `docs/figure-table-rules.md` を参照する。出典: 荒瀬康司「科学論文での図表作成のルール」人間ドック 38: 659-676, 2024。

### 共通（表・グラフ両方）
- 通常の結果表示は **表を優先**（情報量が多い）。比較・割合・推移・関係性の強調はグラフを使う
- 引用した図表は **出典を明示**する（著者名・タイトル・出版年）
- **白背景に黒が原則**。色文字は特別な目的がなければ使わない
- **表のタイトルは表の上、図のタイトルは図の下**。タイトルにピリオドは付けない
- 図表には番号を振り、本文からは **番号で参照**する（「次の図」「上表」等の位置参照は禁止）
- タイトルは **固有名詞を入れて具体化**する（「臨床背景」→「高血圧と診断された対象症例100例の臨床背景」）
- 同種の図表は **形式（罫線・フォント・見出し・表記）を統一**する
- 図表中のデータを間違えない。変更時は本文・抄録・図表すべてを漏れなく修正。**数字が図表と本文で異なるのは禁忌**

### 表
- **最左列を軸（キー）**とし、右側の列を決める
- 対象の特徴は **% 表示（または実数+%併記）**が読みやすい
- **図表内のフォントは統一**する
- **列見出しは中央揃え**。**セル内は文字は左詰め、数字は右詰め**
- **小数点以下の桁数を統一**し、小数点の位置を縦に揃える（9→9.00 のように 0 を付加）
- 行・列見出しの項目は **合理的基準で並べる**（アルファベット順・大きい順・重要順・時間順・種類別）
- **表に空欄を作らない**。埋められない場合は理由を書く（「未決定 注: ○月○日決定予定」「該当せず」「TBD」）
- **罫線は少なくする。縦線は入れない**。横線は最上段・見出し下・最下段の3本が原則
- **単位のある数字には単位を必ず表記**する
- **数字は半角英数**で表記（全角数字禁止）
- **桁数の大きい数字は3桁ごとにカンマ**（ただし西暦にはカンマを付けない: `2024年`）
- **桁が大きい場合は「万」「億」を使う**（`50,000,000` ではなく `5,000万`）

### 図（グラフ）
- **グラフの型は目的で選ぶ**: 棒 = 量の比較／円 = 構成割合／折れ線 = 時間変化
- **折れ線は4本以下**が見やすい
- **縦・横軸のラベルと単位を必ず記載**。ラベルは斜め書きにしない
- **棒グラフは基線の0を省かない**。波線による途中省略もしない（差が誇張され誤解を招く）
- **3次元棒グラフは使わない**（値の読み取りが不明瞭）
- **項目名が長い場合は横棒グラフ**を使う
- **円グラフのセグメントは10個以内**
- **円グラフは12時の線の右側から時計回りに構成比の高い順**。「その他」は最後
- **円グラフに3次元効果を使わない**（比率が歪む）
- **無意味な色付けをしない**。色数を絞り、白黒コピーでも判別できる配色にする
- **強調したい箇所は濃い色 + 大きめの文字**で（円グラフの強調は最大セグメントでなくてもよい）
- **予測値・推定値の柱は色を薄くする、または稜線を破線**にして実績と区別する

### 詳細ルール
- 全77ルール（背景・例外含む）は `docs/figure-table-rules.md` を参照
- スイムレーン図・フロー図の描画ルール（矢印ルーティング等）は上記「フロー図・ダイアグラム作成ルール」に別途規定

## コーディング規約

- 型ヒント必須（`from __future__ import annotations`）
- 日本語コメント、英語コミットメッセージ
- ruff でフォーマット

## 情報保存先ルール（全エージェント・厳守）

「何をどこに保存するか」の確定マップ（2026-07-24 CEO決定）。全エージェントは情報を保存するたびにこの表に従うこと。

| 情報の種類 | 保存先 | 補足 |
|---|---|---|
| 議事録 | Slack Canvas | 人が読む前提。チャンネルに固定・後から編集可（2026-07-24 CEO決定） |
| 議論・相談・報告 | Slack スレッド | 要件確定前のやり取り。決まる前の情報はここ（議論の SoT） |
| タスク・要件・発注 | GitHub Issue (MNML-LLC/各リポ) | 作業の SoT（要件確定後） |
| コード | GitHub リポジトリ (MNML-LLC org, 全 Private) | 実装の SoT |
| 運用ドキュメント（社内向け） | GitHub docs/ | 手順書・用語集・運用ルール |
| 公式ビジネス文書 | SharePoint / OneDrive | 契約書・請求書・領収書・納品物・財務計画 |
| ダウンロードした一時ファイル | MacBook `~/Downloads/` | 一時置き場。残すものはSharePointへ移す |

### 原則

- 1種類の情報は必ず1箇所（重複配置・混在の禁止）
- 迷ったら「誰が読むか」で決める: 人 → Canvas/SharePoint、AI → GitHub
- 正式文書を Slack にだけ置かない（流れて消えるため）
- マップにない種類の情報が出たら chief に確認し、ルールを追記してから保存する
- **設計のSoTはソースコード**。「どういう設計か」を確認・回答するときは、設計書ではなくソースコード（GitHub リポジトリ）を読んで答える
- DESIGN系HTML等の設計ドキュメントは**検討・レビュー時の一時資料**であり、恒久的な参照先（SoT）にしない。実装マージ後は陳腐化する前提で扱う

### 補足

- 作業詳細メモは Mac mini ローカル `logs/m-sessions/<route>.jsonl`（M層 short-term memory。消えても再現可能）
- ファイルを探す際: ソースコード → GitHub リポジトリ / 議論履歴 → Slack thread (search) または対応する GitHub Issue / ビジネス文書 → SharePoint / OneDrive

## 環境

- `.env` はプロジェクトルートに1つ（bot + ops 共有）
- トークンファイル（`.tokens*.json`）は `tools/` 内の各パッケージディレクトリ
- import パスはパッケージ名から始める（例: `from accounting.app.config import settings`）
- `tools/` は `pyproject.toml` の `where` でパッケージ検索パスに含まれている

## インフラ共通情報

**全エージェントが前提として知っておくべき環境情報。**

### マシン構成

| マシン | 役割 | 常時稼働 |
|---|---|---|
| Mac mini | bot.py 常駐 / M層常駐 / tools/ 実行基盤 | ✓ |
| MacBook | CEO 作業端末 / ローカルファイル保管 | 起動時のみ |
| GitHub Actions ランナー | ベンダー実行 (claude-code-action 経由) | リモート、並列無制限 |

### MacBook へのアクセス

- SSH接続: `ssh macbook`（`~/.ssh/config` に設定済み。追加設定不要）
- ファイル取得: `scp macbook:~/path/to/file /tmp/` で Mac mini にコピー可能
- ファイル確認: `ssh macbook ls ~/Downloads/` などでディレクトリ内容を確認可能
- **MacBook上のファイルを参照するタスクでは、まず `ssh macbook` / `scp` を試みること。「アクセスできない」と諦めないこと**

### よく参照する場所（MacBook）

- `~/Downloads/` — Outlookで開いた添付ファイル等のダウンロード先
- `~/Documents/` — 一般ドキュメント

### OneDrive / Outlook

- ビジネス文書（契約書・請求書・領収書等）は OneDrive に保管
- Outlook の添付ファイルはダウンロードすると MacBook の `~/Downloads/` に保存される
- OneDrive 検索が失敗した場合は `scp macbook:~/Downloads/` でローカルを確認すること

## 関連ドキュメント

- `docs/architecture.md` — 組織図・新プロセス全体
- `docs/glossary.md` — 用語集 (VDU/三線/MSO 等)
- `docs/project-lifecycle.md` — Issue起票 → PR → マージのライフサイクル
- `docs/done-definition.md` — 「完了」の定義
- `docs/operations/refresh_oauth_tokens.md` — OAuth トークン運用ガイド（3アカウントプール・macOS Keychain 干渉対策）
