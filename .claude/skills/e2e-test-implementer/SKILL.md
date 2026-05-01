---
name: e2e-test-implementer
description: E2E Phase 2 — シナリオを実装し headless で実行する詳細ルール、命名規則、AAA、セレクタ方針
trigger: E2E 実装|e2e implement|Phase2 e2e
---

# E2E Phase 2: テスト実装・実行

`e2e-test-workflow` skill の **Phase 2** に対応する詳細ルール集。`e2e-test-implementer` agent はこの skill を **必ず READ** して従う。

ルートの `CLAUDE.md`（`## E2E テスト規約` 含む）と `.claude/rules/testing/test-philosophy.md` のテスト思想に必ず従うこと。

## 手順

1. Phase 1 で列挙された `test.skip()` を **1 つずつ** 実装に置き換える
2. **アサーションは現在の実装挙動から逆算して書く**。Playwright MCP（`mcp__playwright__browser_navigate` / `browser_snapshot` / `browser_network_requests` 等）でローカルブラウザの実観測を先に行い、観測された事実（DOM 状態・レスポンスステータス・cookie 等）を assert する
3. `bun run test:e2e` または `bunx playwright test --grep "<シナリオ名>"` で個別実行し、green を確認する
4. 「こうあるべき」で書いて落ちた場合、**まず実装挙動を再観察し、テスト側を実装に合わせて書き直す**（src/\*\* は触らない。仕様の正しさは TDD で既に担保されている前提）
5. 全シナリオを実装したら `bun run test:e2e` で一括 green を確認する
6. 完了後、必ずユーザーのレビューゲートを挟む

## テスト命名規則

- `test.describe`: 対象の機能名（例: `"メッセージ投稿フロー"`）
- `test`: `〜のとき〜であること` を **日本語** で表現し、生きたドキュメントにする
- 実装の詳細ではなく、ユーザー目線の振る舞いをケース名にする

## AAA パターン（必須）

```ts
import { expect, test } from "@playwright/test";
import { truncateAll } from "./fixtures/db";

test.describe("メッセージ投稿フロー", () => {
  // Arrange（準備） — 共有前提は test.beforeEach に置く
  test.beforeEach(async () => {
    await truncateAll();
  });

  test("ユーザー名・性別・本文を入力すると一覧に新着が現れること", async ({ page }) => {
    // Arrange（個別前提） — test 内の最初に置く
    await page.goto("/");

    // Act（実行） — 1 つの振る舞いに対する操作
    await page.getByLabel("ユーザー名", { exact: true }).fill("太郎");
    await page.getByLabel("男", { exact: true }).check();
    await page.getByLabel("メッセージ", { exact: true }).fill("はじめまして");
    await page.getByRole("button", { name: "送信" }).click();

    // Assert（検証） — 事後条件
    await expect(page.locator("#messages")).toContainText("はじめまして");
  });
});
```

## セレクタ方針

- **優先順**: `getByRole` > `getByLabel` > `getByText` > `locator('#id')` > CSS セレクタ
- ラベルが他の aria-label と部分一致しうる場合は `{ exact: true }` を必ず付ける（`メッセージ` は `メッセージ投稿フォーム` / `メッセージなし` と衝突する）
- 実装詳細クラス（pico の生成クラス・hash されたクラス等）に依存しない（リファクタ耐性）

## 実体・モック方針

- 実 DB（`test-e2e.db`）+ 実サーバ（`webServer` で自動起動）+ 実ブラウザ（headless Chromium）。全て実体を使う
- `beforeEach` で `truncateAll()` を呼びテスト間の DB 状態を隔離する（共有依存は順次実行 + truncate で隔離する古典学派の方針）
- 現在のアプリにはプロセス外依存（auth・外部 API）が無いのでモックなし

## 禁止事項

- `test.only` を残したままにすること（CI で `forbidOnly: true` により失敗する）
- 固定スリープ（`page.waitForTimeout(...)`）の使用 — `expect(...).toHaveText(...)` 等の暗黙待機、または `page.waitForResponse` / `page.waitForLoadState` を使う
- セレクタを CSS クラスや実装詳細に依存させること
- 実装ファイル（`src/**`）の編集 — テストが落ちた場合は **テスト側を実装挙動に合わせる**。仕様の正しさは TDD で担保済みの前提で、E2E は実装挙動のスナップショットとして書く。仕様自体を直したい場合は `tdd-workflow` skill に戻り別 PR で行う
- ユニットテスト（`src/**/*.test.ts`）の編集
- `playwright.config.ts` の構造変更（dev チームの判断で別 PR）
- `any` 型の使用
- 1 つのテストで複数の振る舞いを検証すること

## 出力形式

- spec ファイルのパス
- `bun run test:e2e` の実行結果（全 green であること）
- 実装したシナリオの一覧と各々が検証する振る舞い
