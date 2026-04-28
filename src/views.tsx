import type { FC } from "hono/jsx";
import type { Message } from "./schema";

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

export const Layout: FC = ({ children }) => (
  <html lang="ja">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>devcamp</title>
      <link rel="stylesheet" href="/static/pico.min.css" />
      <script src="/static/htmx.min.js" defer />
    </head>
    <body>
      <main class="container">{children}</main>
    </body>
  </html>
);

export const MessageList: FC<{ messages: Message[] }> = ({ messages }) => (
  <section id="messages">
    {messages.length === 0 ? (
      <article>
        <small>まだメッセージはありません</small>
      </article>
    ) : (
      messages.map((m) => (
        <article>
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

export const Page: FC<{ messages: Message[] }> = ({ messages }) => (
  <Layout>
    <hgroup>
      <h1>メッセージ</h1>
      <p>devcamp</p>
    </hgroup>
    <form
      hx-post="/messages"
      hx-target="#messages"
      hx-swap="outerHTML"
      hx-on--after-request="this.reset()"
      role="group"
    >
      <input
        type="text"
        name="body"
        placeholder="メッセージを入力"
        required
        autocomplete="off"
      />
      <input type="submit" value="送信" />
    </form>
    <MessageList messages={messages} />
  </Layout>
);
