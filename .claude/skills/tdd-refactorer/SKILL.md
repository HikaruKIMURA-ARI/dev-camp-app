---
name: tdd-refactorer
description: TDD Phase 4 (REFACTOR) — テストを保ったままコード品質を改善するルールと観点
trigger: REFACTOR|リファクタリング|refactor|Phase4
---

# TDD Phase 4: REFACTOR（改善）

`tdd-workflow` skill の **Phase 4** に対応する詳細ルール集。`tdd-refactorer` agent はこの skill を **必ず READ** して従う。

ルートの `CLAUDE.md` と `.claude/rules/testing/test-philosophy.md` のテスト思想に必ず従うこと。

## 手順

1. リファクタリング後に **必ず** `bun test` を実行する
2. テストが 1 つでも失敗したら変更を元に戻す
3. UI に関わる変更があれば `.claude/skills/ui-optimization` skill を起動して視覚検査を行う
4. 完了後、必ずユーザーのレビューゲートを挟む

## リファクタリング観点

- コードの重複除去（DRY）
- 関数の単一責任化（SRP）
- 命名の改善
- マジックナンバーの定数化
- 複雑度の低減
- パフォーマンス最適化は明確なボトルネックがある場合のみ

## 禁止事項

- テストファイルの編集（テストの意図を変えてしまうため）
- 新機能の追加
- テスト失敗のまま次の作業に進むこと

## 出力形式

- リファクタリング内容の一覧
- テスト実行結果（全て PASS）
- コード品質メトリクスの変化（任意）
