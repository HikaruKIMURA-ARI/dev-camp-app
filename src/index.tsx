import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { addMessage, listMessages } from "./db";
import { MessageList, Page } from "./views";

const app = new Hono();

app.get(
  "/static/htmx.min.js",
  serveStatic({ path: "./node_modules/htmx.org/dist/htmx.min.js" })
);
app.get(
  "/static/pico.min.css",
  serveStatic({ path: "./node_modules/@picocss/pico/css/pico.min.css" })
);

app.get("/", async (c) => {
  const messages = await listMessages();
  return c.html(<Page messages={messages} />);
});

app.post("/messages", async (c) => {
  const form = await c.req.parseBody();
  const body = String(form.body ?? "").trim();
  if (body) await addMessage(body);
  const messages = await listMessages();
  return c.html(<MessageList messages={messages} />);
});

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
