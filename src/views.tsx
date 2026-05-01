import type { Child, FC } from "hono/jsx";
import type { Message } from "./schema";

export type Theme = "dark" | "light";

const formatTime = (raw: string) => {
  const d = new Date(raw.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const Layout: FC<{ theme?: Theme; children?: Child }> = ({ children, theme }) => (
  <html lang="ja" data-theme={theme}>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>devcamp</title>
      <link rel="stylesheet" href="/static/pico.min.css" />
      <script src="/static/htmx.min.js" defer />
    </head>
    <body>
      <main class="container">
        <button type="button" class="secondary outline" hx-post="/theme">
          テーマ切り替え
        </button>
        {children}
      </main>
    </body>
  </html>
);

export const MessageList: FC<{ messages: Message[] }> = ({ messages }) => (
  <section id="messages" aria-live="polite">
    {messages.length === 0 ? (
      <article aria-label="メッセージなし">
        <p>
          <small>まだメッセージはありません。さあ書いてみましょう。</small>
        </p>
      </article>
    ) : (
      messages.map((m) => (
        <article>
          <header>
            <strong>{m.username || "(匿名)"}</strong>{" "}
            {m.gender ? <small>({m.gender})</small> : null}
          </header>
          <p>{m.body}</p>
          <footer>
            <small>
              <time datetime={m.createdAt}>{formatTime(m.createdAt)}</time>
            </small>
          </footer>
        </article>
      ))
    )}
  </section>
);

export type MessageFormValues = {
  username?: string;
  gender?: string;
  body?: string;
};
export type MessageFormErrors = {
  username?: string;
  gender?: string;
  body?: string;
};

export const MessageForm: FC<{
  values?: MessageFormValues;
  errors?: MessageFormErrors;
}> = ({ values = {}, errors = {} }) => (
  <form
    id="message-form"
    hx-post="/messages"
    hx-target="#messages"
    hx-swap="outerHTML"
    hx-on--after-request="this.reset()"
    aria-label="メッセージ投稿フォーム"
  >
    <label>
      ユーザー名
      <input
        type="text"
        name="username"
        placeholder="ユーザー名"
        required
        autocomplete="off"
        value={values.username ?? ""}
        aria-invalid={errors.username ? "true" : undefined}
      />
      {errors.username ? <small>{errors.username}</small> : null}
    </label>

    <fieldset>
      <legend>
        <small>性別</small>
      </legend>
      <label style="padding: 0.625rem 0;">
        <input type="radio" name="gender" value="男" required checked={values.gender === "男"} />男
      </label>
      <label style="padding: 0.625rem 0;">
        <input type="radio" name="gender" value="女" checked={values.gender === "女"} />女
      </label>
      {errors.gender ? <small>{errors.gender}</small> : null}
    </fieldset>

    <label>
      メッセージ
      <input
        type="text"
        name="body"
        placeholder="メッセージを入力"
        required
        autocomplete="off"
        value={values.body ?? ""}
        aria-invalid={errors.body ? "true" : undefined}
      />
      {errors.body ? <small>{errors.body}</small> : null}
    </label>

    <button type="submit">送信</button>
  </form>
);

export const Page: FC<{ messages: Message[]; theme?: Theme }> = ({ messages, theme }) => (
  <Layout theme={theme}>
    <hgroup>
      <h1>メッセージ</h1>
      <p>devcamp</p>
    </hgroup>
    <MessageForm />
    <MessageList messages={messages} />
  </Layout>
);
