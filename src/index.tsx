import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import { addMessage, listMessages } from "./db";
import {
  MessageForm,
  type MessageFormErrors,
  type MessageFormValues,
  MessageList,
  Page,
} from "./views";

const messageInputSchema = z.object({
  body: z.string().trim().min(1, "メッセージを入力してください"),
  username: z.string().trim().min(1, "ユーザー名を入力してください"),
  gender: z.enum(["男", "女"], { message: "性別を選択してください" }),
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

app.post(
  "/messages",
  zValidator("form", messageInputSchema, (result, c) => {
    if (!result.success) {
      const errors: MessageFormErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === "username" || field === "gender" || field === "body") {
          if (!errors[field]) errors[field] = issue.message;
        }
      }
      c.header("HX-Retarget", "#message-form");
      return c.html(<MessageForm values={result.data as MessageFormValues} errors={errors} />, 422);
    }
  }),
  async (c) => {
    const data = c.req.valid("form");
    await addMessage(data);
    const messages = await listMessages();
    return c.html(<MessageList messages={messages} />);
  },
);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
