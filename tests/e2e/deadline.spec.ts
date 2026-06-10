import { expect, test, type Page } from "@playwright/test";
import { truncateAll } from "./fixtures/db";

/*
 * 回答締め切り（deadline）機能の E2E（異常系のみ）。
 *
 * 正常系は新規テストを追加せず、tests/e2e/event.spec.ts の
 * イベント作成ハッピーパスに deadline の入力・表示確認を混ぜ込み済み
 * （テストピラミッドで E2E は最少のため）。
 *
 * 過去締め切りイベントの arrange は UI 経由で行う
 * （datetime-local は過去日時を入力できるため /events/new から作成する。DB seed 不要）。
 */

const OPTION_DATETIME_VALUE = "2026-06-01T19:00";
const OPTION_DATETIME_LABEL = "2026/06/01 (月) 19:00";
const PAST_DEADLINE_VALUE = "2020-01-01T00:00";

test.beforeEach(async () => {
  await truncateAll();
});

// /events/new から過去の締め切り付きイベントを UI 経由で作成し、詳細ページへ遷移する
const createPastDeadlineEvent = async (page: Page, title: string): Promise<void> => {
  await page.goto("/events/new");
  await page.getByLabel("イベント名").fill(title);
  await page.getByLabel("候補 1").fill(OPTION_DATETIME_VALUE);
  await page.getByLabel("回答締め切り（任意）").fill(PAST_DEADLINE_VALUE);
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/events\/[^/]+$/);
};

test.describe("回答締め切り（異常系）", () => {
  // 結合テスト（src/routes.test.ts）は disabled「属性の付与」を HTML 文字列で検証済み。
  // ここでは実ブラウザで回答フォームの各コントロールが操作不能であることを観測する。
  test("締め切りが過去のイベントの詳細ページを開いたとき、回答フォームの全入力（名前・候補日時 radio・コメント）と回答ボタンが disabled で操作できないこと", async ({
    page,
  }) => {
    await createPastDeadlineEvent(page, "締め切り済みイベント");

    const optionGroup = page.getByRole("group", { name: OPTION_DATETIME_LABEL });

    await expect(page.getByLabel("名前")).toBeDisabled();
    await expect(optionGroup.getByLabel("○")).toBeDisabled();
    await expect(optionGroup.getByLabel("△")).toBeDisabled();
    await expect(optionGroup.getByLabel("×")).toBeDisabled();
    await expect(page.getByLabel("コメント（任意）")).toBeDisabled();
    await expect(page.getByRole("button", { name: "回答する" })).toBeDisabled();
  });

  // 結合テスト（routes.test.ts）は app.request で 422 を検証済み。
  // ここでは実ブラウザ + 実サーバで「disabled を回避した直接 POST も拒否され、
  // リロード後も回答が増えない」という最終防衛線を画面表示まで通して観測する。
  test("締め切りが過去のイベントへ disabled を回避して回答 POST を直接送ったとき、サーバが 422 で拒否しリロード後も回答が表示されないこと", async ({
    page,
  }) => {
    await createPastDeadlineEvent(page, "締め切り済みイベント");

    const status = await page.evaluate(async () => {
      const body = new URLSearchParams();
      body.set("name", "回避太郎");
      const res = await fetch(window.location.pathname + "/responses", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      return res.status;
    });

    expect(status).toBe(422);
    await page.reload();
    await expect(page.getByText("まだ回答がありません")).toBeVisible();
  });
});
