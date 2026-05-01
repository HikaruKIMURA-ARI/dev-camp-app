# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリのコードを扱う際のガイダンスを提供します。

## コマンド

- `bun run dev` — Hono サーバーを `--hot` リロード付きで起動します。
- `bun run start` — サーバーを起動します（本番スタイル）。
- `bun run lint` / `lint:fix` — `oxlint`（ESLint ではない）。カテゴリ: correctness=error。
- `bun run format` / `format:check` — `oxfmt`（Prettier ではない）。
- `bun run db:generate` — `src/schema.ts` から新しい SQL マイグレーションを `drizzle/` に生成します。
- `bun run db:migrate` — drizzle-kit 経由でマイグレーションを適用します（注: サーバーも起動時に自動マイグレーションを実行します。Architecture 参照）。
- `bun run db:push` — マイグレーションファイルなしでスキーマを直接プッシュします（開発専用のショートカット）。
- `bun run db:studio` — 設定済み DB に対して Drizzle Studio を開きます。

テストフレームワークは設定されていません。

## TDD (テスト駆動開発) ルール

### 基本原則

- **テスト哲学に必ず従うこと**: `.claude/rules/testing/test-philosophy.md` を必ず参照すること
- **実装は skills と agnets を活用すること** `.claude/skills/tdd-workflow/SKILL.md`を参照するこ
- **テストファースト**: すべての実装はテストを先に書いてから行う
- **Red-Green-Refactor**: このサイクルを厳密に守る
- **1 テスト 1 実装**: 一度に 1 つのテストだけを追加し、それを通す実装を書く

### テスト実行コマンド

- ユニットテスト: `bun test`

## E2E テスト規約

`e2e-test-workflow` skill / `e2e-scenario-writer` / `e2e-test-implementer` subagent はこのセクションを読んで判断する。

- **位置付け**: 機能完成後の後追い。テストピラミッドで最少（ハッピー 2-3 + 異常 1-2）
- **実装は skills と agents を活用**: `.claude/skills/e2e-test-workflow/SKILL.md` を参照
- **テストランナー**: `@playwright/test`（`bun run test:e2e`）。`bun test` とは別コマンド
- **dev サーバ**: `playwright.config.ts` の `webServer` が port 3001 で自動起動（`reuseExistingServer: true` で既存も再利用）。`bun run dev`（port 3000）と非衝突
- **DB**: 専用ファイル `test-e2e.db`。`tests/e2e/fixtures/db.ts` の `truncateAll()` を `test.beforeEach` で呼ぶ
- **配置**: `tests/e2e/**/*.spec.ts`、ヘルパは `tests/e2e/fixtures/`
- **実行モード**: headless 固定（`use.headless: true`）。CI でもローカルでも同じ挙動。デバッグ時のみ `bun run test:e2e:ui` または `bunx playwright test --headed` を使う
- **CI セットアップ**: 初回 `bunx playwright install --with-deps chromium` でブラウザバイナリ取得が必要
- **CI フラグ**: `forbidOnly: !!process.env.CI`（`test.only` 残置を阻止）、`retries: 2`（CI のみ）、`workers: 1`（DB 共有のため順次実行）

## アーキテクチャ

これは Bun 上のサーバーレンダリング・htmx 駆動の Web アプリです。スタックがやや特殊なので、明示的に説明します:

- **ランタイム: Bun。** `src/index.tsx` がデフォルトオブジェクト `{ port, fetch }` をエクスポートし、Bun の組み込み HTTP サーバーがそれを消費します — 別途 `serve()` 呼び出しはありません。`bun run --hot` でホットリロードが有効になります。
- **JSX は Hono JSX であり、React ではない。** `tsconfig.json` で `"jsxImportSource": "hono/jsx"` を設定しています。コンポーネントは `hono/jsx` の `FC` として型付けします。`react` からインポートしてはいけません。JSX は `c.html(<Component/>)` を経由してサーバーサイドでレンダリングされ、HTML として返されます — クライアントサイド JS フレームワークは存在しません。
- **インタラクティブ性は htmx。** クライアントが読み込むのは `htmx.min.js` のみ（`serveStatic` 経由で `node_modules` から提供）。フォーム / ボタンは `hx-*` 属性を使い、ハンドラは htmx が DOM に差し込む HTML _フラグメント_（例: `<MessageList/>`）を返します。新しいエンドポイントを追加する際は、フルページ（`<Page/>` を返す）かパーシャル（`hx-target` に対応するフラグメントのみを返す）かを判断します。
- **DB: Drizzle + libsql。** ローカル開発ではファイルバックの SQLite（`local.db`）を使用し、本番では `TURSO_DATABASE_URL` を Turso に向けます。同じ `@libsql/client` が両方で動作します。`drizzle.config.ts` の Drizzle dialect は `"turso"` です。
- **マイグレーションはインポート時に実行される。** `src/db.ts` がトップレベルで `await migrate(db, { migrationsFolder: "./drizzle" })` を呼び出します — サーバーは起動時に保留中のマイグレーションを適用します。`src/schema.ts` を編集した後は `bun run db:generate` を実行して `drizzle/` 配下に新しい SQL ファイルを生成し、次回サーバー起動時に適用されます。生成されたマイグレーション SQL を手で編集してはいけません。
- **スタイリング: pico.css v2。** `pico.min.css` は `serveStatic` 経由で `node_modules/@picocss/pico/css/` から直接提供されます — ビルドステップなし。ユーティリティクラスではなく、セマンティック HTML（`<main class="container">`、`<form role="group">` など）と pico のデフォルトを使います。

### リクエストフロー（現在のアプリ）

`GET /` は `<Page/>` 全体をメッセージリスト付きでレンダリングします。`POST /messages` は行を挿入し、`<MessageList/>` フラグメントのみを返します。これを htmx が `hx-swap="outerHTML"` で `#messages` に差し込みます。このパターン（初回 GET ではフルページ、htmx 駆動の mutation ではフラグメント）が、新機能でも従うべき規約です。

## UI 標準

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

## 環境

`.env` には `TURSO_DATABASE_URL`（デフォルトは `file:local.db`）と任意の `TURSO_AUTH_TOKEN` を設定します。`PORT` のデフォルトは 3000 です。
