import { serveStatic } from "hono/bun";
import app from "./app";

app.get(
  "/static/htmx.min.js",
  serveStatic({ path: "./public/static/htmx.min.js" })
);
app.get(
  "/static/alpine.min.js",
  serveStatic({ path: "./public/static/alpine.min.js" })
);
app.get(
  "/static/pico.min.css",
  serveStatic({ path: "./public/static/pico.min.css" })
);
app.get("/static/app.css", serveStatic({ path: "./public/static/app.css" }));
app.get(
  "/static/favicon.svg",
  serveStatic({ path: "./public/static/favicon.svg" })
);
app.get("/favicon.ico", serveStatic({ path: "./public/favicon.ico" }));

export default {
  port: Number(process.env.PORT ?? 8686),
  fetch: app.fetch,
};
