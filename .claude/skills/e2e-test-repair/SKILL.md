---
name: e2e-test-repair
description: 既存 E2E が落ちたときの修復ワークフロー。実装変更・フラ気・真バグを分類し、(a) のみテスト側を実装挙動に合わせて書き直す
trigger: e2e 修復|e2e 直す|e2e 壊れた|e2e repair|e2e fix|broken e2e|test:e2e fail|playwright fail
---

# E2E テスト修復ワークフロー

既存の E2E テストが落ちたときに **テスト側を実装挙動に合わせて修復** するワークフロー。新規シナリオ追加は `e2e-test-workflow` skill の責務であり、本 skill では扱わない。

ルートの `CLAUDE.md`（特に `## E2E テスト規約`）と `.claude/rules/testing/test-philosophy.md`、および `.claude/skills/e2e-test-workflow/SKILL.md` の **「実装挙動スナップショット型」** 方針を **必ず READ** すること。

## 共通原則

- **テスト側を実装に合わせる**: E2E は実装挙動のスナップショット。落ちた原因が「src/** 変更で観測対象が変わった」なら **テスト側を直す\*\*。仕様の正しさは TDD で担保済み
- **`src/**`は触らない**: 真バグ疑いの場合でも E2E 修復エージェントは src を編集せず、ユーザに`tdd-workflow` への切替を判断させる
- **原因分類が肝**: 機械的に「実装に合わせる」と真バグを見逃す。修復着手前に必ず原因を 3 分類する
- **既存シナリオ修復のみ**: シナリオ追加・削除は `e2e-test-workflow` の Phase 1 / 2 の責務

## 起動方法（必須）

`Agent` ツールで `subagent_type: "e2e-test-repairer"` のサブエージェントを起動する。

```
Agent({
  description: "E2E 修復",
  subagent_type: "e2e-test-repairer",
  prompt: "<本 skill と e2e-test-workflow skill を Read させ、失敗ログを渡す>"
})
```

ルール:

- メインエージェントが直接修復作業をすることは禁止（agent の権限境界が反映されないため）
- `general-purpose` での代替も禁止
- メインエージェントは事前に `bun run test:e2e` を実行してログを採取し、失敗テスト名と失敗箇所をプロンプトに含めて起動する

## 手順

### 1. 失敗の再現

- `bun run test:e2e` を実行して失敗ログを採取する
- 失敗が `bunx playwright test --grep "<シナリオ名>"` で再現するか、それとも複数テストを連続実行したときだけ落ちるかを確認する
- 後者の場合は **テスト隔離不全**（`truncateAll` 漏れ・テスト間の状態漏洩）を最初に疑う

### 2. 原因分類（必須・修復着手前）

失敗の根本原因を必ず以下の 3 つに分類する。

#### (a) 実装挙動の変化（修復対象）

- `git status` / `git log --oneline -n 20` / `git diff HEAD -- src/` で **直近の src 変更** を確認
- 変更箇所と失敗テストのアサーション対象（DOM・レスポンス・cookie 等）の関連を特定
- Playwright MCP（`mcp__playwright__browser_navigate` / `browser_snapshot` / `browser_network_requests`）でローカルブラウザの **現在の挙動** を観察
- 「src を変えた結果、テストが期待していた DOM 構造／レスポンス／cookie が変わった」と特定できれば (a)

#### (b) フラ気（修復対象だが慎重に）

- 同じテストを 3-5 回連続実行して再現率を測る（`bunx playwright test --grep "<名>" --repeat-each=5`）
- 再現率 100% でないなら (b) 候補。`waitForTimeout`・タイミング依存・ネットワーク待ち不足が典型
- 修復は **暗黙待機の強化**（`expect(...).toHaveText` / `waitForResponse`）に限定する。アサーションそのものの意味は変えない

#### (c) 真バグ疑い（修復対象外）

- src に変更がない or 変更箇所と無関係 / 仕様意図と観測挙動が乖離 / ユニット/結合テストでも失敗が出ている、のいずれかに該当すれば (c)
- E2E 修復エージェントは **テストを書き換えず、ユーザに報告して終了**。`tdd-workflow` への切替を促す

### 3. 修復実施

#### (a) の場合

- Playwright MCP で観測された **現実の挙動** を assert に落とし込む（`e2e-test-workflow` skill の「実装挙動スナップショット型」に従う）
- アサーションだけでなく **シナリオ名** も新しい挙動を表すよう書き直す（「〜のとき〜であること」の `〜` を観測事実に合わせる）
- 元のシナリオが意味を失っているなら削除候補としてユーザに提示（独断削除は禁止）

#### (b) の場合

- `expect(locator).toBeVisible({ timeout: 5000 })` のような暗黙待機 / `page.waitForResponse` / `page.waitForLoadState("networkidle")` で安定化
- `waitForTimeout(...)` の固定スリープ追加は禁止（`e2e-test-implementer` skill の禁止事項を踏襲）
- 修復後 `--repeat-each=5` で再現率 0/5 を確認

#### (c) の場合

- 修復に着手せず、以下を含めて **ユーザに報告**:
  - 失敗テスト名・失敗箇所
  - src 変更履歴（`git log` の関連コミット）
  - 観測挙動と仕様意図の乖離点
  - 推奨アクション: `tdd-workflow` skill への切替（src 修正 → テスト追加）

### 4. 緑化確認

- `bun run test:e2e` で **全件 green** を確認（修復対象だけでなく他のテストにも影響がないか）
- ユニットテストも `bun test` で確認（src は触っていないが、テスト変更で巻き込み事故がないことの確認）

### 5. レビューゲート

- 修復後、ユーザーのレビューゲートを必ず挟む
- 報告には「どのテストを」「どの分類で」「何を assert に変えたか」「git diff 上の元との差分要約」を含める

## トリガーと連携（メインエージェント必須挙動）

メインエージェントは以下のいずれかを観測したら **必ず** `e2e-test-repairer` agent を `Agent` ツールで起動する。判断を保留したり、メインエージェントが直接 e2e テストを書き換えたりすることは禁止。

### 起動条件（いずれか 1 つでも該当したら MUST）

1. **明示起動**: ユーザが「e2e 修復して」「e2e 直して」「e2e 壊れた」「playwright が落ちた」等の意図を示したとき
2. **PostToolUse hook での失敗検出**: `.claude/settings.json` の PostToolUse hook（`Write|Edit|MultiEdit` 後の `bun typecheck && bun test && bun test:e2e && bun lint && bun fmt`）の出力に **Playwright の失敗ログ**（`X failed`、`Error:`、`expect(...).toXxx`、`tests/e2e/**/*.spec.ts:`、`Timeout` 等）が含まれたとき
3. **任意の `bun run test:e2e` / `bunx playwright test ...` の non-zero 終了** をメインエージェントが観測したとき

### 起動手順（全条件で共通）

1. メインエージェントは失敗ログ全文と、直前の `Write|Edit|MultiEdit` で変更した `src/**` のパス一覧を控える
2. 下記の形で `Agent` ツールを呼ぶ:

   ```
   Agent({
     description: "E2E 修復",
     subagent_type: "e2e-test-repairer",
     prompt: `
       .claude/skills/e2e-test-repair/SKILL.md と
       .claude/skills/e2e-test-workflow/SKILL.md を必ず Read してから着手すること。
       失敗ログ:
       <bun run test:e2e の出力全文>
       直前の src 変更:
       <変更ファイルパス一覧と git diff の要約>
     `
   })
   ```

3. サブエージェントが返した分類（(a)/(b)/(c)）と修復差分をメインエージェントがレビューし、ユーザに報告
4. (c) 真バグ疑いと判定された場合、メインエージェントは `e2e-test-repairer` を再起動せず、ユーザに `tdd-workflow` への切替を提案する

### 禁止挙動

- メインエージェントが skill だけ読んで直接 e2e テストを書き換えること（agent の権限境界が反映されない）
- `general-purpose` agent での代替起動
- hook で失敗を観測したのに「次のユーザ発話を待つ」として起動を保留すること（修復は実装直後に走らせるのが価値）
- 失敗テストを `test.skip()` 化して見えなくすること（隠蔽禁止）

### 起動経路を問わない原則

明示起動でも hook 由来でも、必ず本 skill の手順 1-5（再現 → 分類 → 修復 → 緑化 → レビューゲート）を通す。hook 経由だからといって分類をスキップして機械的に assert を書き換えてはいけない。

## 禁止事項

- 実装ファイル（`src/**`）の編集 — (c) と判定した場合でも src は触らない
- ユニット・結合テスト（`src/**/*.test.ts`）の編集
- `playwright.config.ts` の構造変更
- 原因分類をスキップして「機械的にアサーションを実装挙動に合わせる」こと（真バグを見逃す）
- 失敗テストの削除や `test.skip()` 化（隠蔽は禁止）
- 固定スリープ（`page.waitForTimeout(...)`）の追加
- 1 回の起動で **複数の失敗を一気に書き換えること** は許可するが、各失敗ごとに分類を明記する

## 出力形式

メインエージェントへの報告は以下を含める:

- 対象失敗テスト名と分類（(a)/(b)/(c)）
- (a)(b) の場合: 修復前後のアサーション差分・シナリオ名変更の有無
- (c) の場合: 推奨アクションと根拠（git log 該当コミット、観測ログ）
- `bun run test:e2e` の最終結果（全 green であること）
- 触ったファイル一覧
