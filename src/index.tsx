import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getCookie, setCookie } from "hono/cookie";
import "./db";
import { defaultCardGenerator } from "./gemini";
import routes from "./routes";
import type { Theme } from "./views";

const THEME_COOKIE = "theme";

if (process.env.GEMINI_VERIFY_ON_BOOT === "1") {
  defaultCardGenerator
    .verifyConnectivity()
    .then((result) => {
      if (result.ok) {
        console.info("[gemini] verify on boot: ok");
      } else {
        console.warn(`[gemini] verify on boot: failed (${result.reason})`);
      }
    })
    .catch((err: unknown) => {
      console.warn("[gemini] verify on boot: unexpected error", err);
    });
}

const app = new Hono();

app.route("/", routes);

app.get("/static/htmx.min.js", serveStatic({ path: "./node_modules/htmx.org/dist/htmx.min.js" }));
app.get("/static/alpine.min.js", serveStatic({ path: "./node_modules/alpinejs/dist/cdn.min.js" }));
app.get(
  "/static/pico.min.css",
  serveStatic({ path: "./node_modules/@picocss/pico/css/pico.min.css" }),
);
app.get("/static/app.css", serveStatic({ path: "./public/app.css" }));
app.get("/static/favicon.svg", serveStatic({ path: "./public/favicon.svg" }));
app.get("/favicon.ico", serveStatic({ path: "./public/favicon.svg" }));

app.post("/theme", (c) => {
  const next: Theme = getCookie(c, THEME_COOKIE) === "dark" ? "light" : "dark";
  setCookie(c, THEME_COOKIE, next);
  c.header("HX-Refresh", "true");
  return c.body(null);
});

export default {
  port: Number(process.env.PORT ?? 8686),
  fetch: app.fetch,
};
