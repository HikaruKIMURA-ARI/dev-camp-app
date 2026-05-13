import type { Child, FC } from "hono/jsx";

export type Theme = "dark" | "light";

export const EventNewForm: FC = () => (
  <form method="post" action="/events">
    <label>
      イベント名
      <input type="text" name="title" required maxlength={200} />
    </label>

    <fieldset x-data="{ extras: [] }">
      <legend>候補日時</legend>

      <label>
        候補 1
        <input type="datetime-local" name="options" required />
      </label>

      <template x-for="(_, index) in extras" x-bind:key="index">
        <label>
          <span x-text="`候補 ${index + 2}`"></span>
          <div role="group">
            <input
              type="datetime-local"
              name="options"
              required
              x-bind:aria-label="`候補 ${index + 2}`"
            />
            <button
              type="button"
              class="secondary outline"
              aria-label="削除"
              x-on:click="extras.splice(index, 1)"
            >
              ✕
            </button>
          </div>
        </label>
      </template>

      <button type="button" class="secondary" x-on:click="extras.push('')">
        候補を追加
      </button>
    </fieldset>

    <label>
      カスタム設問（任意）
      <input type="text" name="customQuestion" maxlength={200} />
    </label>

    <button type="submit">作成</button>
  </form>
);

export const Layout: FC<{ theme?: Theme; children?: Child }> = ({ children, theme }) => (
  <html lang="ja" data-theme={theme}>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>devcamp</title>
      <link rel="stylesheet" href="/static/pico.min.css" />
      <script src="/static/htmx.min.js" defer />
      <script src="/static/alpine.min.js" defer />
    </head>
    <body>
      <main class="container">
        <button type="button" class="secondary outline" hx-post="/theme">
          テーマ切り替え
        </button>
        {children}
      </main>
      <script
        dangerouslySetInnerHTML={{
          __html:
            'document.body.addEventListener("htmx:afterSwap",(e)=>window.Alpine?.initTree(e.detail.target));',
        }}
      />
    </body>
  </html>
);
