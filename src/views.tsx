import type { Child, FC } from "hono/jsx";
import type { Event, EventOption, EventResponse } from "./schema";

export type Theme = "dark" | "light";

export type Answer = "○" | "△" | "×";

export type ResponseWithAnswers = EventResponse & { answers: Record<string, Answer> };

export type Aggregates = Record<string, { circle: number; triangle: number; cross: number }>;

export type EventNewFormValues = {
  title?: string;
  options?: string[];
  customQuestion?: string;
};

export type EventNewFormErrors = string[];

export const EventNewForm: FC<{ values?: EventNewFormValues; errors?: EventNewFormErrors }> = ({
  values,
  errors,
}) => {
  const titleValue = values?.title ?? "";
  const customQuestionValue = values?.customQuestion ?? "";
  const [firstOption = "", ...extraOptions] = values?.options ?? [];

  return (
    <form method="post" action="/events">
      {errors && errors.length > 0 ? (
        <ul role="alert">
          {errors.map((message) => (
            <li>{message}</li>
          ))}
        </ul>
      ) : null}

      <label>
        イベント名
        <input type="text" name="title" required maxlength={200} value={titleValue} />
      </label>

      <fieldset x-data={`{ extras: ${JSON.stringify(extraOptions)} }`}>
        <legend>候補日時</legend>

        <label>
          候補 1
          <input type="datetime-local" name="options" required value={firstOption} />
        </label>

        <template x-for="(value, index) in extras" x-bind:key="index">
          <label>
            <span x-text="`候補 ${index + 2}`"></span>
            <div role="group">
              <input
                type="datetime-local"
                name="options"
                required
                x-bind:value="value"
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

        {/* JS 無効環境向けに extras 行をサーバ静的描画する。JS 有効時は上の <template x-for> 側のみが反映される。 */}
        {extraOptions.map((value, index) => (
          <noscript>
            <label>
              候補 {index + 2}
              <input type="datetime-local" name="options" required value={value} />
            </label>
          </noscript>
        ))}

        <button type="button" class="secondary" x-on:click="extras.push('')">
          候補を追加
        </button>
      </fieldset>

      <label>
        カスタム設問（任意）
        <input type="text" name="customQuestion" maxlength={200} value={customQuestionValue} />
      </label>

      <button type="submit">作成</button>
    </form>
  );
};

const hasCustomQuestion = (event: Event): boolean =>
  event.customQuestion !== null && event.customQuestion !== undefined;

export const formatOptionLabel = (raw: string): string => {
  // `<input type="datetime-local">` の値は "YYYY-MM-DDTHH:mm" 形式
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return raw; // フリーテキスト等のフォールバックは元文字列
  const [, y, m, d, h, mm] = match;
  const date = new Date(`${y}-${m}-${d}T${h}:${mm}:00`);
  if (Number.isNaN(date.getTime())) return raw;
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${y}/${m}/${d} (${weekday}) ${h}:${mm}`;
};

export const ResponsesTable: FC<{
  event: Event;
  options: EventOption[];
  responses: ResponseWithAnswers[];
  aggregates: Aggregates;
}> = ({ event, options, responses, aggregates }) => {
  const showCustomColumn = hasCustomQuestion(event);

  if (responses.length === 0) {
    return <p>まだ回答がありません</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>名前</th>
          {options.map((option) => (
            <th>{formatOptionLabel(option.label)}</th>
          ))}
          {showCustomColumn ? <th>カスタム回答</th> : null}
        </tr>
      </thead>
      <tbody>
        {responses.map((response) => (
          <tr>
            <td>{response.name}</td>
            {options.map((option) => (
              <td>{response.answers[String(option.id)] ?? ""}</td>
            ))}
            {showCustomColumn ? <td>{response.customAnswer ?? ""}</td> : null}
          </tr>
        ))}
        <tr>
          <td>集計</td>
          {options.map((option) => {
            const agg = aggregates[String(option.id)] ?? { circle: 0, triangle: 0, cross: 0 };
            return (
              <td>
                ○ {agg.circle} △ {agg.triangle} × {agg.cross}
              </td>
            );
          })}
          {showCustomColumn ? <td></td> : null}
        </tr>
      </tbody>
    </table>
  );
};

export const EventPage: FC<{
  event: Event;
  options: EventOption[];
  responses: ResponseWithAnswers[];
  aggregates: Aggregates;
}> = ({ event, options, responses, aggregates }) => {
  const showCustomQuestion = hasCustomQuestion(event);

  return (
    <article>
      <h1>{event.title}</h1>
      <ul>
        {options.map((option) => (
          <li>{formatOptionLabel(option.label)}</li>
        ))}
      </ul>
      {showCustomQuestion ? (
        <p>
          <strong>設問:</strong> {event.customQuestion}
        </p>
      ) : null}
      <ResponsesTable
        event={event}
        options={options}
        responses={responses}
        aggregates={aggregates}
      />
      <form method="post" action={`/events/${event.id}/responses`}>
        <label>
          名前
          <input type="text" name="name" required />
        </label>
        <button type="submit">回答する</button>
      </form>
    </article>
  );
};

export const NotFoundPage: FC<{ message: string }> = ({ message }) => (
  <article>
    <h1>{message}</h1>
  </article>
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
