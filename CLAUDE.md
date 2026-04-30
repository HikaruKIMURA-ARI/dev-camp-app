# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun run dev` — runs the Hono server with `--hot` reload.
- `bun run start` — runs the server (production-style).
- `bun run lint` / `lint:fix` — `oxlint` (not ESLint). Categories: correctness=error.
- `bun run format` / `format:check` — `oxfmt` (not Prettier).
- `bun run db:generate` — generate a new SQL migration in `drizzle/` from `src/schema.ts`.
- `bun run db:migrate` — apply migrations via drizzle-kit (note: the server also auto-migrates at startup, see Architecture).
- `bun run db:push` — push schema directly without a migration file (dev-only shortcut).
- `bun run db:studio` — open Drizzle Studio against the configured DB.

No test framework is configured.

## TDD (テスト駆動開発) ルール

### 基本原則

- **テスト哲学に必ず従うこと**: `.claude/rules/testing/test-philosophy.md` を必ず参照すること
- **テストファースト**: すべての実装はテストを先に書いてから行う
- **Red-Green-Refactor**: このサイクルを厳密に守る
- **1 テスト 1 実装**: 一度に 1 つのテストだけを追加し、それを通す実装を書く

### テスト実行コマンド

- ユニットテスト: `bun test`

## Architecture

This is a server-rendered, htmx-driven web app on Bun. The stack is unusual enough to call out:

- **Runtime: Bun.** `src/index.tsx` exports a default object `{ port, fetch }` consumed by Bun's built-in HTTP server — there is no separate `serve()` call. `bun run --hot` provides hot reload.
- **JSX is Hono JSX, not React.** `tsconfig.json` sets `"jsxImportSource": "hono/jsx"`. Components are typed as `FC` from `hono/jsx`. Don't import from `react`. JSX is rendered server-side via `c.html(<Component/>)` and returned as HTML — there is no client-side JS framework.
- **Interactivity is htmx.** The client only loads `htmx.min.js` (served from `node_modules` via `serveStatic`). Forms/buttons use `hx-*` attributes; handlers return HTML _fragments_ (e.g. `<MessageList/>`) that htmx swaps into the DOM. When adding a new endpoint, decide: full page (return `<Page/>`) vs partial (return just the fragment matching the `hx-target`).
- **DB: Drizzle + libsql.** Local dev uses a file-backed SQLite (`local.db`); production points `TURSO_DATABASE_URL` at Turso. Same `@libsql/client` works for both. Drizzle dialect in `drizzle.config.ts` is `"turso"`.
- **Migrations run at import time.** `src/db.ts` calls `await migrate(db, { migrationsFolder: "./drizzle" })` at the top level — the server applies pending migrations on startup. After editing `src/schema.ts`, run `bun run db:generate` to produce a new SQL file under `drizzle/`; the next server start will apply it. Don't hand-edit generated migration SQL.
- **Styling: pico.css v2.** `pico.min.css` is served directly from `node_modules/@picocss/pico/css/` via `serveStatic` — no build step. Use semantic HTML (`<main class="container">`, `<form role="group">`, etc.) and pico's defaults rather than utility classes.

### Request flow (current app)

`GET /` renders the full `<Page/>` with the message list. `POST /messages` inserts a row and returns only the `<MessageList/>` fragment, which htmx swaps into `#messages` via `hx-swap="outerHTML"`. This pattern (full page on initial GET, fragment on htmx-driven mutation) is the convention to follow for new features.

## UI Standards

`ui-optimization` skill / `ui-optimizer` subagent はこのセクションを読んで判断する。プロジェクト固有のデザイン制約はここに集約すること。

### 基本情報

- **ランタイム**: Bun（`bun run dev` で起動。Node ではない）
- **検査対象 URL**: `http://localhost:3000/`
- **dev サーバ起動コマンド**: `bun run dev`（別ターミナルで起動しておくこと）
- **主要 viewport**: 375 (mobile) / 768 (tablet) / 1280 (desktop)

### デザインシステム

- **pico.css v2 のセマンティクス優先**: ユーティリティクラスや独自 CSS を増やさず、`<main class="container">`・`<form role="group">`・`<article>` などの semantic HTML + pico デフォルトで表現する
- **カラー / フォント**: pico のデフォルトに従う（独自指定をしない）
- **アイコンフォント・追加 CSS フレームワーク**: 導入禁止（pico に閉じる）

### htmx 観点での留意点

- **完全ページ返却 vs フラグメント返却の使い分けを壊さない**: 初回 GET は `<Page/>`、htmx 経由の mutation はフラグメント（例: `<MessageList/>`）
- **部分更新後の DOM を評価する**: `hx-target` で差し替わる領域は、トリガー操作後の DOM スナップショットを取り直して評価すること（初期 GET の DOM だけで判断しない）
- **空状態の考慮**: フラグメントを返すエンドポイントは「0 件のとき」の表示が崩れないこと

### アクセシビリティ最低基準

- WCAG AA 相当のコントラスト比（4.5:1）
- ボタン・リンクのタップ領域は概ね 44px 四方以上
- フォーム要素は `<label>` で関連付ける
- 画像には `alt` 属性を付ける

### 評価から除外する観点

以下は `ui-optimizer` の自動判断対象外。変更したい場合は人間が指示すること。

- ブランド表現（ロゴ・配色のトーン変更）
- マイクロインタラクション・アニメーション
- コピーライティング（文言の主観的改善）

### 変更してはいけないもの

- バックエンドロジック（`src/index.tsx` のハンドラ実装）
- スキーマ (`src/schema.ts`) とマイグレーション (`drizzle/`)
- テストファイル
- `package.json` の依存関係（pico や htmx 以外の UI ライブラリを足さない）

## Environment

`.env` provides `TURSO_DATABASE_URL` (defaults to `file:local.db`) and optional `TURSO_AUTH_TOKEN`. `PORT` defaults to 3000.
