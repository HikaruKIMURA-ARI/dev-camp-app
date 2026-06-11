# Product Overview

サーバーレンダリング型の **日程調整 / 選択肢調整 Web アプリ**（いわゆる「調整さん」系）。イベント主催者が候補日時を並べて発行した URL に、参加者が名前と ○/△/× で回答し、その場で集計が更新される。

学習・検証目的の小さなアプリで、モダンな SPA フレームワークに頼らず **サーバーで HTML を生成し htmx で部分更新する** スタックを実証することそのものが価値の中心にある。フォーム内のクライアント側動的 UI（候補行の追加・削除）にだけ Alpine.js を限定的に使う。

## Core Capabilities

- **イベント作成**: タイトル / 候補日時（複数、重複不可、`datetime-local`）/ 任意のカスタム設問（複数可）/ 主催者コメント（description）/ 任意の回答締め切り。`POST /events` のみ通常フォーム送信（非 htmx）で、作成後は `/events/:id` へ 302。
- **イベント閲覧**: `/events/:id` で候補一覧・回答一覧・集計（○/△/× の件数）を表示。
- **回答送信**: 参加者は名前と各候補への ○/△/× を送信。新規送信 / 編集 ともに `<ResponsesTable>` フラグメントだけが htmx で差し替わる。
- **回答編集**: 行内で「編集」を押すと `<ResponseFormRow>` フラグメントに差し替わり、PUT で更新する。
- **回答締め切り**: イベントに任意の締め切り（ISO 文字列）を設定でき、締め切りを過ぎると新規回答・編集が拒否される（`src/deadline.ts` の純粋関数 `isDeadlinePassed` で判定）。
- **参加者カード生成**: 回答送信時に Gemini API で参加者名からトレーディングカード風の属性（称号 / レアリティ / 属性 / 種族 / フレーバー / 攻守値）を生成し、`<CardsCarousel>` に表示する。AI 失敗時は template → default にフォールバックする 3 段 Tier 制（`ai` / `template` / `default`）。
- **バリデーション差し戻し**: zod でスキーマ検証し、422 で入力値を保持したフラグメントを返す。
- **テーマ切替**: ライト / ダーク を cookie で保持し、`POST /theme` は `HX-Refresh: true` を返してページ全体を再描画させる。

## Target Use Cases

- htmx + サーバーサイド JSX + 限定的な Alpine.js という構成のリファレンス実装として参照する
- Bun / Hono / Drizzle / pico.css を組み合わせた最小構成での開発体験を確認する
- 古典派 TDD（`bun test` + 実 DB / in-memory SQLite）と Playwright E2E（HTTP 経路）を併用する練習台

## Value Proposition

- **クライアント JS フレームワーク最小**: 配布する JS は htmx と Alpine.js のみ。React / Vue を持ち込まない。Alpine は「フォーム内の動的行操作」など、htmx のフラグメント差し替えでは表現しづらい局所的なリアクティビティのみに使う。
- **ビルドステップが事実上ゼロ**: Bun が TypeScript / JSX を直接実行する。CSS と htmx / Alpine の JS は `prepare:assets` スクリプトが `node_modules` から `public/static/` へコピーするだけ（バンドラなし）。
- **マイグレーション込みで起動が単純**: `bun run dev` 一発でサーバーが立ち上がり、起動時に Drizzle マイグレーションが自動適用される（Workers では `SKIP_DB_MIGRATE=1` でスキップ）。
- **ローカル / テスト / 本番で同じクライアント**: `@libsql/client` のままで、ローカルは file-backed SQLite、テストは `file::memory:?cache=shared`、本番は Turso にそのまま接続できる。
- **同じアプリを Bun と Cloudflare Workers の両方で動かせる**: `src/app.ts` にアプリ本体を集約し、`src/index.tsx`（Bun）と `src/worker.ts`（Workers）はエントリポイントの差分だけを持つ。
- **JS 無効でも動く骨格**: フォームの追加候補行は `<noscript>` で静的にも描画されるため、Alpine が無効でも投稿経路は壊れない。

---

_Focus on patterns and purpose, not exhaustive feature lists_
