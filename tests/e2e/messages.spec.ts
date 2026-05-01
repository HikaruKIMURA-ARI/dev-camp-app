import { expect, test } from "@playwright/test";
import { truncateAll } from "./fixtures/db";

test.describe("メッセージ投稿フロー", () => {
  test.beforeEach(async () => {
    await truncateAll();
  });

  test("ユーザー名・性別・本文を入力すると一覧に新着が現れること", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("ユーザー名", { exact: true }).fill("太郎");
    await page.getByLabel("男", { exact: true }).check();
    await page.getByLabel("メッセージ", { exact: true }).fill("はじめまして");
    await page.getByRole("button", { name: "送信" }).click();

    await expect(page.locator("#messages")).toContainText("はじめまして");
    await expect(page.locator("#messages")).toContainText("太郎");
  });

  test("必須項目を空白だけで送信したとき POST /messages が 422 を返し、一覧に新着が増えないこと", async ({
    page,
  }) => {
    await page.goto("/");

    // HTML5 required を満たしつつサーバ側 z.string().trim().min(1) を失敗させるため
    // 全必須項目を空白文字で埋めて送信する（trim 後に空文字となり 422 が返る）。
    // htmx は既定で非 2xx レスポンスをスワップしないため、サーバが返すエラー版
    // <MessageForm/> は DOM に反映されない。実観測できるのは「ネットワーク上の 422」と
    // 「#messages が空状態のまま」「新規 article が増えない」という事実のみ。
    await page.getByLabel("ユーザー名", { exact: true }).fill("   ");
    await page.getByLabel("男", { exact: true }).check();
    await page.getByLabel("メッセージ", { exact: true }).fill("   ");

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().endsWith("/messages") && resp.request().method() === "POST",
    );
    await page.getByRole("button", { name: "送信" }).click();
    const response = await responsePromise;

    expect(response.status()).toBe(422);
    await expect(
      page.locator("#messages").getByRole("article", { name: "メッセージなし" }),
    ).toContainText("まだメッセージはありません。さあ書いてみましょう。");
    await expect(page.locator("#messages article")).toHaveCount(1);
  });
});
