import { expect, test, type Page } from "@playwright/test";
import { truncateAll } from "./fixtures/db";

const DATETIME_VALUE = "2026-06-01T19:00";
const DATETIME_LABEL = "2026/06/01 (月) 19:00";

test.beforeEach(async () => {
  await truncateAll();
});

// 「設問を追加」ボタンを n 回押し、生成された各入力欄に対応する設問文を埋める。
// Alpine.js の `x-for` により、`aria-label="設問 i"` の textbox が動的に追加される。
const addCustomQuestions = async (page: Page, questions: string[]): Promise<void> => {
  for (let i = 0; i < questions.length; i += 1) {
    await page.getByRole("button", { name: "設問を追加" }).click();
  }
  for (let i = 0; i < questions.length; i += 1) {
    await page.getByLabel(`設問 ${i + 1}`, { exact: true }).fill(questions[i]!);
  }
};

test.describe("複数カスタム設問 + 回答コメント", () => {
  test("作成 → 「設問を追加」で動的増加 → 回答送信 → テーブルに設問列・コメント列が出る", async ({
    page,
  }) => {
    // Arrange: 新規作成画面を開き、初期状態の customQuestions[] が 0 件であることを確認
    await page.goto("/events/new");
    await expect(page.locator('input[name="customQuestions[]"]')).toHaveCount(0);

    await page.getByLabel("イベント名").fill("懇親会");
    await page.getByLabel("候補 1").fill(DATETIME_VALUE);

    // Act 1: 「設問を追加」ボタンで設問入力欄を 2 件追加し値を埋める
    //         （動的増加 UI と設問付き作成フローを同時に検証）
    await addCustomQuestions(page, ["アレルギーはありますか？", "参加形式は？"]);
    await expect(page.locator('input[name="customQuestions[]"]')).toHaveCount(2);
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page).toHaveURL(/\/events\/[^/]+$/);

    // Act 2: 回答フォームに名前・出欠・各設問への回答・コメントを入力して送信。
    //         旧仕様の `name="customAnswer"` 入力にも同じラベル文字列が紐付くため、
    //         `getByRole("textbox")` でアクセシビリティツリー上の可視 input を指す。
    await page.getByLabel("名前").fill("田中");
    await page.getByRole("group", { name: DATETIME_LABEL }).getByLabel("○").check();
    await page.getByRole("textbox", { name: "アレルギーはありますか？" }).fill("なし");
    await page.getByRole("textbox", { name: "参加形式は？" }).fill("現地");
    await page.getByLabel("コメント（任意）").fill("よろしくお願いします");
    await page.getByRole("button", { name: "回答する" }).click();

    // Assert: 設問列のヘッダ、コメント列のヘッダ、入力した設問回答・コメントが
    //         #responses テーブルに描画される
    await expect(
      page.getByRole("columnheader", { name: "アレルギーはありますか？" }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "参加形式は？" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "コメント" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "田中", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "なし", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "現地", exact: true })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "よろしくお願いします", exact: true }),
    ).toBeVisible();
  });

  test("21 件目の設問入力で 422 が返り、フォームに入力値が保持される", async ({ page }) => {
    // Arrange: タイトル・候補を入力した上で、設問を 21 件に増やし全てに値を埋める
    await page.goto("/events/new");
    await page.getByLabel("イベント名").fill("超大規模イベント");
    await page.getByLabel("候補 1").fill(DATETIME_VALUE);

    const questions = Array.from({ length: 21 }, (_, i) => `設問本文 ${i + 1}`);
    await addCustomQuestions(page, questions);

    // Act: そのまま送信。サーバ側 zod スキーマで `customQuestions.max(20)` に反するため
    //      422 でフォームが再描画される。
    const postResponse = page.waitForResponse(
      (res) => res.url().endsWith("/events") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "作成" }).click();
    const res = await postResponse;

    // Assert: HTTP 422 でフォーム本体が再描画される（POST 先 /events 上にフォームが残る）。
    //         サーバから返ったフォームに送信した入力値が保持される。
    expect(res.status()).toBe(422);
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByLabel("イベント名")).toHaveValue("超大規模イベント");
    // 21 件全てが保持されている（先頭・末尾を代表として確認）
    await expect(page.locator('input[name="customQuestions[]"]')).toHaveCount(21);
    await expect(page.getByLabel("設問 1", { exact: true })).toHaveValue("設問本文 1");
    await expect(page.getByLabel("設問 21", { exact: true })).toHaveValue("設問本文 21");
  });

  test("501 文字のコメントで 422 が返り、入力値が保持される", async ({ page }) => {
    // Arrange: イベントを作成し回答画面を開く
    await page.goto("/events/new");
    await page.getByLabel("イベント名").fill("コメント上限テスト");
    await page.getByLabel("候補 1").fill(DATETIME_VALUE);
    await page.getByRole("button", { name: "作成" }).click();
    await expect(page).toHaveURL(/\/events\/[^/]+$/);

    const longComment = "a".repeat(501);

    // Act: 必須項目を埋めた上で 501 文字のコメントを送信。
    //      `textarea[name="comment"]` は HTML 上 `maxlength=500` を持つため
    //      クライアント側で 500 文字に切り詰められる。ここでは「サーバ側 zod の
    //      `comment.max(500)` バリデーションが効く」ことを検証したいため、
    //      maxlength を実行時に外して 501 文字を実際に送信する。
    await page.getByLabel("名前").fill("田中");
    await page.getByRole("group", { name: DATETIME_LABEL }).getByLabel("○").check();
    await page.locator('textarea[name="comment"]').evaluate((el, value) => {
      el.removeAttribute("maxlength");
      (el as HTMLTextAreaElement).value = value;
    }, longComment);

    const postResponse = page.waitForResponse(
      (res) => /\/events\/[^/]+\/responses$/.test(res.url()) && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "回答する" }).click();
    const res = await postResponse;

    // Assert: HTTP 422 で差し戻され、サーバが返したフラグメント本文に入力したコメント値が
    //         そのまま含まれる（spec: ユーザの入力値がサーバ応答上で保持される）。
    //         なお htmx は 4xx を既定で swap 対象としないため画面上の DOM 反映は別関心事。
    expect(res.status()).toBe(422);
    const body = await res.text();
    expect(body).toContain(longComment);
  });
});
