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

