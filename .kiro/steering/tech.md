# Technology Stack

## Architecture

サーバーレンダリング + htmx 駆動のクラシックな Web アプリ。Hono のハンドラーが JSX を文字列 HTML に変換して返し、クライアントは htmx でフラグメントを差し替える。フォーム内の局所的な動的 UI（候補行の追加・削除など）にだけ Alpine.js を限定的に使う。SPA でもなく、API + フロントの二段構えでもない、**単一プロセスのモノリス**。

- **初回 GET / 通常遷移**: `<Layout>` でラップしたフルページ HTML を返す
- **htmx 経由のミューテーション**: フラグメント（例: `#responses` 配下の `<ResponsesTable/>`、`<ResponseFormRow/>`）だけを返し、`hx-target` で指定された DOM ノードに差し替える
- **`POST /events`（イベント作成）だけは例外**: 通常フォーム送信で、成功時は `/events/:id` へ 302、失敗時はフルページを 422 で返す
- **テーマ切替**: `POST /theme` は本体を返さず `HX-Refresh: true` ヘッダだけ返し、htmx 側にページ全体の再描画を任せる
- **マイグレーションは起動時に自動適用**: `src/db.ts` のトップレベルで `await migrate(...)` を呼んでいる（`SKIP_DB_MIGRATE=1` でスキップ可。Workers 環境ではスキップする）

「フルページ vs フラグメント vs HX-Refresh」の使い分けが本プロジェクトの中核的な設計判断であり、新エンドポイントを追加する際は必ずどれを返すか決める。

### デプロイターゲットの二本立て（Bun / Cloudflare Workers）

アプリ本体は `src/app.ts`（`new Hono()` の組み立て・`/theme`・Gemini 起動時疎通チェック）に集約し、エントリポイントを分離している：

- **`src/index.tsx`（Bun）**: `app.ts` を import し、`serveStatic` で `public/static/` 配下のアセットを配信。`{ port, fetch }` を default export
- **`src/worker.ts`（Cloudflare Workers）**: `app.ts` をそのまま default export するだけ。静的アセットは `wrangler.toml` の `[assets] directory = "./public"` が Worker より先に自動配信する

ランタイム固有のコード（`hono/bun` の `serveStatic`、port 設定など）はエントリポイントにのみ書き、`app.ts` 以下には持ち込まない。

## Core Technologies

- **Language**: TypeScript（`strict: true`）
- **Runtime**: Bun（Node ではない。`bun run --hot` がホットリロード）
- **Web Framework**: Hono。`src/index.tsx` がアプリを組み立て、`src/routes.tsx` がサブアプリ（`new Hono()`）として全ルートを定義する。`index.tsx` から `{ port, fetch }` を default export し、Bun 標準の HTTP サーバーが消費する
- **View**: Hono JSX（`jsxImportSource: "hono/jsx"`、React ではない）
- **Client Interactivity**:
  - **htmx 2.x** — サーバーフラグメント差し替え（`hx-get` / `hx-post` / `hx-put` / `hx-target` / `hx-swap` / `HX-Retarget` / `HX-Refresh`）
  - **Alpine.js 3.x** — フォーム内の局所的なリアクティブ UI（`x-data` / `x-for` / `x-bind` / `x-on`）。アプリ全体の状態管理には使わない
- **Database**: libsql / SQLite（ローカルは `file:local.db`、テストは `file::memory:?cache=shared`、本番は Turso）
- **ORM / Migration**: drizzle-orm + drizzle-kit（dialect は `"turso"`）
- **CSS**: pico.css v2 + `public/app.css` で必要最小限の上書き。ビルドステップなし（`prepare:assets` が `node_modules` から `public/static/` へコピー）
- **Validation**: zod + `c.req.parseBody({ all: true })` の組合せ（配列フィールドのため `zValidator` ではなく自前で正規化してから `safeParse`）
- **AI**: `@google/genai`（Gemini）。参加者カード生成専用。`src/gemini.ts` が `CardGenerator` インターフェイスと `defaultCardGenerator` を export し、エラーを `QuotaExhaustedError` / `TransientError` に分類する
- **Deployment**: Cloudflare Workers（wrangler、`compatibility_flags = ["nodejs_compat"]`）。ローカルは Bun でそのまま動く

## Key Libraries

実装パターンに直接影響するもののみ列挙する：

