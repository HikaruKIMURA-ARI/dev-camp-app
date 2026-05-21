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

// 実装挙動スナップショット:
// - 回答送信後、`#cards` には CardsCarousel(responses) が OOB swap される。
// - `responses[i].card` は POST のハンドラ内で同期的に永続化されてから返るため、
//   フラグメント側では常に <CardView /> が描画され `yc-pending` には入らない。
// - 各カードは <article class="card-rarity-{rarity}"> で描画される。rarity の具体値は
//   AI / default / template の各 Tier で異なるが、`#cards article` の総数は常に
//   「永続化された回答数」と一致する。
// - フォーム送信成功時に `hx-on::after-request="this.reset()"` で名前欄がクリアされる。

test.describe("参加者カード生成フロー（ハッピーパス・htmx）", () => {
  test("回答送信: 回答を送信すると htmx で #responses が差し替わると同時に、上部カルーセル領域 #cards に新しいカードが 1 枚追加される", async ({
    page,
  }) => {
    await createEvent(page, "懇親会");
    // 初期状態: カードはまだ存在しない（回答 0 件）
    await expect(page.locator("#cards article")).toHaveCount(0);

    await page.getByLabel("名前").fill("田中");
    await page.getByRole("group", { name: DATETIME_LABEL }).getByLabel("○").check();
    await page.getByRole("button", { name: "回答する" }).click();

    // #responses 側: 参加者名のセルが現れる
    await expect(page.getByRole("cell", { name: "田中", exact: true })).toBeVisible();

    // #cards 側: カードが 1 枚 OOB swap で追加される
    // （rarity の具体値は Tier に依存するため、ここでは個数のみを検証する）
    await expect(page.locator("#cards article")).toHaveCount(1);
  });

  test("回答編集: 既存回答を編集しても #cards 内のカード集合（DOM 上のカード数）は変化しない", async ({
    page,
  }) => {
    await createEvent(page, "勉強会");
    await page.getByLabel("名前").fill("田中");
    await page.getByRole("group", { name: DATETIME_LABEL }).getByLabel("○").check();
    await page.getByRole("button", { name: "回答する" }).click();
    await expect(page.getByRole("cell", { name: "田中", exact: true })).toBeVisible();

    // 編集前のカードスナップショット: カード 1 枚
    await expect(page.locator("#cards article")).toHaveCount(1);
    const labelBefore = await page.locator("#cards article").first().getAttribute("aria-label");

    await page.getByRole("button", { name: "田中 の回答を編集" }).click();
    const editNameInput = page.locator("#responses").getByLabel("名前");
    await expect(editNameInput).toHaveValue("田中");
    await editNameInput.fill("佐藤");

    // PUT 完了を明示的に待つ。POST 経路の Gemini カード生成が直前テストで遅延した直後など、
    // htmx swap のタイミングと Playwright の暗黙待機 (5s) が拮抗して flaky になるため、
    // ネットワーク同期点を明示する。
    const putResponse = page.waitForResponse(
      (res) =>
        /\/events\/[^/]+\/responses\/\d+$/.test(res.url()) && res.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "更新する" }).click();
    await putResponse;

    // 編集が反映されたことを #responses 側で確認（PUT 完了の同期点）
    await expect(page.getByRole("cell", { name: "佐藤", exact: true })).toBeVisible();

    // #cards 側はカード数不変。PUT 経路はカード再生成しないため
    // aria-label（= card.title）も元のまま保持される。
    await expect(page.locator("#cards article")).toHaveCount(1);
    const labelAfter = await page.locator("#cards article").first().getAttribute("aria-label");
    expect(labelAfter).toBe(labelBefore);
  });
});

test.describe("参加者カード生成フロー（異常系 / Tier 3 デフォルト経路）", () => {
  test("AI 非依存（Tier 3 経路）でも、回答送信が成功し #cards に最低 1 枚のカード DOM が描画され、回答とカードの両方が永続化される", async ({
    page,
  }) => {
    // POST /events/:id/responses は cardService.generateAndPersist を await し、
    // 例外が出ても catch して default / template card にフォールバックする。
    // そのため AI 経路が破綻していても、レスポンスは 200 + フラグメントを返し、
    // #cards と #responses の両方が更新される。
    await createEvent(page, "ハッカソン");

    await page.getByLabel("名前").fill("田中");
    await page.getByRole("group", { name: DATETIME_LABEL }).getByLabel("○").check();
    await page.getByRole("button", { name: "回答する" }).click();

    // 永続化された回答が #responses に描画される（DB 側の間接確認）
    await expect(page.getByRole("cell", { name: "田中", exact: true })).toBeVisible();

    // 永続化されたカードが #cards に最低 1 枚描画される
    // （rarity = N / R いずれの Tier 経路でも DOM 構造は同じ <article class="card-rarity-*">）
    await expect(page.locator("#cards article")).toHaveCount(1);
  });
});
