---
name: tdd-test-case-writer
description: TDD Phase 1 — テストケース列挙の詳細ルールと出力形式
trigger: テストケース列挙|test case enumeration|Phase1
---

# TDD Phase 1: テストケース列挙

`tdd-workflow` skill の **Phase 1** に対応する詳細ルール集。`tdd-test-case-writer` agent はこの skill を **必ず READ** して従う。

ルートの `CLAUDE.md` と `.claude/rules/testing/test-philosophy.md` のテスト思想に必ず従うこと。

## 手順

1. 要件と型定義のみを根拠に、検証すべき振る舞い（behavior）を抽出する
2. **テストコードは書かず、テストケースだけを列挙する**（`it.todo()` または `describe + it` のスケルトンに留める）

## ルール

- 必ず **" should 【動作】 when 【条件】"** のフォーマットでること
- 取るに足らないケースは書かない。重要なロジックを重点的にケースを書く（量を増やせばいいわけではない）
- 既存の `describe`（機能）への追加も検討する
- **実装コードを参照してはならない**（要件と型定義のみが根拠）
- レビューを求めるときは、実際に `it.todo()` を書き込んだ上でユーザーに提示すること
- Test List は「計画」であり確定仕様ではない。実装中に新しいケースを発見したら追加し、不要になったケースは削除する

## 記載方法の具体例 超重要！！

`.claude/rules/testing/test-case-example.md` を参照し、ドキュメントとして生きる室のいいテストケースを書くこと

## 出力形式

- テストファイルのパス
- 列挙したケースの一覧（`it.todo()` のラベル）
- 各ケースが検証する振る舞いの説明