- `hono/jsx` — JSX のインポート元。`react` から取り込まない。コンポーネントは `FC` from `hono/jsx`
- `hono/cookie` — `getCookie` / `setCookie`。テーマ保持・読み出しはこれだけで済ませる
- `hono/bun` の `serveStatic` — `public/static/` 配下のアセット（htmx / Alpine / pico / app.css）を配信。Bun エントリ（`index.tsx`）専用で、Workers では `[assets]` が代替する
- `drizzle-orm/libsql` の `drizzle()` / `migrate()` — DB クライアントは `src/db.ts` で 1 つだけ生成し、そこから export する
- `zod` — フォーム入力のスキーマ検証。配列フィールド（候補日時など）は `c.req.parseBody({ all: true })` で取り出してから zod に渡す

## Development Standards

### Type Safety

- TypeScript `strict: true`。`any` を新規に増やさない
- スキーマ由来の型は `typeof events.$inferSelect` 等を使い、ハンドコードしない
- 列挙値（○/△/×）は schema で `text("answer", { enum: [...] })`、TS では `type Answer = "○" | "△" | "×"` の二段で表現する

### Code Quality

- **Linter**: `oxlint`（ESLint **ではない**）。`bun run lint` は `oxlint --fix` を実行する
- **Formatter**: `oxfmt`（Prettier **ではない**）。`bun run fmt`
- **Type Check**: `bun run typecheck`（`tsc --noEmit`）

### Testing — Unit / Integration

- **Runner**: `bun test`（`bun:test` から `describe / test / it / expect / beforeAll / beforeEach` を import）
- **対象範囲**: `bunfig.toml` の `[test] root = "src"` により `bun test` は `src/` 配下のみを対象とする。`tests/e2e/` は Playwright 専用で、`bun test` には拾われない
- **Test DB**: `.env.test` で `TURSO_DATABASE_URL=file::memory:?cache=shared` を設定し、Bun が `bun test` 時に自動ロードする。テストコード内で `process.env` を書き換えたり、`db` を動的 import したりする必要はない（旧運用からの変更点）
- **Gemini はテストで実通信しない**: `.env.test` にダミーの `GEMINI_API_KEY` 等を置き、プロセス外依存として `CardGenerator` インターフェイス経由で差し替える（test-philosophy の「プロセス外依存のみモック可」に該当する唯一の例）
- **アプリの組み立て方**: `routes` を直接テストする場合は `beforeAll` で `import("./routes")` してから `new Hono()` にマウントした `localApp` を作る。`index.tsx` でマウントされた状態を検証したい時は `app from "./index"` を直接使う
- **Test Isolation**: `beforeEach` で `db.delete(schema.xxx)` を子テーブル → 親テーブルの順に呼び、ケース間の状態を切る。モックしない
- **Philosophy**: `.claude/rules/testing/test-philosophy.md` の古典派 TDD に従う。詳細はそちらを正本とする。要点のみ：
  - 「単体」= 1 つの振る舞い（クラスや関数ではない）
  - 共有依存（DB）は実体を使い、`beforeEach` でクリーンアップして順次実行で隔離
  - プライベート依存はモックしない、プロセス外依存だけ限定的にモック
  - AAA を視覚的に分け、Arrange は `it` の外（`beforeEach`）に置く
- **Test List vs Test Code**: ケース列挙とテストコードを分ける（`it.todo()` で列挙 → 後でコード化）

### Testing — E2E

- **Runner**: `@playwright/test`（`bun run test:e2e`）。`bun test` とは別コマンド
- **Config**: `playwright.config.ts`。`webServer` が port **8686** で `bun run src/index.tsx` を自動起動し、`TURSO_DATABASE_URL=file:test-e2e.db` を環境変数で渡す
- **Mode**: headless 固定（`use.headless: true`）。CI / ローカルで同じ挙動。デバッグ時のみ `bun run test:e2e:ui` か `--headed`
- **Workers**: `workers: 1` / `fullyParallel: false`（DB 共有のため順次実行）
- **CI**: `forbidOnly: !!process.env.CI`、`retries: 2`（CI のみ）。初回は `bunx playwright install --with-deps chromium` が必要
- **配置**: `tests/e2e/**/*.spec.ts`、ヘルパは `tests/e2e/fixtures/`。`fixtures/db.ts` の `truncateAll()` を `test.beforeEach` で呼ぶ
- **位置付け**: 機能完成後の後追い。テストピラミッドで最少（ハッピー 2-3 + 異常 1-2）。仕様の正しさは TDD 側で担保し、E2E は「実装挙動のスナップショット」

