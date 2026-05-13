import { expect, test } from "@playwright/test";

test.describe("テーマ切替", () => {
  test("POST /theme は HX-Refresh: true と Set-Cookie で theme=dark を返す", async ({
    request,
  }) => {
    const res = await request.post("/theme");

    expect(res.status()).toBe(200);
    expect(res.headers()["hx-refresh"]).toBe("true");

    const setCookie = res.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("theme=dark");
  });
});
