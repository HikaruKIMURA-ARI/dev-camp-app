import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import { addMessage, listMessages } from "./db";
import { MessageList, Page } from "./views";

const messageInputSchema = z.object({
  body: z.string().trim().min(1),
  username: z.string().trim().min(1),
  gender: z.enum(["男", "女"]),
});

const app = new Hono();

app.get("/static/htmx.min.js", serveStatic({ path: "./node_modules/htmx.org/dist/htmx.min.js" }));
app.get(
  "/static/pico.min.css",
  serveStatic({ path: "./node_modules/@picocss/pico/css/pico.min.css" }),
);

app.get("/", async (c) => {
  const messages = await listMessages();
  return c.html(<Page messages={messages} />);
});

app.post("/messages", async (c) => {
  const form = await c.req.parseBody();
  const parsed = messageInputSchema.safeParse(form);
  if (parsed.success) await addMessage(parsed.data);
  const messages = await listMessages();
  return c.html(<MessageList messages={messages} />);
});

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
