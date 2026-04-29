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

### テスト命名規則

- describe: 対象の関数名またはクラス名
- it/test: `should [期待する振る舞い] when [条件]` を日本語で表し、生きたドキュメントにすること
- 例: `it('should return 0 when input is empty string')` → `it('入力が何もない時は、0を返すこと')`

### AAA パターン（必須）

すべてのテストは以下の構造に従う：

// Arrange（準備）
const input = createTestInput()

// Act（実行）
const result = targetFunction(input)

// Assert（検証）
expect(result).toBe(expected)

### 禁止事項

- テストケースを列挙する前に、テストコードを書くこと
- テストを書く前に実装コードを書くこと
- テストを修正して実装に合わせること（実装を修正せよ）
- `test.skip()` や `test.todo()` を残したままにすること
- テストファイルで `any` 型を使うこと
- 1 つのテストで複数の振る舞いを検証すること
- 実装の内部詳細に依存するテストを書くこと

### モック方針

- 実データ、実 DB、実 HTTP 通信を通した古典学派のテストをすること
- 外部 API のみモック可（内部モジュールは実際のコードを使う）
- モック対象は明示的にコメントで理由を記述

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

## Environment

`.env` provides `TURSO_DATABASE_URL` (defaults to `file:local.db`) and optional `TURSO_AUTH_TOKEN`. `PORT` defaults to 3000.
