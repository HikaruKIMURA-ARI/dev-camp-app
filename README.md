# devcamp

イベントの日程・選択肢調整アプリ。

## スタック

- **Runtime**: Bun
- **Web**: Hono + JSX (SSR) + HTMX + Alpine.js
- **CSS**: Pico CSS
- **DB**: libSQL (Turso) + Drizzle ORM
- **Test**: `bun test` (unit) / Playwright (E2E)

## セットアップ

```bash
bun i
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

## 開発ルール

- TDD ワークフロー: `.claude/skills/tdd-workflow/SKILL.md`
- テスト思想: `.claude/rules/testing/test-philosophy.md`
