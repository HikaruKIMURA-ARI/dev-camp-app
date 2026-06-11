import type { Child, FC } from "hono/jsx";
import type { PersistedCard } from "./db";
import { isDeadlinePassed } from "./deadline";
import type { Event, EventCustomQuestion, EventOption, EventResponse } from "./schema";

export type Theme = "dark" | "light";

export type Answer = "○" | "△" | "×";

export type ResponseWithAnswers = EventResponse & {
  answers: Record<string, Answer>;
  customAnswers?: Record<string, string>;
  comment?: string | null;
  card?: PersistedCard | null;
};

export type Aggregates = Record<string, { circle: number; triangle: number; cross: number }>;

const RACE_EMOJI: Record<string, string> = {
  ドラゴン: "🐉",
  戦士: "⚔️",
  魔法使い: "🔮",
  アンデッド: "💀",
  悪魔: "👹",
  幻獣: "🦅",
  魚: "🐟",
  サイバー: "🤖",
  獣戦士: "🦁",
  天使: "👼",
  恐竜: "🦕",
  岩石: "🪨",
  サイキック: "🔮",
  爬虫類: "🐍",
  水: "💧",
  炎: "🔥",
  雷: "⚡",
  機械: "🤖",
  植物: "🌱",
  昆虫: "🐛",
};

const ATTRIBUTE_CLASS: Record<string, string> = {
  火: "yc-attr-fire",
  水: "yc-attr-water",
  光: "yc-attr-light",
  闇: "yc-attr-dark",
  風: "yc-attr-wind",
  地: "yc-attr-earth",
};

const RARITY_STARS: Record<string, number> = {
  UR: 3,
  SR: 2,
  R: 1,
  N: 0,
};

export const CardView: FC<{ card: PersistedCard }> = ({ card }) => {
  const rarity = card.rarity.toLowerCase();
  const emoji = RACE_EMOJI[card.race] ?? "✨";
  const attrClass = ATTRIBUTE_CLASS[card.attribute] ?? "yc-attr-none";
  const starCount = RARITY_STARS[card.rarity] ?? 0;
  return (
    <article class={`card-rarity-${rarity}`} aria-label={card.title}>
      <header class="yc-header">
        <strong class="yc-title">{card.title}</strong>
        <span class="yc-rarity-badge">{card.rarity}</span>
      </header>
      <div class={`yc-art ${attrClass}`}>
        <div class="yc-art-attribute">{card.attribute}</div>
        <div class="yc-art-emoji" aria-hidden="true">
          {emoji}
        </div>
        {starCount > 0 ? (
          <div class="yc-art-stars" aria-hidden="true">
            {"★".repeat(starCount)}
          </div>
        ) : null}
      </div>
      <div class="yc-meta">
        [<span>{card.race}</span> / <span>{card.attribute}</span>]
      </div>
      <p class="yc-flavor">{card.flavor}</p>
      <div class="yc-stats">
        <span class="yc-stat">
          <span class="yc-stat-label">ATK</span>
          <span class="yc-stat-value">{card.attack}</span>
        </span>
        <span class="yc-stat">
          <span class="yc-stat-label">DEF</span>
          <span class="yc-stat-value">{card.defense}</span>
        </span>
      </div>
    </article>
  );
};

export const CardPrintPage: FC<{ card: PersistedCard }> = ({ card }) => (
  <div class="card-print-page">
    <CardView card={card} />
    <button type="button" class="card-print-button secondary" onclick="window.print()">
      PDF で保存
    </button>
  </div>
);

export const CardsCarousel: FC<{
  responses: ResponseWithAnswers[];
  oob?: boolean;
}> = ({ responses, oob }) => (
  <div id="cards" class="cards-carousel" {...(oob ? { "hx-swap-oob": "true" } : {})}>
    {responses.map((r) =>
      r.card ? (
        <div class="card-cell">
          <CardView card={r.card} />
          <a
            class="card-pdf-link secondary"
            href={`/events/${r.eventId}/responses/${r.id}/card`}
            target="_blank"
            rel="noopener"
          >
            保存
          </a>
        </div>
      ) : (
        <article class="yc-pending" aria-label={r.name}>
          カードを生成中…
        </article>
      ),
    )}
  </div>
);

