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
    const res = await postForm("/messages", { body: "こんにちは" });

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
    const res = await postForm("/messages", { body: "   " });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("まだメッセージはありません");

    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(0);
  });

  test("POST /messages は本文を trim してから保存する", async () => {
    await postForm("/messages", { body: "  前後に空白  " });

    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe("前後に空白");
  });

  test("POST /messages は body フィールドが無くてもクラッシュしない", async () => {
    const res = await postForm("/messages", {});

    expect(res.status).toBe(200);
    const rows = await db.select().from(messages);
    expect(rows).toHaveLength(0);
  });

  test("複数回 POST すると全メッセージが新しい順で並ぶ", async () => {
    await postForm("/messages", { body: "1通目" });
    await postForm("/messages", { body: "2通目" });
    const res = await postForm("/messages", { body: "3通目" });

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
});
