import { expect, test } from "@playwright/test";
import { truncateAll } from "./fixtures/db";

test.describe("初期表示", () => {
  test.beforeEach(async () => {
    await truncateAll();
  });

  test("メッセージが 0 件のとき #messages 内に空状態 article が表示されること", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.locator("#messages").getByRole("article", { name: "メッセージなし" }),
    ).toContainText("まだメッセージはありません。さあ書いてみましょう。");
  });
});
