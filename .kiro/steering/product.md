# Product Overview

サーバーレンダリング型のシンプルなメッセージボード Web アプリ。フォームに「ユーザー名 / 性別 / 本文」を入力して投稿し、新着順に一覧表示する。

学習・検証目的の小さなアプリで、モダンな SPA フレームワークに頼らず **サーバーで HTML を生成し htmx で部分更新する** スタックを実証することそのものが価値の中心にある。

## Core Capabilities

- メッセージ投稿（ユーザー名・性別・本文の必須バリデーション付き）
- メッセージ一覧の新着順表示（最大 50 件）
- htmx による部分更新（投稿後にフォームをリセットしつつ一覧だけを差し替え）
- バリデーションエラーの再描画（`HX-Retarget` でフォームへ差し戻し、入力値を保持）
- 空状態の明示的な表示

## Target Use Cases

- htmx + サーバーサイド JSX という構成のリファレンス実装として参照する
- Bun / Hono / Drizzle / pico.css を組み合わせた最小構成での開発体験を確認する
- TDD（`bun test` + 実 DB を使った古典派単体テスト）の練習台として利用する

## Value Proposition

- **クライアント JS フレームワーク不在**: React も Vue も使わず、配布される JS は htmx のみ。ペイロードと認知負荷が小さい。
- **ビルドステップが事実上ゼロ**: Bun が TypeScript / JSX を直接実行し、CSS は `node_modules` から静的配信する。
- **マイグレーション込みで起動が単純**: `bun run dev` 一発でサーバーが立ち上がり、起動時に Drizzle マイグレーションが自動適用される。
- **ローカルとプロダクションの差を最小化**: 同じ `@libsql/client` でローカルは file-backed SQLite、本番は Turso にそのまま接続できる。

---

_Focus on patterns and purpose, not exhaustive feature lists_
