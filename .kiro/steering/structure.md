# Project Structure

## Organization Philosophy

**フラットなレイヤー分割**。アプリ規模が小さいので、`src/` 直下にレイヤー単位（ハンドラ / ビュー / DB / スキーマ / テスト）でファイルを並べるだけに留めている。サブディレクトリで階層を切るのは、ファイル数が増えて 1 ファイル 1 責務では収まらなくなった時点でから。

機能（feature）単位でディレクトリを切らない。Hono のルーティングが `src/index.tsx` 1 箇所に集約されており、ルート → ビュー → DB の依存方向が一方向で見通せる規模を維持する。

## Directory Patterns

### Application Source

**Location**: `/src/`
**Purpose**: 実行されるアプリケーションコード。レイヤー単位のファイルが並ぶ。

- `index.tsx` — Hono アプリの組み立てとルーティング。`{ port, fetch }` を default export し、Bun が消費する。
- `views.tsx` — JSX コンポーネント（`Layout` / `Page` / `MessageList` / `MessageForm` 等）。HTML を返すための表現層。
- `db.ts` — Drizzle クライアントの生成、起動時マイグレーション、データアクセス関数（`listMessages` / `addMessage` ...）。
- `schema.ts` — Drizzle のテーブル定義と型エクスポート。`Message = typeof messages.$inferSelect` のように **スキーマから型を導出**する。
- `*.test.ts` — `bun:test` のテスト。テスト対象ファイルと同じ階層に置く（`index.test.ts` ↔ `index.tsx`）。

### Migrations

**Location**: `/drizzle/`
**Purpose**: `bun run db:generate` が出力する SQL マイグレーション。サーバー起動時に `src/db.ts` から自動適用される。
**Rule**: 生成された SQL は手で書き換えない。スキーマを変えたい場合は `src/schema.ts` を編集して再生成する。

### Static Assets

**Location**: `/public/`
**Purpose**: 必要に応じてプロジェクト固有の静的アセットを置く（現状は `app.css` のみ）。
**Note**: pico.css と htmx.js は `node_modules` から直接 `serveStatic` で配信する。`/public/` にコピーしない。

### Project Knowledge

**Location**: `/.kiro/steering/`、`/.kiro/specs/`
**Purpose**: 永続的なプロジェクト知識（steering）と仕様（specs）。`/.kiro/settings/` 配下のテンプレート・ルールはエージェント運用のメタデータであり、steering の対象ではない。

## Naming Conventions

- **ファイル**: `kebab-case` ではなく **小文字単一語 / 必要に応じてドット区切り**（`db.ts`、`index.test.ts`）。React 規約の `PascalCase.tsx` は使わない。
- **コンポーネント**: `PascalCase`（`MessageForm`、`MessageList`、`Page`、`Layout`）。`FC<Props>` で型付ける。
- **関数**: `camelCase`、動詞始まり（`listMessages`、`addMessage`、`formatTime`）。
- **テーブル / カラム**: DB は `snake_case`（`created_at`）、TS 側は Drizzle が `camelCase`（`createdAt`）に変換する。
- **テストの `describe` / `test` 名**: 日本語可。「振る舞い」を主語にする（例: `"GET / は保存済みメッセージを新しい順に表示する"`）。

## Import Organization

```typescript
// 1. 外部ライブラリ
import { Hono } from "hono";
import { z } from "zod";

// 2. ローカルモジュール（相対パス）
import { addMessage, listMessages } from "./db";
import { MessageList, Page } from "./views";
```

**Path Aliases**: 設定していない（`@/` 等は使わない）。`src/` 直下のフラット構成では相対パス（`./db`）で十分。

**JSX Import Source**: `tsconfig.json` の `jsxImportSource: "hono/jsx"` により JSX は自動で hono/jsx を使う。`react` から何かを import しない。

## Code Organization Principles

### 依存方向

```
index.tsx ──▶ views.tsx
   │              │
   ▼              ▼
  db.ts ──────▶ schema.ts
```

- ハンドラ（`index.tsx`）は views と db を使ってよい。
- views（`views.tsx`）は **schema の型のみ** を import する。db や Hono の `Context` を import しない（プレゼンテーションを純粋に保つ）。
- db（`db.ts`）は schema のみに依存する。views や Hono を知らない。

逆向きの依存（views → db、schema → views など）を作らない。

### フルページ vs フラグメント

新しいエンドポイントを追加する際の判断軸：

- **初回 GET / ページ遷移**: `<Page/>`（`<Layout>` 内包の HTML ドキュメント全体）を返す。
- **htmx 経由のミューテーション / 部分更新**: ハンドラの `hx-target` に対応するフラグメント（例: `<MessageList/>`、`<MessageForm/>`）だけを返す。`<html>` を含めない。
- **バリデーションエラー**: `c.header("HX-Retarget", "#xxx")` で差し替え先を切り替えてフラグメントを返す。入力値を保持して再描画する。

### ハンドラの薄さ

- ハンドラ内で生のクエリビルドや手書きの型ガードを増やさない。バリデーションは `zValidator`、データアクセスは `db.ts` の関数に閉じる。
- ハンドラは「バリデーション結果を受け取り → DB 関数を呼び → ビューを返す」だけに保つ。
- `views.tsx` のコンポーネントは props だけで描画し、`Context` や DB を直接触らない。

### 共有依存（DB）の扱い

- `src/db.ts` でクライアントを **1 つだけ** 生成して export する。テストも同じ db インスタンスを動的 import して使う。
- テストでは `process.env.TURSO_DATABASE_URL = ":memory:"` を `db` の import より前にセットする（マイグレーションが import 時に走る制約）。
- DB 状態は `beforeEach` の `db.delete(...)` でクリーンアップして順次実行で隔離する。モックしない。

---

_Document patterns, not file trees. New files following patterns shouldn't require updates_
