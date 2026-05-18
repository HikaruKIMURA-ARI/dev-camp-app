import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { addResponse, createEvent, getEventWithOptions } from "./db";
import {
  EventNewForm,
  type EventNewFormValues,
  EventPage,
  Layout,
  NotFoundPage,
  ResponsesTable,
  type Theme,
} from "./views";

const readTheme = (c: Context): Theme | undefined => {
  const v = getCookie(c, "theme");
  return v === "dark" || v === "light" ? v : undefined;
};

const routes = new Hono();

routes.get("/", (c) => c.redirect("/events/new", 302));

routes.get("/events/new", (c) =>
  c.html(
    <Layout theme={readTheme(c)}>
      <EventNewForm />
    </Layout>,
  ),
);

const eventCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  options: z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .refine((arr) => new Set(arr).size === arr.length, "候補日時に重複があります"),
  customQuestion: z.string().max(200).optional(),
});

const normalizeOptions = (raw: unknown): string[] => {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (raw === undefined || raw === null) return [];
  return [String(raw)];
};

routes.post("/events", async (c) => {
  const body = await c.req.parseBody({ all: true });

  const rawTitle = typeof body.title === "string" ? body.title : "";
  const rawOptions = normalizeOptions(body.options);
  const rawCustomQuestion =
    typeof body.customQuestion === "string" ? body.customQuestion : undefined;

  const parsed = eventCreateSchema.safeParse({
    title: rawTitle,
    options: rawOptions,
    customQuestion: rawCustomQuestion,
  });

  if (!parsed.success) {
    const values: EventNewFormValues = {
      title: rawTitle,
      options: rawOptions,
      customQuestion: rawCustomQuestion,
    };
    const errors = parsed.error.issues.map((issue) => issue.message);
    return c.html(
      <Layout theme={readTheme(c)}>
        <EventNewForm values={values} errors={errors} />
      </Layout>,
      422,
    );
  }

  const customQuestion =
    parsed.data.customQuestion === undefined || parsed.data.customQuestion.trim() === ""
      ? null
      : parsed.data.customQuestion;

  const { id } = await createEvent({
    title: parsed.data.title,
    options: parsed.data.options,
    customQuestion,
  });

  return c.redirect(`/events/${id}`, 302);
});

routes.get("/events/:id", async (c) => {
  const id = c.req.param("id");
  const data = await getEventWithOptions(id);

  if (!data) {
    return c.html(
      <Layout theme={readTheme(c)}>
        <NotFoundPage message="イベントが見つかりません" />
      </Layout>,
      404,
    );
  }

  return c.html(
    <Layout theme={readTheme(c)}>
      <EventPage
        event={data.event}
        options={data.options}
        responses={data.responses}
        aggregates={data.aggregates}
      />
    </Layout>,
  );
});

const responseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  answers: z.record(z.string(), z.enum(["○", "△", "×"])),
  customAnswer: z.string().max(500).optional(),
});

// `parseBody({ all: true })` の戻り値から `answers[<optionId>]` キーを抜き出し、
// `{ <optionId>: <value> }` の形に正規化する。文字列値以外（File 等）は無視する。
const parseAnswersFromBody = (body: Record<string, unknown>): Record<string, string> => {
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    const match = key.match(/^answers\[(.+)\]$/);
    if (match && typeof value === "string") {
      answers[match[1]!] = value;
    }
  }
  return answers;
};

routes.post("/events/:id/responses", async (c) => {
  const id = c.req.param("id");

  const data = await getEventWithOptions(id);
  if (!data) return c.notFound();

  const body = await c.req.parseBody({ all: true });
  const rawName = typeof body.name === "string" ? body.name : "";
  const rawCustomAnswer = typeof body.customAnswer === "string" ? body.customAnswer : undefined;
  const rawAnswers = parseAnswersFromBody(body);

  // 422 差し戻し時のレスポンス本文（送信値を保持するための最小プレースホルダ）。
  // 本格的なフォーム再描画は後続タスクで対応する。
  const renderValidationError = () =>
    c.html(
      <div>
        <span>{rawName}</span>
        <span>{rawCustomAnswer ?? ""}</span>
      </div>,
      422,
    );

  const parsed = responseSchema.safeParse({
    name: rawName,
    answers: rawAnswers,
    customAnswer: rawCustomAnswer,
  });
  if (!parsed.success) return renderValidationError();

  // クロス参照検証: 送信された optionId 集合と当該イベントの候補 ID 集合が完全一致すること。
  // 未知 ID の混入と、候補に対する回答欠落の両方をここで検出する。
  const validOptionIds = new Set(data.options.map((o) => String(o.id)));
  const submittedOptionIds = new Set(Object.keys(parsed.data.answers));
  const hasUnknownOption = [...submittedOptionIds].some((oid) => !validOptionIds.has(oid));
  const hasMissingOption = [...validOptionIds].some((oid) => !submittedOptionIds.has(oid));
  if (hasUnknownOption || hasMissingOption) return renderValidationError();

  await addResponse(id, {
    name: parsed.data.name,
    answers: parsed.data.answers,
    customAnswer: parsed.data.customAnswer ?? null,
  });

  const updated = await getEventWithOptions(id);
  if (!updated) return c.notFound();

  return c.html(
    <ResponsesTable
      event={updated.event}
      options={updated.options}
      responses={updated.responses}
      aggregates={updated.aggregates}
    />,
  );
});

export default routes;
