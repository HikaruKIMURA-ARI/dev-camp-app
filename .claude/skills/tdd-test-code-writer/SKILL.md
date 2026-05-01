---
name: tdd-test-code-writer
description: TDD Phase 2 (RED) — 失敗するテストコード作成の詳細ルール、命名規則、AAA、モック方針
trigger: RED|テストコード作成|test code writing|Phase2
---

# TDD Phase 2: RED（テストコード作成）

`tdd-workflow` skill の **Phase 2** に対応する詳細ルール集。`tdd-test-code-writer` agent はこの skill を **必ず READ** して従う。

ルートの `CLAUDE.md` と `.claude/rules/testing/test-philosophy.md` のテスト思想に必ず従うこと。

## 手順

1. Phase 1 で列挙したケースから 1 つを選び、**失敗するテストを書く**
2. `bun test` を実行して失敗を確認する
3. 失敗メッセージが期待通りであることを確認する
4. 完了後、必ずユーザーのレビューゲートを挟む。勝手に Phase 3 へ進まない

## テスト命名規則

- `describe`: 対象の機能
- `it` / `test`: `should [期待する振る舞い] when [条件]` を **日本語** で表現し、生きたドキュメントにする
- 実装の詳細ではなく、実際の振る舞いをケース名にする
- 例: ❌ `it('should return 0 when input is empty string')` → ✅ `it('入力が何もない時は、0が表示されること')`

## AAA パターン（必須）

```ts
// Arrange（準備） — `it` の外に置く（beforeEach / 上位 describe）
const input = createTestInput();

// Act（実行） — `it` 内、対象の振る舞いを 1 つだけ
const result = targetFunction(input);

// Assert（検証） — `it` 内、事後条件・不変条件
expect(result).toBe(expected);
```

## モック方針

- 実データ・実 DB・実 HTTP 通信を通した古典学派のテストを行う
- **DB は実体を使う**（Drizzle + libsql の `local.db`）。`beforeEach` で投入し、`afterEach` でクリーンアップする
- プライベート依存（内部モジュール・他のクラス・関数）はモックしない
- プロセス外依存（auth、外部 API 等）のみモック可。モック対象には理由をコメントで記述する

## 禁止事項

- テストケースを列挙する前にテストコードを書くこと
- テストを書く前に実装コードを書くこと
- テストを修正して実装に合わせること（実装を修正せよ）
- `test.skip()` や `test.todo()` を残したままにすること（Phase 1 完了後の Phase 2 では実装に置き換える）
- テストファイルで `any` 型を使うこと
- 1 つのテストで複数の振る舞いを検証すること
- 実装の内部詳細に依存するテスト（正規表現マッチ等の過剰検証）を書くこと
- テストが意図せずパスした場合は黙って進めず、ユーザーに報告すること

## 出力形式

- テストファイルのパス
- テスト実行結果（対象テストは FAIL、他は変化なし）
- テストが検証する振る舞いの説明
