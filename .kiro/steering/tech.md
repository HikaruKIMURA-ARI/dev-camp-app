# Technology Stack

## Architecture

サーバーレンダリング + htmx 駆動のクラシックな Web アプリ。Hono のハンドラーが JSX を文字列 HTML に変換して返し、クライアントは htmx で部分更新する。SPA でもなく、API + フロントの二段構えでもない、**単一プロセスのモノリス**。

- **初回 GET**: `<Page/>`（HTML ドキュメント全体）を返す
- **htmx 経由のミューテーション**: フラグメント（例: `<MessageList/>`）だけを返し、`hx-target` で指定された DOM ノードに差し替える
- **マイグレーションは起動時に自動適用**: `src/db.ts` のトップレベルで `await migrate(...)` を呼んでいる

この「フルページ vs フラグメント」の使い分けが本プロジェクトの中核的な設計判断であり、新エンドポイントを追加する際は必ずどちらを返すか決める。

## Core Technologies

- **Language**: TypeScript（`strict: true`）
- **Runtime**: Bun（Node ではない。`bun run --hot` がホットリロード）
- **Web Framework**: Hono（`src/index.tsx` が `{ port, fetch }` を default export し、Bun 標準の HTTP サーバーが消費する）
- **View**: Hono JSX（`jsxImportSource: "hono/jsx"`、React ではない）
- **Client Interactivity**: htmx 2.x（`hx-*` 属性ベース、クライアント JS フレームワークなし）
- **Database**: libsql / SQLite（ローカルは `file:local.db`、本番は Turso）
- **ORM / Migration**: drizzle-orm + drizzle-kit（dialect は `"turso"`）
- **CSS**: pico.css v2（`node_modules` から静的配信、ビルドステップなし）
- **Validation**: zod + `@hono/zod-validator`

## Key Libraries

実装パターンに直接影響するもののみ列挙する：

- `hono/jsx` — JSX のインポート元。`react` から取り込まない。コンポーネントは `FC` from `hono/jsx`。
- `@hono/zod-validator` の `zValidator` — フォームバリデーションの正規ルート。エラー時のレンダリングは callback 内で行う。
- `drizzle-orm/libsql` の `drizzle()` / `migrate()` — DB クライアントは `src/db.ts` で 1 つだけ生成し、そこから export する。
- `hono/bun` の `serveStatic` — `node_modules` 配下の静的アセットを直接配信する手段（追加のバンドラを入れない）。

## Development Standards

### Type Safety

- TypeScript `strict: true`。`any` を新規に増やさない。
- スキーマ由来の型は `typeof messages.$inferSelect` 等を使い、ハンドコードしない。

### Code Quality

- **Linter**: `oxlint`（ESLint **ではない**）。`bun run lint` / `bun run lint:fix`。`correctness` カテゴリは error。
- **Formatter**: `oxfmt`（Prettier **ではない**）。`bun run format` / `bun run format:check`。
- **Type Check**: `bun run typecheck`（`tsc --noEmit`）。

### Testing

- **Runner**: `bun test`（`bun:test` から `describe / test / expect / beforeEach` を import）。
- **Philosophy**: `.claude/rules/testing/test-philosophy.md` の古典派 TDD に従う。詳細はそちらを正本とする。要点のみ：
  - 「単体」= 1 つの振る舞い（クラスや関数ではない）
  - 共有依存（DB）は実体を使い、`beforeEach` でクリーンアップして順次実行で隔離
  - プライベート依存はモックしない、プロセス外依存だけ限定的にモック
  - AAA を視覚的に分け、Arrange は `it` の外（`beforeEach`）に置く
- **Test DB**: `process.env.TURSO_DATABASE_URL = ":memory:"` を import 前にセットしてから `./db` を動的 import する（マイグレーションが import 時に走るため）。
- **Test List vs Test Code**: ケース列挙とテストコードを分ける（`it.todo()` で列挙 → 後でコード化）。

## Development Environment

### Required Tools

- Bun（最新版。`@types/bun` の latest を参照）
- TypeScript 5.6+
- `.env` に `TURSO_DATABASE_URL`（省略時は `file:local.db`）、任意で `TURSO_AUTH_TOKEN`、`PORT`（既定 3000）

### Common Commands

```bash
# Dev
bun run dev              # --hot 付きで src/index.tsx を起動

# Test / Quality
bun test                 # 単体・統合テスト
bun run typecheck        # tsc --noEmit
bun run lint             # oxlint --fix
bun run fmt              # oxfmt

# DB
bun run db:generate      # src/schema.ts の差分から SQL を生成
bun run db:migrate       # drizzle-kit migrate（サーバー起動時にも自動適用される）
bun run db:studio        # Drizzle Studio
```

## Key Technical Decisions

- **クライアント JS フレームワークを採用しない**: 配布する JS は htmx のみ。新規 UI ライブラリを `package.json` に追加しない。
- **ビルドステップを持たない**: TS / JSX は Bun が直接実行し、CSS は `node_modules` から `serveStatic` で配信する。バンドラを導入しない。
- **マイグレーションは起動時に走る**: 運用上の単純さを優先。開発で `db:generate` した SQL は次回起動で自動適用される。生成された SQL は手で書き換えない。
- **Drizzle dialect は `"turso"` に固定**: ローカル file-backed SQLite と Turso 本番で同じクライアントが動く。
- **バリデーションは zod + zValidator に集約**: ハンドラー内で手書きの型ガードを増やさない。エラー時はフラグメント + `HX-Retarget` で `#message-form` に差し戻し、入力値を保持する。
- **`oxlint` / `oxfmt` を採用**: ESLint / Prettier に置き換えない（高速性とゼロ設定の利点を維持）。

---

_Document standards and patterns, not every dependency_
