---
name: tdd-workflow
description: テスト駆動開発ワークフロー
trigger: implement|add feature|fix bug|create|build|修正|実装|追加|作成|構築
---

# TDD ワークフロー

このファイルは TDD ワークフロー全体の **オーケストレーション** だけを担う。各 Phase の詳細ルール・命名規則・AAA・モック方針・禁止事項・出力形式は、対応する Phase 別 skill を **必ず READ** すること。

ルートの `CLAUDE.md` と `.claude/rules/testing/test-philosophy.md` を **必ず READ** し、テスト思想に従うこと。

## 共通原則

- **テストファースト**: 実装の前に必ずテストを書く
- **1 テスト 1 実装**: 一度に 1 つのテストだけを追加し、それを通す実装を書く
- **Red-Green-Refactor**: このサイクルを厳密に守る
- **古典学派**: プライベート依存（他の関数・クラス）はモックせず実体を使う。プロセス外依存（外部 API 等）のみモック可
- **AAA パターン**: Arrange / Act / Assert を視覚的に分離。Arrange は `it` の外（`beforeEach` / 上位 `describe`）に置く

## Phase マッピング

| Phase                            | サブエージェント                      | 詳細ルール skill                               |
| -------------------------------- | ------------------------------------- | ---------------------------------------------- |
| Phase 1: テストケース列挙        | `.claude/agents/tdd-test-case-writer` | `.claude/skills/tdd-test-case-writer/SKILL.md` |
| Phase 2: RED（テストコード作成） | `.claude/agents/tdd-test-code-writer` | `.claude/skills/tdd-test-code-writer/SKILL.md` |
| Phase 3: GREEN（最小実装）       | `.claude/agents/tdd-implementer`      | `.claude/skills/tdd-implementer/SKILL.md`      |
| Phase 4: REFACTOR（改善）        | `.claude/agents/tdd-refactorer`       | `.claude/skills/tdd-refactorer/SKILL.md`       |

UI のリファクタリングは Phase 4 で `.claude/agents/ui-optimizer` を呼び、`.claude/skills/ui-optimization/SKILL.md` に従う（任意）。

## 進行ルール

1. **Phase 1** — `tdd-test-case-writer` agent を起動し、テストケースを列挙させる。完了後、ユーザーのレビューゲートを挟む。勝手に Phase 2 へ進まない。
2. **Phase 2** — `tdd-test-code-writer` agent を起動し、Phase 1 のケースから 1 つ選んで失敗するテストを書かせる。`bun test` で失敗を確認後、ユーザーのレビューゲートを挟む。
3. **Phase 3** — `tdd-implementer` agent を起動し、テストを通す最小実装を書かせる。`bun test` でパスを確認する。
4. **Phase 4** — `tdd-refactorer` agent を起動し、テストを保ったままリファクタリングする。UI 変更があれば `ui-optimizer` agent を併用。完了後、ユーザーのレビューゲートを挟む。

## 制約（全 Phase 共通）

- レビュー時はどのテストケースが対象かを明示すること
- Phase N を完了するまで Phase N+1 に進まない
- 各 Phase でテスト実行を必ず行う
- テストが失敗したまま次のテストを追加しない
- 各 Phase でレビューゲートが指示されている場合、それに従い勝手に次に進まないこと
