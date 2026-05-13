import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { getCookie, setCookie } from "hono/cookie";
import "./db";
import routes from "./routes";
import type { Theme } from "./views";

const THEME_COOKIE = "theme";

const app = new Hono();

app.route("/", routes);

app.get("/static/htmx.min.js", serveStatic({ path: "./node_modules/htmx.org/dist/htmx.min.js" }));
app.get("/static/alpine.min.js", serveStatic({ path: "./node_modules/alpinejs/dist/cdn.min.js" }));
app.get(
  "/static/pico.min.css",
  serveStatic({ path: "./node_modules/@picocss/pico/css/pico.min.css" }),
);

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
