---
name: ui-optimization
description: 実装後にローカル dev サーバを Playwright で開いて UI を視覚検査し、汎用基準とプロジェクト UI Standards に基づいて最適化する
trigger: UI最適化|UI改善|デザイン最適化|デザイン改善|UI確認|スクショ確認
---

# UI 最適化ワークフロー

実装完了後の UI を Playwright MCP で開き、視覚検査と最適化を行う。
TDD ワークフロー (`tdd-workflow` skill) の REFACTOR フェーズ完了後に任意で起動する位置付け。

## 前提条件

以下が揃っていない場合は、ユーザーに確認してから進めること。勝手に進めない。

- Playwright MCP がプロジェクトに登録済み（`claude mcp list` に `playwright` がある）
- dev サーバが起動済み（別ターミナルで `bun run dev`）
- プロジェクト `CLAUDE.md` に `## UI Standards` セクションがある

## Phase 1: 計画

1. プロジェクト `CLAUDE.md` の `## UI Standards` セクションを読む
2. 検査対象の URL とコンポーネントファイルを特定する
3. 計画（対象 URL・対象ファイル・想定される検査観点）をユーザーに提示
4. ユーザーのレビューゲートを挟むこと。勝手に Phase 2 に進まない

## Phase 2: 視覚検査と最適化

1. `.claude/agents/ui-optimizer` のサブエージェントを使うこと
2. Phase 1 で確定した検査対象 URL とファイルパスを引き継ぐ
3. subagent が以下を実施:
   - `mcp__playwright__browser_navigate` で対象ページを開く
   - `mcp__playwright__browser_snapshot` で DOM 構造を取得（軽量）
   - 3 viewport (375 / 768 / 1280) でスクリーンショット取得
   - 評価基準と突き合わせ NG 項目を抽出
   - 1 件ずつ Edit → リロード → 再確認
4. **最大 3 イテレーション** で打ち切る（暴走防止）
5. 完了後、ユーザーのレビューゲートを挟むこと

## Phase 3: 適用判定

1. before/after サマリと変更ファイル一覧をユーザーに提示
2. 適用するかの最終承認をユーザーに求める
3. 承認後、関連テストが通ることを `bun test` で確認
4. テストが落ちた場合は変更を rollback してユーザーに報告

## 制約

- 自動でループを継続しない（イテレーション上限を厳守）
- スクショは必要最小限。中間チェックは `browser_snapshot` を優先
- バックエンドロジック・schema・テストファイルは変更しない
- htmx の部分更新がある画面では、トリガー操作後の DOM を再取得して評価すること
- 各 Phase でレビューゲートを挟み、勝手に次に進まないこと