## Development Environment

### Required Tools

- Bun（最新版。`@types/bun` の latest を参照）
- TypeScript 5.6+
- `.env` に `TURSO_DATABASE_URL`（省略時は `file:local.db`）、任意で `TURSO_AUTH_TOKEN`
- カード生成を使う場合は `GEMINI_API_KEY`。任意で `GEMINI_MODEL` / `GEMINI_TIMEOUT_MS` / `GEMINI_TEMPERATURE` / `GEMINI_MAX_OUTPUT_TOKENS`、起動時疎通チェックは `GEMINI_VERIFY_ON_BOOT=1`
- 既定ポートは **8686**（`PORT` で上書き可）

### Common Commands

```bash
# Dev
bun run dev              # prepare:assets 実行後、--hot 付きで src/index.tsx を起動
bun run dev:worker       # wrangler dev（Workers ランタイムでローカル実行）
bun run deploy           # wrangler deploy（Cloudflare Workers へデプロイ）

# Test
bun test                 # 単体・統合テスト (src/**/*.test.ts のみ)
bun run test:e2e         # Playwright E2E（headless）
bun run test:e2e:ui      # Playwright UI モード（デバッグ用）

# Quality
bun run typecheck        # tsc --noEmit
bun run lint             # oxlint --fix
bun run fmt              # oxfmt

# DB
bun run db:gen           # src/schema.ts の差分から SQL を生成
bun run db:mig           # drizzle-kit migrate（サーバー起動時にも自動適用される）
bun run db:push          # スキーマ直接プッシュ（プロトタイピング用）
bun run db:studio        # Drizzle Studio
```

## Key Technical Decisions

- **クライアントは htmx + Alpine.js の二本立てに限定する**: React / Vue / Stimulus 等の追加 UI ライブラリは `package.json` に入れない。Alpine はフォーム内の局所的な動的 UI（候補行の追加・削除など）のみに使い、ページ全体の状態管理には使わない
- **JS 無効でも投稿経路を壊さない**: Alpine の `x-for` で描画する動的行は `<noscript>` でも静的にレンダリングする（candidate inputs を二重に出して、Alpine 有効時は `<template>` 側が反映される構造）
- **ビルドステップを持たない**: TS / JSX は Bun が直接実行する。CSS と htmx / Alpine の JS は `prepare:assets` が `node_modules` から `public/static/` へコピーし、Bun では `serveStatic`、Workers では `[assets]` で配信する。バンドラを導入しない。`public/static/` は生成物なので直接編集しない（`app.css` の正本は `public/app.css`）
- **マイグレーションは起動時に走る**: 運用上の単純さを優先。開発で `db:gen` した SQL は次回起動で自動適用される。生成された SQL は手で書き換えない。Workers では起動時マイグレーションができないため `SKIP_DB_MIGRATE=1` でスキップし、デプロイ前に `db:mig` で適用しておく
- **AI 生成はフォールバック前提で設計する**: カード生成は Gemini が失敗しても回答送信自体は成功させる。Tier（`ai` / `template` / `default`）を DB に記録し、エラーは `QuotaExhaustedError`（恒久的）と `TransientError`（一時的）に分類して扱いを変える。AI の生出力は `src/cards.ts` でサニタイズ（文字数 / 数値クランプ / 制御文字除去）してから永続化する
- **Drizzle dialect は `"turso"` に固定**: ローカル file-backed SQLite と Turso 本番、テストの `file::memory:?cache=shared` を同じクライアントで扱う
- **`zValidator` ではなく `parseBody({ all: true })` + zod**: 候補日時のような **同名キーの繰り返し（配列フィールド）** を扱う必要があるため、自前で正規化してから `safeParse` する。ハンドラー内に手書きの型ガードを増やさない原則は維持する
- **テスト用 DB URL は `.env.test` で渡す**: 旧運用（`process.env.TURSO_DATABASE_URL = ":memory:"` を `db` の動的 import 前にセット）は廃止。Bun が `bun test` 時に `.env.test` を自動ロードする
- **`oxlint` / `oxfmt` を採用**: ESLint / Prettier に置き換えない（高速性とゼロ設定の利点を維持）

---

_Document standards and patterns, not every dependency_
