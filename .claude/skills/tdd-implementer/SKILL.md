---
name: tdd-implementer
description: TDD Phase 3 (GREEN) — テストを通す最小実装の詳細ルールと出力形式
trigger: GREEN|最小実装|minimal implementation|Phase3
---

# TDD Phase 3: GREEN（最小実装）

`tdd-workflow` skill の **Phase 3** に対応する詳細ルール集。`tdd-implementer` agent はこの skill を **必ず READ** して従う。

ルートの `CLAUDE.md` と `.claude/rules/testing/test-philosophy.md` のテスト思想に必ず従うこと。

## 手順

1. テストをパスさせる **最小限のコード** だけを書く
2. `bun test` を実行してパスを確認する
3. 他のテストが壊れていないことを確認する

## ルール

- "最小限"とは：余分な機能、最適化、リファクタリングを含まない
- テストが要求しないエッジケース処理は追加しない
- リファクタリングはこのフェーズではしない（Phase 4 で行う）
- 全テストがパスすることを確認する

## 禁止事項

- テストファイルの編集（テストの意図を変えてしまうため）
- テストが要求しない機能・エッジケース処理の追加
- パフォーマンス最適化（明確なボトルネックがある場合のみ Phase 4 で扱う）

## 出力形式

- 変更したファイルのパス
- テスト実行結果（全て PASS）
- 実装の簡潔な説明
