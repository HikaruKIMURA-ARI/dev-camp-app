# Project Structure

## Organization Philosophy

**フラットなレイヤー分割**。アプリ規模が小さいので、`src/` 直下にレイヤー単位（アプリ組み立て / ルート / ビュー / DB / スキーマ / テスト）でファイルを並べるだけに留めている。サブディレクトリで階層を切るのは、ファイル数が増えて 1 ファイル 1 責務では収まらなくなった時点でから。

機能（feature）単位でディレクトリを切らない。ルーティングは `src/routes.tsx` 1 箇所に集約されており、ルート → ビュー → DB の依存方向が一方向で見通せる規模を維持する。`src/index.tsx` は「サブアプリのマウント / 静的アセット配信 / テーマ Cookie」だけを担う薄いシェル。

## Directory Patterns

### Application Source

**Location**: `/src/`
**Purpose**: 実行されるアプリケーションコード。レイヤー単位のファイルが並ぶ。

- `index.tsx` — アプリの組み立て（`app.route("/", routes)`）、静的アセットの `serveStatic`、`POST /theme`（Cookie 更新 + `HX-Refresh`）。`{ port, fetch }` を default export し、Bun が消費する
- `routes.tsx` — Hono サブアプリ（`new Hono()`）。`/`, `/events/new`, `POST /events`, `/events/:id`, `POST /events/:id/responses`, `GET /events/:id/responses/:responseId/edit`, `PUT /events/:id/responses/:responseId` 等、ドメインルートはすべてここに集約する
- `views.tsx` — JSX コンポーネント（`Layout` / `EventNewForm` / `EventPage` / `ResponsesTable` / `ResponseFormRow` / `NotFoundPage` 等）。HTML を返すための表現層
- `db.ts` — Drizzle クライアントの生成、起動時マイグレーション、データアクセス関数（`createEvent` / `getEventWithOptions` / `addResponse` / `getResponseById` / `updateResponse`）と関連型（`Answer` / `AggregateCounts` / `EventWithOptions` / `ResponseInput`）
- `schema.ts` — Drizzle のテーブル定義（`events` / `eventOptions` / `eventResponses` / `eventOptionResponses` / `slackWebhooks`）と型エクスポート。`Event = typeof events.$inferSelect` のように **スキーマから型を導出**する
- `routes.test.ts` — `bun:test` の単体・統合テスト。レイヤー単位の `*.test.ts` を同階層に置く（`routes.test.ts` ↔ `routes.tsx`）。`bunfig.toml` の `[test] root = "src"` により `bun test` の対象はこのディレクトリだけ

### Migrations

**Location**: `/drizzle/`
**Purpose**: `bun run db:gen` が出力する SQL マイグレーション。サーバー起動時に `src/db.ts` から自動適用される。
**Rule**: 生成された SQL は手で書き換えない。スキーマを変えたい場合は `src/schema.ts` を編集して再生成する。

### Static Assets

**Location**: `/public/`
**Purpose**: プロジェクト固有の静的アセット（現状は `app.css` のみで、pico の上から最小限の上書きを行う）。
**Note**: pico.css と htmx / Alpine.js は `node_modules` から `serveStatic` で配信する。`/public/` にコピーしない。

### E2E Tests

**Location**: `/tests/e2e/`
**Purpose**: Playwright E2E。`bun test` ではなく `bun run test:e2e` で実行する。
**Layout**:

- `tests/e2e/**/*.spec.ts` — テスト本体
- `tests/e2e/fixtures/` — ヘルパ群。`db.ts` の `truncateAll()` を `test.beforeEach` で呼ぶ
  **DB**: 専用ファイル `test-e2e.db`（playwright が `webServer` 起動時に環境変数で指定）。`bun test` の in-memory DB とは別系統

### Project Knowledge

**Location**: `/.kiro/steering/`、`/.kiro/specs/`
**Purpose**: 永続的なプロジェクト知識（steering）と仕様（specs）。`/.kiro/settings/` 配下のテンプレート・ルールはエージェント運用のメタデータであり、steering の対象ではない。

## Naming Conventions

