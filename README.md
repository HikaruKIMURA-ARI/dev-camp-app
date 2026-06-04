# devcamp

イベントの日程・選択肢調整アプリ。

## スタック

- **Runtime**: Bun
- **Web**: Hono + HTMX
- **CSS**: Pico CSS
- **DB**: libSQL (Turso) + Drizzle ORM
- **Test**: `bun test` (unit) / Playwright (E2E)

## セットアップ

```bash
bun i
cp .env.example .env   # なければ .env を手動作成（下記参照）
bun db:gen
bun db:mig
bun dev
```

## ディレクトリ

```
src/         アプリ本体 (index.tsx, routes.tsx, views.tsx, schema.ts, db.ts)
drizzle/     マイグレーション
tests/e2e/   Playwright E2E テスト
```

## GitHub Actions でデプロイ

`main` への push、または Actions タブから **Deploy** ワークフローを手動実行すると、`bun test` と E2E（Playwright）に通ったあと、Turso へ `bun db:mig` して Cloudflare Workers へデプロイします。テスト用の DB は `.env.test` / `test-e2e.db` のため、Turso の Secrets はデプロイジョブでのみ使います。

リポジトリの **Settings → Secrets and variables → Actions** に次を登録してください。

| Secret                  | 用途                              |
| ----------------------- | --------------------------------- |
| `TURSO_DATABASE_URL`    | 本番 libSQL URL（`libsql://...`） |
| `TURSO_AUTH_TOKEN`      | Turso 認証トークン                |
| `CLOUDFLARE_API_TOKEN`  | Workers 編集権限付き API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID          |

`GEMINI_API_KEY` などランタイム用の値は、初回のみ `wrangler secret put` で Cloudflare 側に設定してください（デプロイのたびに Actions から渡す必要はありません）。

## Cloudflare Workers へのデプロイ（手動）

1. [Turso](https://turso.tech/) で本番 DB を用意し、マイグレーションを適用する。

```bash
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... bun db:mig
```

2. Cloudflare にログインし、シークレットを設定する。

```bash
bunx wrangler login
bunx wrangler secret put TURSO_DATABASE_URL
bunx wrangler secret put TURSO_AUTH_TOKEN
# 任意: bunx wrangler secret put GEMINI_API_KEY
```

3. ローカルで Workers を試す場合は `.dev.vars` を用意する（`.dev.vars.example` 参照）。

```bash
cp .dev.vars.example .dev.vars
bun run dev:worker
```

4. デプロイする。

```bash
bun run deploy
```

静的ファイル（htmx / Alpine / Pico など）は `bun run prepare:assets` で `public/static/` にコピーされ、Wrangler の [Static Assets](https://developers.cloudflare.com/workers/static-assets/) から配信されます。Workers 上では `SKIP_DB_MIGRATE=1` のため、DB スキーマ変更はデプロイ前の `bun db:mig` で行ってください。

## 開発ルール

- TDD ワークフロー: `.claude/skills/tdd-workflow/SKILL.md`
- テスト思想: `.claude/rules/testing/test-philosophy.md`

## cc-sdd コマンド

| コマンド                                   | 主な引数   | 目的                                                                  | 次に実行するコマンド                       |
| ------------------------------------------ | ---------- | --------------------------------------------------------------------- | ------------------------------------------ |
| `/kiro:steering`                           | –          | プロジェクトメモリの作成/更新                                         | `/kiro:spec-init`                          |
| `/kiro:steering-custom`                    | 対話形式   | ドメイン固有のステアリング情報を追加                                  | `/kiro:spec-init` (必要に応じて再実行)     |
| `/kiro:spec-init <feature>`                | 機能説明   | `.kiro/specs/<feature>/` を作成                                       | `/kiro:spec-requirements <feature>`        |
| `/kiro:spec-requirements <feature>`        | 機能名     | `requirements.md` を生成                                              | `/kiro:spec-design <feature>`              |
| `/kiro:validate-gap <feature>`             | 任意       | 既存コードと要件差分を検証                                            | `/kiro:spec-design <feature>`              |
| `/kiro:spec-design <feature> [-y]`         | 機能名     | `research.md`（必要に応じて）と `design.md` を生成                    | `/kiro:spec-tasks <feature>`               |
| `/kiro:validate-design <feature>`          | 任意       | 設計の品質評価                                                        | `/kiro:spec-tasks <feature>`               |
| `/kiro:spec-tasks <feature> [-y]`          | 機能名     | 並列実行を考慮したタスクリスト `tasks.md`（実行順序ラベル付き）を作成 | `/kiro:spec-impl <feature> [task-ids]`     |
| `/kiro:spec-impl <feature> [task-ids]`     | タスク番号 | 実装とテスト駆動開発（TDD）の実行                                     | `/kiro:validate-impl [feature] [task-ids]` |
| `/kiro:validate-impl [feature] [task-ids]` | 任意       | 実装のレビュー/テスト結果を確認                                       | `/kiro:spec-status <feature>`              |
| `/kiro:spec-status <feature>`              | 機能名     | 各フェーズの進捗・承認状況を要約                                      | レコメンドに従って次フェーズへ             |

## 開発の流れ

1. cc-sdd のコマンドに従って、要件定義、設計、タスク化まで行なってください。
2. /kiro:spec-impl を実行すると、tdd-workflow skills と agent が起動し、テストケース列挙、RED, GREEN, REFACTOR の順で実装開始されます。
   ※レビューを求められたらレビューして次のフェーズへ進めてください。
3. 1 区切りしたら、ui-optimizer skill を使って、UI の調整をさせてください。playwright mcp を使って自動でやってくれます。
4. 最後に e2e workflow skills を起動し、e2e テストを書いてください。これは実装をテストに落とし込むだけでいいです（not TDD ）。
   また、ハッピーパス数件と異常系数件にとどめてください。