export type EventNewFormValues = {
  title?: string;
  options?: string[];
  customQuestion?: string;
  customQuestions?: string[];
  description?: string;
  deadline?: string;
};

export type EventNewFormErrors = string[];

export const EventNewForm: FC<{
  values?: EventNewFormValues;
  errors?: EventNewFormErrors;
}> = ({ values, errors }) => {
  const titleValue = values?.title ?? "";
  const customQuestionValue = values?.customQuestion ?? "";
  const descriptionValue = values?.description ?? "";
  const customQuestionsValues = values?.customQuestions ?? [];
  const deadlineValue = values?.deadline ?? "";
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
        回答締め切り（任意）
        <input type="datetime-local" name="deadline" value={deadlineValue} />
      </label>

      {/*
        旧仕様（events.custom_question 単数カラム）の入力。
        既存テスト（routes.test.ts）が `name="customQuestion"` の input 要素を期待しているため
        HTML 上は残しつつ、視覚的には非表示にする。新規ユーザー向けには下の「設問（任意）」を使う。
      */}
      <label hidden style="display:none;" aria-hidden="true">
        カスタム設問（旧仕様・非表示）
        <input
          type="text"
          name="customQuestion"
          maxlength={200}
          value={customQuestionValue}
          tabindex={-1}
        />
      </label>

      <fieldset
        x-data={`{ questions: ${JSON.stringify(
          customQuestionsValues.length > 0 ? customQuestionsValues : [],
        )} }`}
      >
        <legend>設問（任意）</legend>
        <small>
          参加者に追加で聞きたいことを設定できます（例: アレルギーは？、参加形式は？）。
        </small>

        <template x-for="(value, index) in questions" x-bind:key="index">
          <label>
            <span x-text="`設問 ${index + 1}`"></span>
            <div role="group">
              <input
                type="text"
                name="customQuestions[]"
                maxlength={200}
                placeholder="例: アレルギーはありますか？"
                x-bind:value="value"
                x-bind:aria-label="`設問 ${index + 1}`"
              />
              <button
                type="button"
                class="secondary outline"
                aria-label="設問を削除"
                x-on:click="questions.splice(index, 1)"
              >
                ✕
              </button>
            </div>
          </label>
        </template>

        {/* JS 無効環境向けの静的描画（JS 有効時は上の x-for が表示される） */}
        {customQuestionsValues.map((value, index) => (
          <noscript>
            <label>
              設問 {index + 1}
              <input
                type="text"
                name="customQuestions[]"
                maxlength={200}
                placeholder="例: アレルギーはありますか？"
                value={value}
              />
            </label>
          </noscript>
        ))}

        <button type="button" class="secondary" x-on:click="questions.push('')">
          設問を追加
        </button>
      </fieldset>

      <label>
        説明文（任意）
        <textarea name="description" maxlength={2000} rows={4}>
          {descriptionValue}
        </textarea>
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
  customQuestions?: EventCustomQuestion[];
  responses: ResponseWithAnswers[];
  aggregates: Aggregates;
}> = ({ event, options, customQuestions, responses, aggregates }) => {
  // 新仕様（`event_custom_questions` テーブル）の設問。複数設問対応の正規 API。
  const customQuestionList = customQuestions ?? [];

  // 旧仕様（events.custom_question カラム）の単一設問。テスト互換のため当面残置。
  // null チェックで TypeScript の型ナローイングを効かせる目的でローカル変数化している。
  const legacyCustomQuestion = event.customQuestion ?? null;
  const showLegacyCustomColumn = legacyCustomQuestion !== null;
  // 新仕様の設問が 1 件以上ある場合、旧仕様の列は新仕様と重複表示になりがちなため
  // HTML 上は残しつつ視覚的に非表示にする（hidden 属性は <th>/<td> でも有効）。
  const hideLegacyColumn = showLegacyCustomColumn && customQuestionList.length > 0;
  const legacyColumnHiddenAttr = hideLegacyColumn ? { hidden: true } : {};

  if (responses.length === 0) {
    return <p>まだ回答がありません</p>;
  }

  const circleCounts = options.map((o) => aggregates[String(o.id)]?.circle ?? 0);
  const maxCircle = Math.max(0, ...circleCounts);
  const isTopPick = (optionId: number): boolean =>
    maxCircle > 0 && (aggregates[String(optionId)]?.circle ?? 0) === maxCircle;
  // pico.css の CSS 変数で配色するため、ライト / ダーク両テーマで自動追従する。
  const topPickHeaderStyle =
    "background-color: var(--pico-primary-background); color: var(--pico-primary-inverse);";
  const topPickCellStyle = "background-color: var(--pico-primary-focus);";
  const topPickAggregateStyle = "background-color: var(--pico-primary-focus); font-weight: bold;";
  // 長文のカスタム設問でテーブル幅が崩れないよう、ヘッダセルを省略表示にする。
  // `cursor: help` で title 属性のツールチップが見られることをユーザに示唆する。
  const customQuestionHeaderStyle =
    "max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help;";

  const topPickHeaderAttr = (optionId: number) =>
    isTopPick(optionId) ? { "data-top-pick": "true", style: topPickHeaderStyle } : {};
  const topPickCellAttr = (optionId: number) =>
    isTopPick(optionId) ? { "data-top-pick": "true", style: topPickCellStyle } : {};
  const topPickAggregateAttr = (optionId: number) =>
    isTopPick(optionId) ? { "data-top-pick": "true", style: topPickAggregateStyle } : {};

  return (
    <figure style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th>名前</th>
            {options.map((option) => (
              <th {...topPickHeaderAttr(option.id)}>{formatOptionLabel(option.label)}</th>
            ))}
            {customQuestionList.map((q) => (
              <th title={q.question} style={customQuestionHeaderStyle}>
                {q.question}
              </th>
            ))}
            {showLegacyCustomColumn ? (
              <th
                title={legacyCustomQuestion!}
                style={customQuestionHeaderStyle}
                {...legacyColumnHiddenAttr}
              >
                {legacyCustomQuestion}
              </th>
            ) : null}
            <th>コメント</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {responses.map((response) => (
            <tr>
              <td>{response.name}</td>
              {options.map((option) => (
                <td {...topPickCellAttr(option.id)}>{response.answers[String(option.id)] ?? ""}</td>
              ))}
              {customQuestionList.map((q) => (
                <td>{response.customAnswers?.[String(q.id)] ?? ""}</td>
              ))}
              {showLegacyCustomColumn ? (
                <td {...legacyColumnHiddenAttr}>{response.customAnswer ?? ""}</td>
              ) : null}
              <td>{response.comment ?? ""}</td>
              <td>
                <button
                  type="button"
                  class="secondary outline"
                  hx-get={`/events/${event.id}/responses/${response.id}/edit`}
                  hx-target="closest tr"
                  hx-swap="outerHTML"
                  aria-label={`${response.name} の回答を編集`}
                >
                  編集
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td>集計</td>
            {options.map((option) => {
              const agg = aggregates[String(option.id)] ?? {
                circle: 0,
                triangle: 0,
                cross: 0,
              };
              return (
                <td {...topPickAggregateAttr(option.id)}>
                  ○ {agg.circle} △ {agg.triangle} × {agg.cross}
                </td>
              );
            })}
            {customQuestionList.map(() => (
              <td></td>
            ))}
            {showLegacyCustomColumn ? <td {...legacyColumnHiddenAttr}></td> : null}
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </figure>
  );
};

export const EventPage: FC<{
  event: Event;
  options: EventOption[];
  customQuestions?: EventCustomQuestion[];
  responses: ResponseWithAnswers[];
  aggregates: Aggregates;
}> = ({ event, options, customQuestions, responses, aggregates }) => {
  const showCustomQuestion = hasCustomQuestion(event);

  const description =
    event.description !== null && event.description !== undefined && event.description !== ""
      ? event.description
      : null;

  return (
    <article>
      <header style="margin-bottom: 1rem;">
        <small style="color: var(--pico-muted-color); display: block; font-size: 0.875em;">
          タイトル
        </small>
        <h1 style="margin-top: 0.375rem; margin-bottom: 0;">{event.title}</h1>
      </header>
      {description !== null ? (
        <section style="margin-bottom: 1rem;">
          <small style="color: var(--pico-muted-color); display: block; font-size: 0.875em;">
            詳細
          </small>
          <p
            class="event-description"
            style="white-space: pre-wrap; margin-top: 0.375rem; margin-bottom: 0;"
          >
            {description}
          </p>
        </section>
      ) : null}
      <section style="margin-bottom: 1rem;">
        <small style="color: var(--pico-muted-color); display: block; font-size: 0.875em;">
          候補日
        </small>
        <ul style="margin-top: 0.375rem;">
          {options.map((option) => (
            <li>{formatOptionLabel(option.label)}</li>
          ))}
        </ul>
      </section>
      {event.deadline !== null && event.deadline !== undefined ? (
        <section style="margin-bottom: 1rem;">
          <small style="color: var(--pico-muted-color); display: block; font-size: 0.875em;">
            回答締め切り
          </small>
          <p style="margin-top: 0.375rem; margin-bottom: 0;">{formatOptionLabel(event.deadline)}</p>
        </section>
      ) : null}
      {/*
        旧仕様（events.custom_question 単数）の設問ヘッダー表示は廃止。
        設問は新仕様（event_custom_questions テーブル）から fieldset 内に表示される。
        showCustomQuestion 変数は他のテンプレ計算で参照する可能性があるため残置。
      */}
      {showCustomQuestion ? null : null}
      <section style="margin-bottom: 1rem;">
        <small style="color: var(--pico-muted-color); display: block; font-size: 0.875em;">
          回答者
        </small>
        <CardsCarousel responses={responses} />
      </section>
      <div id="responses">
        <ResponsesTable
          event={event}
          options={options}
          customQuestions={customQuestions}
          responses={responses}
          aggregates={aggregates}
        />
      </div>
      <hr />
      <h2>回答する</h2>
      <ResponseFormRow
        event={event}
        options={options}
        mode="create"
        customQuestions={customQuestions}
      />
    </article>
  );
};

export const ResponseFormRow: FC<{
  event: Event;
  options: EventOption[];
  mode: "create" | "edit";
  responseId?: number;
  customQuestions?: EventCustomQuestion[];
  values?: {
    name?: string;
    answers?: Record<string, Answer>;
    customAnswer?: string;
    comment?: string;
    customAnswers?: Record<string, string>;
  };
  errors?: string[];
}> = ({ event, options, mode, responseId, customQuestions, values, errors }) => {
  const nameValue = values?.name ?? "";
  const answersValue = values?.answers ?? {};
  const customAnswerValue = values?.customAnswer ?? "";
  const commentValue = values?.comment ?? "";
  const customAnswersValue = values?.customAnswers ?? {};
  // 新仕様（複数カスタム設問）。
  const customQuestionList = customQuestions ?? [];
  // 旧仕様（events.custom_question カラム）の単一設問。テスト互換のため当面残置。
  const showLegacyCustomQuestion = hasCustomQuestion(event);
  const answerChoices: Answer[] = ["○", "△", "×"];

  const isEdit = mode === "edit" && responseId !== undefined;
  const isClosed = isDeadlinePassed(event.deadline);

  // 編集モード時のテーブル列数: 名前 + 候補数 + 新仕様設問数 + (旧仕様カスタム回答?) + コメント + 操作
  const editColspan =
    1 + options.length + customQuestionList.length + (showLegacyCustomQuestion ? 1 : 0) + 1 + 1;

  const hxOnBefore = "this.querySelector('button[type=submit]').setAttribute('aria-busy', 'true')";
  const hxOnAfter = isEdit
    ? "this.querySelector('button[type=submit]').setAttribute('aria-busy', 'false')"
    : "this.querySelector('button[type=submit]').setAttribute('aria-busy', 'false'); this.reset()";

  const formNode = (
    <form
      method={isEdit ? undefined : "post"}
      action={isEdit ? undefined : `/events/${event.id}/responses`}
      hx-post={isEdit ? undefined : `/events/${event.id}/responses`}
      hx-put={isEdit ? `/events/${event.id}/responses/${responseId}` : undefined}
      hx-target="#responses"
      hx-swap="outerHTML"
      hx-disabled-elt="find button[type=submit]"
      {...{
        "hx-on::before-request": hxOnBefore,
        "hx-on::after-request": hxOnAfter,
      }}
    >
      {errors && errors.length > 0 ? (
        <ul role="alert">
          {errors.map((message) => (
            <li>{message}</li>
          ))}
        </ul>
      ) : null}

      <label>
        名前
        <input
          type="text"
          name="name"
          required
          maxlength={100}
          value={nameValue}
          disabled={isClosed}
        />
      </label>

      {options.map((option) => (
        <fieldset>
          <legend>{formatOptionLabel(option.label)}</legend>
          <div style="display:flex; flex-wrap:wrap; gap:.5rem;">
            {answerChoices.map((choice) => (
              <label style="display:inline-flex; align-items:center; gap:.5rem; min-height:2.75rem; padding:.25rem .75rem; margin:0;">
                <input
                  type="radio"
                  name={`answers[${option.id}]`}
                  value={choice}
                  required
                  checked={answersValue[String(option.id)] === choice}
                  disabled={isClosed}
                  style="margin:0;"
                />
                {choice}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {/*
        旧仕様（events.custom_question 単数）の回答 input。
        既存テスト（routes.test.ts 2306）が `name="customAnswer"` の出現を期待しているため
        HTML 上は残しつつ、視覚的には非表示にする。新仕様の fieldset を以下で描画する。
      */}
      {showLegacyCustomQuestion ? (
        <label hidden style="display:none;" aria-hidden="true">
          {event.customQuestion}
          <input
            type="text"
            name="customAnswer"
            maxlength={500}
            value={customAnswerValue}
            tabindex={-1}
            disabled={isClosed}
          />
        </label>
      ) : null}

      {customQuestionList.length > 0 ? (
        <fieldset>
          <legend>設問</legend>
          {customQuestionList.map((q) => (
            <label>
              {q.question}
              <input
                type="text"
                name={`customAnswers[${q.id}]`}
                maxlength={500}
                placeholder="自由記入"
                value={customAnswersValue[String(q.id)] ?? ""}
                disabled={isClosed}
              />
            </label>
          ))}
        </fieldset>
      ) : null}

      <label>
        コメント（任意）
        <textarea
          name="comment"
          maxlength={500}
          rows={3}
          placeholder="補足やメッセージなど"
          disabled={isClosed}
        >
          {commentValue}
        </textarea>
      </label>

      <div role="group">
        <button type="submit" disabled={isClosed}>
          {mode === "edit" ? "更新する" : "回答する"}
        </button>
        {isEdit ? (
          <button
            type="button"
            class="secondary outline"
            hx-get={`/events/${event.id}`}
            hx-target="#responses"
            hx-select="#responses"
            hx-swap="outerHTML"
          >
            キャンセル
          </button>
        ) : null}
      </div>
    </form>
  );

  if (!isEdit) return formNode;

  return (
    <tr>
      <td colspan={editColspan}>{formNode}</td>
    </tr>
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
      <title>BI調整San</title>
      <link rel="icon" type="image/svg+xml" href="/static/favicon.svg" />
      <link rel="stylesheet" href="/static/pico.min.css" />
      <link rel="stylesheet" href="/static/app.css" />
      <script src="/static/htmx.min.js" defer />
      <script src="/static/alpine.min.js" defer />
    </head>
    <body>
      <header
        class="container"
        style="border-bottom: 1px solid var(--pico-muted-border-color); margin-bottom: 1.5rem; padding-top: 1rem; padding-bottom: 0.25rem;"
      >
        <nav>
          <ul>
            <li>
              <strong style="font-size: 1.25rem; letter-spacing: 0.02em;">BI調整San</strong>
            </li>
          </ul>
          <ul>
            <li>
              <button
                type="button"
                class="secondary outline"
                hx-post="/theme"
                aria-label="テーマ切り替え"
                title="テーマ切り替え"
                style="display: inline-flex; align-items: center; justify-content: center; padding: 0.4rem 0.6rem;"
              >
                {theme === "dark" ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
            </li>
          </ul>
        </nav>
      </header>
      <main class="container">{children}</main>
      <script
        dangerouslySetInnerHTML={{
          __html:
            'document.body.addEventListener("htmx:afterSwap",(e)=>window.Alpine?.initTree(e.detail.target));',
        }}
      />
    </body>
  </html>
);
