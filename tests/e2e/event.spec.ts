import { expect, test, type Page } from "@playwright/test";
import { truncateAll } from "./fixtures/db";

const DATETIME_VALUE = "2026-06-01T19:00";
const DATETIME_LABEL = "2026/06/01 (月) 19:00";

test.beforeEach(async () => {
  await truncateAll();
});

const createEvent = async (page: Page, title: string): Promise<void> => {
  await page.goto("/events/new");
  await page.getByLabel("イベント名").fill(title);
  await page.getByLabel("候補 1").fill(DATETIME_VALUE);
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/events\/[^/]+$/);
};

test.describe("イベント作成フロー（ハッピーパス）", () => {
  test("イベント作成: タイトルと候補日時を入力して送信すると詳細ページへ画面遷移し、タイトルと候補日時が表示される", async ({
    page,
  }) => {
    const title = "懇親会の日程調整";
    await page.goto("/events/new");

    await page.getByLabel("イベント名").fill(title);
    await page.getByLabel("候補 1").fill(DATETIME_VALUE);
    await page.getByRole("button", { name: "作成" }).click();

    await expect(page).toHaveURL(/\/events\/[^/]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: DATETIME_LABEL })).toBeVisible();
  });
});

test.describe("回答送信フロー（ハッピーパス・htmx）", () => {
  test("回答送信: 回答フォームを送信すると htmx で #responses が差し替わり、送信した参加者名と集計が表示され、フォームはリセットされる", async ({
    page,
  }) => {
    await createEvent(page, "ランチ会");
    await expect(page.getByText("まだ回答がありません")).toBeVisible();

    await page.getByLabel("名前").fill("田中");
    await page.getByRole("group", { name: DATETIME_LABEL }).getByLabel("○").check();
    await page.getByRole("button", { name: "回答する" }).click();

    await expect(page.getByRole("cell", { name: "田中", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: /○ 1.*△ 0.*× 0/ })).toBeVisible();
    await expect(page.getByText("まだ回答がありません")).toBeHidden();
    await expect(page.getByLabel("名前")).toHaveValue("");
  });

  test("回答編集: テーブル行の編集ボタンを押すと当該行が編集フォームに差し替わり、更新ボタンで再び集計表に戻り新しい値が反映される", async ({
    page,
  }) => {
    await createEvent(page, "勉強会");
    await page.getByLabel("名前").fill("田中");
    await page.getByRole("group", { name: DATETIME_LABEL }).getByLabel("○").check();
    await page.getByRole("button", { name: "回答する" }).click();
    await expect(page.getByRole("cell", { name: "田中", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "田中 の回答を編集" }).click();
    const editNameInput = page.locator("#responses").getByLabel("名前");
    await expect(editNameInput).toHaveValue("田中");
    await editNameInput.fill("佐藤");
    await page.getByRole("button", { name: "更新する" }).click();

    await expect(page.getByRole("cell", { name: "佐藤", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "田中", exact: true })).toBeHidden();
  });
});

test.describe("異常系", () => {
  test("存在しない event ID にアクセスすると 404 ページが表示され、「イベントが見つかりません」相当の見出しが描画される", async ({
    page,
  }) => {
    const response = await page.goto("/events/does-not-exist-id");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "イベントが見つかりません" })).toBeVisible();
  });

  test("イベント作成: タイトル未入力のまま送信ボタンを押すと、HTML5 required 制約でフォームが送信されず /events/new に留まる", async ({
    page,
  }) => {
    await page.goto("/events/new");
    await page.getByLabel("候補 1").fill(DATETIME_VALUE);

    await page.getByRole("button", { name: "作成" }).click();

    await expect(page).toHaveURL(/\/events\/new$/);
  });
});
