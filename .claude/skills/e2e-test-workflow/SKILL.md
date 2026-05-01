---
name: e2e-test-workflow
description: E2E テスト自動化ワークフロー（機能完成後にハッピーパスと異常系を後追いで追加）
trigger: E2E|e2e|エンドツーエンド|ハッピーパス|happy path|シナリオテスト
---

# E2E テストワークフロー

このファイルは E2E テストワークフロー全体の **オーケストレーション** だけを担う。各 Phase の詳細ルール・命名規則・AAA・禁止事項・出力形式は、対応する Phase 別 skill を **必ず READ** すること。

ルートの `CLAUDE.md`（`## E2E テスト規約` 含む）と `.claude/rules/testing/test-philosophy.md` を **必ず READ** し、テスト思想に従うこと。

## 共通原則

- **後追い E2E**: 実装が完成した機能に対して、ハッピーパス 2-3 + 異常系 1-2 件のみを追加する（テストピラミッドで E2E は最少）
- **実装挙動スナップショット型**: テストファーストは `tdd-workflow` で完結している。E2E では「期待する仕様」ではなく「実装が実際にブラウザで示す挙動」を観測してそのまま検証する。実装が直感に反していても E2E でそれを矯正しない（仕様の正しさは TDD 側で既に担保されている前提）。仕様を直したい場合は `tdd-workflow` に戻り別 PR で行う
- **実体主義**: 実 DB（`test-e2e.db`）+ 実サーバ（`playwright.config.ts` の `webServer`）+ 実ブラウザで全て実体を使う（古典学派の延長）
- **headless 固定**: CI でも同じ挙動になるよう headless で実行する。デバッグ時のみ `--headed` / `--ui` を使う
- **AAA パターン**: Arrange は `test.beforeEach` / 上位 `test.describe`、Act/Assert は `test()` 内に配置
- **1 テスト 1 振る舞い**: ハッピーパスでも複数アサーションを 1 シナリオに混ぜない

## Phase マッピング

| Phase                     | `subagent_type`        | エージェント定義                         | 詳細ルール skill                               |
| ------------------------- | ---------------------- | ---------------------------------------- | ---------------------------------------------- |
| Phase 1: シナリオ列挙     | `e2e-scenario-writer`  | `.claude/agents/e2e-scenario-writer.md`  | `.claude/skills/e2e-scenario-writer/SKILL.md`  |
| Phase 2: テスト実装・実行 | `e2e-test-implementer` | `.claude/agents/e2e-test-implementer.md` | `.claude/skills/e2e-test-implementer/SKILL.md` |

## 起動方法（必須）

各 Phase は **必ず `Agent` ツールで対応するサブエージェントを起動** する。メインエージェントが SKILL.md を読んで Phase 作業を直接実行することは禁止（プロジェクト agent の `CLAUDE.md` で定義された権限境界が無視され、ワークフロー定義から外れるため）。

呼び出し例（Phase 1 の場合）:

```
Agent({
  description: "Phase 1: E2E シナリオ列挙",
  subagent_type: "e2e-scenario-writer",
  prompt: "<Phase 1 への指示。Phase マッピング表の SKILL.md と本ワークフローを必ず Read させる>"
})
```

ルール:

- `subagent_type` には Phase マッピング表の値（`e2e-scenario-writer` 等）を **そのまま** 渡す
- `general-purpose` での代替は **禁止**（プロジェクト agent の権限境界が反映されないため）
- 速度を理由にスキップしない（速さよりワークフロー準拠を優先）
- サブエージェントから返ってきた変更内容は、メインエージェントがレビュー・テスト実行・ユーザへの報告で再確認する

## 進行ルール

1. **Phase 1** — `subagent_type: "e2e-scenario-writer"` を起動し、対象機能のシナリオ（ハッピー 2-3 + 異常 1-2）を `test.skip()` で列挙させる。完了後、ユーザーのレビューゲートを挟む。勝手に Phase 2 へ進まない。
2. **Phase 2** — `subagent_type: "e2e-test-implementer"` を起動し、`test.skip()` を実装に置き換え、`bun run test:e2e` でパスを確認する。完了後、ユーザーのレビューゲートを挟む。

## 制約（全 Phase 共通）

- 各 Phase は `Agent` ツールで対応する `subagent_type` のサブエージェントを起動すること。`general-purpose` での代替やメインエージェントによる直接実行を禁止
- レビュー時はどのシナリオが対象かを明示すること
- Phase N を完了するまで Phase N+1 に進まない
- E2E 追加で本番コード（`src/**`）を変更しない（仕様変更が必要な場合は `tdd-workflow` skill に戻る）
- 各 Phase でテスト実行を必ず行う（Phase 1 は `test.skip` のため pass、Phase 2 は実装後に green）
- `bun test`（ユニット）と `bun run test:e2e`（E2E）の両方が緑であることを最後に確認する
- 各 Phase でレビューゲートが指示されている場合、それに従い勝手に次に進まないこと
