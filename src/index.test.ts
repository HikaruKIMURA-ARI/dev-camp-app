import { beforeEach, describe, expect, test } from "bun:test";

process.env.TURSO_DATABASE_URL = ":memory:";

const { db } = await import("./db");
const { messages } = await import("./schema");
const { default: server } = await import("./index");

const fetchApp = (path: string, init?: RequestInit) =>
  server.fetch(new Request(`http://localhost${path}`, init));

const postForm = (path: string, fields: Record<string, string>) =>
  fetchApp(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });

describe("src/index.tsx", () => {
  beforeEach(async () => {
    await db.delete(messages);
  });

  test("GET / はメッセージが無いとき空状態のページを返す", async () => {
    const res = await fetchApp("/");

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("devcamp");
    expect(html).toContain("まだメッセージはありません");
  });

  test("GET / は保存済みメッセージを新しい順に表示する", async () => {
    await db.insert(messages).values({ body: "古い" });
    await db.insert(messages).values({ body: "中間" });
    await db.insert(messages).values({ body: "新しい" });

    const res = await fetchApp("/");
    const html = await res.text();

    const idxNew = html.indexOf("新しい");
    const idxMid = html.indexOf("中間");
    const idxOld = html.indexOf("古い");
    expect(idxNew).toBeGreaterThan(-1);
    expect(idxNew).toBeLessThan(idxMid);
    expect(idxMid).toBeLessThan(idxOld);
    expect(html).not.toContain("まだメッセージはありません");
  });

  test("POST /messages は本文を保存し更新済みリストを返す", async () => {
    const res = await postForm("/messages", {
      username: "太郎",
      gender: "男",
      body: "こんにちは",
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("こんにちは");
    expect(html).toContain('id="messages"');
    expect(html).not.toContain("<html");

    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe("こんにちは");
    expect(rows[0]?.createdAt).toBeTruthy();
  });

  test("POST /messages は空白のみの本文を保存しない", async () => {
    const res = await postForm("/messages", {
      username: "太郎",
      gender: "男",
      body: "   ",
    });

    expect(res.status).toBe(422);

    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(0);
  });

  test("POST /messages は本文を trim してから保存する", async () => {
    await postForm("/messages", {
      username: "太郎",
      gender: "男",
      body: "  前後に空白  ",
    });

    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe("前後に空白");
  });

  test("POST /messages は body フィールドが無いとき 422 を返す", async () => {
    const res = await postForm("/messages", {
      username: "太郎",
      gender: "男",
    });

    expect(res.status).toBe(422);
    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(0);
  });

  test("複数回 POST すると全メッセージが新しい順で並ぶ", async () => {
    await postForm("/messages", { username: "太郎", gender: "男", body: "1通目" });
    await postForm("/messages", { username: "太郎", gender: "男", body: "2通目" });
    const res = await postForm("/messages", {
      username: "太郎",
      gender: "男",
      body: "3通目",
    });

    const html = await res.text();
    expect(html.indexOf("3通目")).toBeLessThan(html.indexOf("2通目"));
    expect(html.indexOf("2通目")).toBeLessThan(html.indexOf("1通目"));

    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(3);
  });

  test("GET / は最大 50 件までしか返さない", async () => {
    const values = Array.from({ length: 60 }, (_, i) => ({
      body: `msg-${String(i).padStart(2, "0")}`,
    }));
    await db.insert(messages).values(values);

    const res = await fetchApp("/");
    const html = await res.text();
    const matches = html.match(/msg-\d{2}/g) ?? [];
    expect(matches).toHaveLength(50);
    expect(html).toContain("msg-59");
    expect(html).not.toContain("msg-09");
  });

  test("未定義のルートは 404 を返す", async () => {
    const res = await fetchApp("/does-not-exist");
    expect(res.status).toBe(404);
  });

  // ---- ユーザー名・性別フィールド追加に伴うテスト計画 ----
  test("GET / はユーザー名入力フィールドを返す", async () => {
    const res = await fetchApp("/");
    const html = await res.text();

    expect(html).toContain('name="username"');
  });
  test("GET / は性別「男」を選択肢として表示する", async () => {
    const res = await fetchApp("/");
    const html = await res.text();

    expect(html).toContain('value="男"');
  });
  test("GET / は性別「女」を選択肢として表示する", async () => {
    const res = await fetchApp("/");
    const html = await res.text();

    expect(html).toContain('value="女"');
  });
  test("GET / は保存済みメッセージのユーザー名を表示する", async () => {
    await db.insert(messages).values({ body: "やあ", username: "太郎", gender: "男" });

    const res = await fetchApp("/");
    const html = await res.text();

    expect(html).toContain("太郎");
  });
  test("GET / は保存済みメッセージの性別を表示する", async () => {
    const before = (await (await fetchApp("/")).text()).split("女").length;

    await db.insert(messages).values({ body: "やあ", username: "太郎", gender: "女" });

    const after = (await (await fetchApp("/")).text()).split("女").length;

    expect(after).toBeGreaterThan(before);
  });
  test("POST /messages はユーザー名を trim してから保存する", async () => {
    await postForm("/messages", {
      username: "  太郎  ",
      gender: "男",
      body: "こんにちは",
    });

    const rows = await db.select().from(messages);
    expect(rows[0]?.username).toBe("太郎");
  });
  test("POST /messages はユーザー名が空のとき 422 を返し保存しない", async () => {
    const res = await postForm("/messages", {
      username: "",
      gender: "男",
      body: "こんにちは",
    });

    expect(res.status).toBe(422);
    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(0);
  });
  test("POST /messages はユーザー名が空白のみのとき 422 を返し保存しない", async () => {
    const res = await postForm("/messages", {
      username: "   ",
      gender: "男",
      body: "こんにちは",
    });

    expect(res.status).toBe(422);
    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(0);
  });
  test("POST /messages は性別が無いとき 422 を返し保存しない", async () => {
    const res = await postForm("/messages", {
      username: "太郎",
      body: "こんにちは",
    });

    expect(res.status).toBe(422);
    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(0);
  });
  test("POST /messages は性別が男・女以外のとき 422 を返し保存しない", async () => {
    const res = await postForm("/messages", {
      username: "太郎",
      gender: "その他",
      body: "こんにちは",
    });

    expect(res.status).toBe(422);
    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(0);
  });

  test("POST /messages はユーザー名・性別・本文を全て保存する", async () => {
    const res = await postForm("/messages", {
      username: "太郎",
      gender: "男",
      body: "こんにちは",
    });

    expect(res.status).toBe(200);

    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.username).toBe("太郎");
    expect(rows[0]?.gender).toBe("男");
    expect(rows[0]?.body).toBe("こんにちは");
  });

  // ---- @hono/zod-validator 移行に伴うバリデーション振る舞い ----
  describe("POST /messages バリデーション (zValidator 経由)", () => {
    const invalidInput = { username: "  ", gender: "男", body: "こんにちは" };

    test("有効な入力のとき 200 を返しメッセージ一覧を更新する", async () => {
      const res = await postForm("/messages", {
        username: "太郎",
        gender: "男",
        body: "こんにちは",
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("こんにちは");
    });

    test("無効な入力のとき 422 を返す", async () => {
      const res = await postForm("/messages", invalidInput);

      expect(res.status).toBe(422);
    });

    test("無効な入力のときメッセージを保存しない", async () => {
      await postForm("/messages", invalidInput);

      const rows = await db.select().from(messages);
      expect(rows).toHaveLength(0);
    });

    test("無効な入力のとき HX-Retarget ヘッダで再描画先をフォームに切り替える", async () => {
      const res = await postForm("/messages", invalidInput);

      expect(res.headers.get("HX-Retarget")).toBe("#message-form");
    });

    test("無効な入力のとき HTML ドキュメント全体ではなくフラグメントを返す", async () => {
      const res = await postForm("/messages", invalidInput);
      const html = await res.text();

      expect(html).not.toContain("<html");
    });

    test("無効な入力のときユーザーに見えるエラー文言を返す", async () => {
      const res = await postForm("/messages", invalidInput);
      const html = await res.text();

      expect(html).toContain("ユーザー名");
      expect(html).toMatch(/入力してください|必須|エラー/);
    });

    test("無効な入力のとき有効だった入力値がレスポンスに保持される", async () => {
      const res = await postForm("/messages", {
        username: "太郎",
        gender: "男",
        body: "  ",
      });
      const html = await res.text();

      expect(html).toContain("太郎");
    });
  });
});
