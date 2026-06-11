import { expect, test, type Page } from "@playwright/test";
import { truncateAll } from "./fixtures/db";

// 実装挙動スナップショット:
// - イベントページの #cards カルーセル内、カードごとに
//   <a class="card-pdf-link secondary" href="/events/:id/responses/:responseId/card"
//      target="_blank" rel="noopener">保存</a> が描画される。
// - リンクをクリックすると別タブ（popup）で印刷用フルページが開き、
//   .card-print-page 内に対象カード 1 枚（article）と
//   「PDF で保存」ボタン（.card-print-button / onclick="window.print()"）が表示される。
// - テーマ cookie（theme=dark）は別タブにも引き継がれ、印刷ページの
//   <html data-theme="dark"> に反映される。
// - 存在しない responseId 等では「カードが見つかりません」の 404 フルページが返る。
//
// 単体・結合（src/routes.test.ts）でカバー済みのため E2E では重複させない検証:
// - 印刷ページの 200 / Content-Type / フルページ構造 / カード 1 枚のみ / 7 属性表示
// - window.print() ボタンの存在（HTML 文字列レベル）
// - 404 境界 4 種（イベント不在・回答不在・別イベント所属・カード未生成）
// - カルーセルのリンク href / target="_blank" / 文言「保存」/ カード未生成時の非表示
// - テーマ cookie → data-theme の反映（Request ヘッダレベル）
//
// E2E はブラウザ駆動でしか壊れない振る舞いに絞る:
// 別タブ（popup）遷移、htmx テーマ切替 → HX-Refresh リロード → 別タブへの cookie 引き継ぎ、
// 404 ページのブラウザ表示。

const DATETIME_VALUE = "2026-06-01T19:00";
const DATETIME_LABEL = "2026/06/01 (月) 19:00";

const createEvent = async (page: Page, title: string): Promise<void> => {
  await page.goto("/events/new");
  await page.getByLabel("イベント名").fill(title);
  await page.getByLabel("候補 1").fill(DATETIME_VALUE);
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page).toHaveURL(/\/events\/[^/]+$/);
};

const submitResponse = async (page: Page, name: string): Promise<void> => {
  await page.getByLabel("名前").fill(name);
  await page.getByRole("group", { name: DATETIME_LABEL }).getByLabel("○").check();
  await page.getByRole("button", { name: "回答する" }).click();
  // カード生成（template/default Tier）と OOB swap の完了をカード DOM で同期する
  await expect(page.locator("#cards article")).toHaveCount(1);
};

// 機能要件: 参加者カードの保存（印刷用カードページ）
test.describe("参加者カードの保存（印刷用カードページ）", () => {
  // Arrange（共有前提） — 実 DB をテストごとに隔離する
  test.beforeEach(async () => {
    await truncateAll();
  });

  // 仕様を抽象度の高いユーザーストーリーで分類する
  test.describe("カルーセルの「保存」リンクから別タブで印刷用ページが開く", () => {
    test("回答を送信してカードが生成された後、カルーセルの「保存」リンクをクリックすると、別タブ（popup）で /events/:id/responses/:responseId/card が開き、.card-print-page 内にカード 1 枚（article）と「PDF で保存」ボタンが表示されること", async ({
      page,
    }) => {
      // Arrange（個別前提） — イベント作成 → 回答送信でカードを生成しておく
      await createEvent(page, "懇親会");
      await submitResponse(page, "田中");

      // Act — 「保存」リンクをクリックし、別タブ（popup）を捕捉する
      const popupPromise = page.waitForEvent("popup");
      await page.getByRole("link", { name: "保存" }).click();
      const popup = await popupPromise;

      // Assert — 別タブで印刷用ページが開き、カード 1 枚と印刷ボタンが描画される
      await expect(popup).toHaveURL(/\/events\/[^/]+\/responses\/\d+\/card$/);
      await expect(popup.locator(".card-print-page article")).toHaveCount(1);
      await expect(popup.getByRole("button", { name: "PDF で保存" })).toBeVisible();
    });
    // カードの 7 属性表示・カード 1 枚のみの絞り込みは結合テストで検証済み。
    // ここでは「別タブが開いて印刷ページが描画される」というブラウザ遷移のみを観測する
  });

  // 仕様を抽象度の高いユーザーストーリーで分類する
  test.describe("テーマ切替後も別タブの印刷ページにテーマが引き継がれる", () => {
    test("ヘッダのテーマ切替ボタン（hx-post=/theme → HX-Refresh リロード）でダークモードに切り替えた後、「保存」リンクから開いた別タブの印刷ページの <html> に data-theme=dark が付与されていること", async ({
      page,
    }) => {
      // Arrange（個別前提） — カード生成済みのイベントページを開いておく
      await createEvent(page, "勉強会");
      await submitResponse(page, "田中");

      // Act 1/2 — テーマ切替（hx-post=/theme → HX-Refresh による全画面リロード）
      await page.getByRole("button", { name: "テーマ切り替え" }).click();
      // リロード完了の同期点: 元ページの <html> に data-theme=dark が付く
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

      // Act 2/2 — 「保存」リンクから別タブで印刷ページを開く
      const popupPromise = page.waitForEvent("popup");
      await page.getByRole("link", { name: "保存" }).click();
      const popup = await popupPromise;

      // Assert — theme=dark cookie が別タブにも引き継がれ data-theme=dark で描画される
      await expect(popup.locator("html")).toHaveAttribute("data-theme", "dark");
    });
    // cookie ヘッダ → data-theme の反映自体は結合テストで検証済み。
    // ここでは「htmx 切替 → リロード → 別タブへの cookie 引き継ぎ」のブラウザフローのみを観測する
  });

  // 仕様を抽象度の高いユーザーストーリーで分類する
  test.describe("存在しないカードにアクセスしたとき 404 ページが表示される", () => {
    test("存在しない responseId の印刷用 URL にブラウザで直接アクセスすると、「カードが見つかりません」の 404 ページが表示されること", async ({
      page,
    }) => {
      // Arrange（個別前提） — 実在するイベントを作成し、その ID を URL から取り出す
      await createEvent(page, "ハッカソン");
      const eventUrl = page.url();

      // Act — 実在イベント配下の存在しない responseId に直接アクセスする
      await page.goto(`${eventUrl}/responses/999999/card`);

      // Assert — 404 フルページの文言がブラウザに表示される
      await expect(page.getByText("カードが見つかりません")).toBeVisible();
    });
    // 404 境界 4 種（イベント不在・別イベント所属・カード未生成）の網羅は結合テストで検証済み。
    // ここでは代表 1 ケースで 404 フルページがブラウザに表示されることだけを観測する
  });
});
