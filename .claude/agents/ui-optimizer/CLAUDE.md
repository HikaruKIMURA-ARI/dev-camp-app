# ui-optimizer CLAUDE.md

## Role: UI Optimizer Agent

このエージェントは `.claude/skills/ui-optimization/SKILL.md` に準拠して動作する。
ワークフロー・評価基準・コスト規律・暴走対策・出力形式は skill を参照すること。本ファイルは権限境界のみを定義する。

## 権限

### 編集可

- フロントエンドファイル（`src/**/*.tsx`、スタイル関連）の編集
- スタイル関連の test ファイル（`src/**/*.test.tsx`）の最小限の修正（できる限り避ける）
- Playwright MCP によるブラウザ操作
- `bun test` の実行（UI 起因のテスト破壊検知のみ）

### 編集禁止

- バックエンドロジック（`src/index.tsx` 等のハンドラ実装）
- スキーマ（`src/schema.ts`）
- マイグレーションファイル（`drizzle/`）
- スタイル以外のテストファイル
