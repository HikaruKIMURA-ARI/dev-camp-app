import { expect, test } from "@playwright/test";
import { truncateAll } from "./fixtures/db";

test.describe("ダークモード切替", () => {
  test.beforeEach(async () => {
    await truncateAll();
  });

  test("テーマ切り替えボタンを押すと HX-Refresh 後に html[data-theme] が dark になること", async ({
    page,
  }) => {
    await page.goto("/");

    // POST /theme は HX-Refresh: true を返し、htmx がフルリロードを行う。
    // リロード後の html[data-theme] が dark に切り替わったことを検証する。
    await page.getByRole("button", { name: "テーマ切り替え" }).click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("ダークモードに切り替えた後でリロードしても data-theme=dark が維持されること", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "テーマ切り替え" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
