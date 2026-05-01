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

| Phase                            | `subagent_type`        | エージェント定義                       | 詳細ルール skill                               |
| -------------------------------- | ---------------------- | -------------------------------------- | ---------------------------------------------- |
| Phase 1: テストケース列挙        | `tdd-test-case-writer` | `.claude/agents/tdd-test-case-writer/` | `.claude/skills/tdd-test-case-writer/SKILL.md` |
| Phase 2: RED（テストコード作成） | `tdd-test-code-writer` | `.claude/agents/tdd-test-code-writer/` | `.claude/skills/tdd-test-code-writer/SKILL.md` |
| Phase 3: GREEN（最小実装）       | `tdd-implementer`      | `.claude/agents/tdd-implementer/`      | `.claude/skills/tdd-implementer/SKILL.md`      |
| Phase 4: REFACTOR（改善）        | `tdd-refactorer`       | `.claude/agents/tdd-refactorer/`       | `.claude/skills/tdd-refactorer/SKILL.md`       |

UI のリファクタリングは Phase 4 で `subagent_type: "ui-optimizer"` を呼び、`.claude/skills/ui-optimization/SKILL.md` に従う（任意）。

## 起動方法（必須）

各 Phase は **必ず `Agent` ツールで対応するサブエージェントを起動** する。メインエージェントが SKILL.md を読んで Phase 作業を直接実行することは禁止（プロジェクト agent の `CLAUDE.md` で定義された権限境界が無視され、ワークフロー定義から外れるため）。

呼び出し例（Phase 1 の場合）:

```
Agent({
  description: "Phase 1: テストケース列挙",
  subagent_type: "tdd-test-case-writer",
  prompt: "<Phase 1 への指示。Phase マッピング表の SKILL.md と本ワークフローを必ず Read させる>"
})
```

ルール:

- `subagent_type` には Phase マッピング表の値（`tdd-test-case-writer` 等）を **そのまま** 渡す
- `general-purpose` での代替は **禁止**（プロジェクト agent の権限境界が反映されないため）
- 速度を理由にスキップしない（速さよりワークフロー準拠を優先）
- サブエージェントから返ってきた変更内容は、メインエージェントがレビュー・テスト実行・ユーザへの報告で再確認する

## 進行ルール

1. **Phase 1** — `subagent_type: "tdd-test-case-writer"` を起動し、テストケースを列挙させる。完了後、ユーザーのレビューゲートを挟む。勝手に Phase 2 へ進まない。
2. **Phase 2** — `subagent_type: "tdd-test-code-writer"` を起動し、Phase 1 のケースから 1 つ選んで失敗するテストを書かせる。`bun test` で失敗を確認後、ユーザーのレビューゲートを挟む。
3. **Phase 3** — `subagent_type: "tdd-implementer"` を起動し、テストを通す最小実装を書かせる。`bun test` でパスを確認する。
4. **Phase 4** — `subagent_type: "tdd-refactorer"` を起動し、テストを保ったままリファクタリングする。UI 変更があれば `subagent_type: "ui-optimizer"` を併用。完了後、ユーザーのレビューゲートを挟む。

## 制約（全 Phase 共通）

- 各 Phase は `Agent` ツールで対応する `subagent_type` のサブエージェントを起動すること。`general-purpose` での代替やメインエージェントによる直接実行を禁止
- レビュー時はどのテストケースが対象かを明示すること
- Phase N を完了するまで Phase N+1 に進まない
- 各 Phase でテスト実行を必ず行う
- テストが失敗したまま次のテストを追加しない
- 各 Phase でレビューゲートが指示されている場合、それに従い勝手に次に進まないこと