- **ファイル**: `kebab-case` ではなく **小文字単一語 / 必要に応じてドット区切り**（`db.ts`、`routes.test.ts`）。React 規約の `PascalCase.tsx` は使わない
- **コンポーネント**: `PascalCase`（`EventNewForm`、`EventPage`、`ResponsesTable`、`ResponseFormRow`、`Layout`、`NotFoundPage`）。`FC<Props>` で型付ける
- **関数**: `camelCase`、動詞始まり（`createEvent`、`getEventWithOptions`、`addResponse`、`updateResponse`、`parseAnswersFromBody`）
- **テーブル / カラム**: DB は `snake_case`（`event_options`、`created_at`）、TS 側は Drizzle が `camelCase`（`eventOptions`、`createdAt`）に変換する
- **テストの `describe` / `it` 名**: 日本語可。「振る舞い」を主語にする（例: `"GET /events/:id は集計結果を含むフルページを返す"`）

## Import Organization

```typescript
// 1. 外部ライブラリ
import { Hono } from "hono";
import { z } from "zod";

// 2. ローカルモジュール（相対パス）
import { addResponse, getEventWithOptions } from "./db";
import { EventPage, Layout } from "./views";
```

**Path Aliases**: 設定していない（`@/` 等は使わない）。`src/` 直下のフラット構成では相対パス（`./db`）で十分。

**JSX Import Source**: `tsconfig.json` の `jsxImportSource: "hono/jsx"` により JSX は自動で hono/jsx を使う。`react` から何かを import しない。

## Code Organization Principles

### 依存方向

```
index.tsx ──▶ routes.tsx ──▶ views.tsx
                  │              │
                  ▼              ▼
                db.ts ──────▶ schema.ts
```

- `index.tsx` はアプリ組み立てと静的配信に専念し、ドメインロジックを直接書かない（`POST /theme` のような薄い横断ハンドラだけは例外）
- `routes.tsx` は views と db を使ってよい。ハンドラごとに 1 つのユースケースだけを表現する
- views (`views.tsx`) は **schema の型のみ** を import する。db や Hono の `Context` を import しない（プレゼンテーションを純粋に保つ）
- db (`db.ts`) は schema のみに依存する。views や Hono を知らない

逆向きの依存（views → db、schema → views など）を作らない。

### フルページ vs フラグメント vs HX-Refresh

新しいエンドポイントを追加する際の判断軸：

- **初回 GET / 通常遷移 / `POST /events` の成功時**: `<Layout>` で包んだフルページ（HTML ドキュメント全体）を返すか、`c.redirect(..., 302)` する
- **htmx 経由のミューテーション / 部分更新**: ハンドラの `hx-target` に対応するフラグメント（`<ResponsesTable/>`、`<ResponseFormRow/>` 等）だけを返す。`<Layout>` を含めない。差し替え先のラッパ ID（例: `<div id="responses">`）を fragment 側にも付け、htmx 側の `hx-target` と一致させる
- **バリデーションエラー**: 422 ステータスでフラグメント（または `<Layout>` 付きフルページ）を返し、入力値を保持して再描画する
- **ページ全体の再描画が必要な横断操作（テーマ切替等）**: ボディは空のまま `HX-Refresh: true` ヘッダだけ返し、htmx に reload を任せる

### ハンドラの薄さ

- ハンドラは「入力を `parseBody({ all: true })` で取り出す → zod で `safeParse` → db.ts の関数を呼ぶ → ビューを返す」の流れに保つ
- 配列フィールドの正規化（`normalizeOptions` / `parseAnswersFromBody`）や差し戻しレスポンスの組み立て（`renderResponseValidationError` / `renderResponsesTableFragment`）は `routes.tsx` 内のローカルヘルパに切り出す。ハンドラ本体に直接書かない
- `views.tsx` のコンポーネントは props だけで描画し、`Context` や DB を直接触らない

### 共有依存（DB）の扱い

- `src/db.ts` でクライアントを **1 つだけ** 生成して export する。テストも同じ db インスタンスを import して使う
- 単体テストの DB URL は `.env.test`（`file::memory:?cache=shared`）で渡す。テストコード内で `process.env` を書き換えない
- E2E の DB は `playwright.config.ts` の `webServer.env` で `TURSO_DATABASE_URL=file:test-e2e.db` を渡す（専用ファイル）
- DB 状態は `beforeEach` の `db.delete(...)` でクリーンアップして順次実行で隔離する。モックしない。E2E では `tests/e2e/fixtures/db.ts` の `truncateAll()` を使う

---

_Document patterns, not file trees. New files following patterns shouldn't require updates_
