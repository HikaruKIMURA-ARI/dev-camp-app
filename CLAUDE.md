# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリのコードを扱う際のガイダンスを提供します。

## Stream Timeout Prevention

1. タスクは一つずつ実行する。一つ完了して確認してから次に進む。
2. 1 回のツール呼び出しで 150 行を超えるファイルを書かない。長いファイルは複数回に分けて追記・編集する。
3. 会話が長くなったら（ツール呼び出し 20 回超）新しいセッションを開始する.セッションが長くなるほどエラーが起きやすくなる。
4. grep/検索の出力は短く保つ。--include や-l（ファイル名のみ）フラグを使う。
5. タイムアウトが発生したら、同じステップをより短い形でリトライする。タスク全体を最初からやり直さない。

## TDD (テスト駆動開発) ルール

### 基本原則

- **テスト哲学に必ず従うこと**: `.claude/rules/testing/test-philosophy.md` を必ず参照すること
- **実装は skills と agnets を活用すること** `.claude/skills/tdd-workflow/SKILL.md`を参照するこ

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

## 環境

`.env` には `TURSO_DATABASE_URL`（デフォルトは `file:local.db`）と任意の `TURSO_AUTH_TOKEN` を設定します。`PORT` のデフォルトは 3000 です。
