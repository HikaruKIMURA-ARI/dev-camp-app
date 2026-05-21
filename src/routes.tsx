import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { cardService } from "./cards";
import {
  type Answer,
  createEvent,
  getEventWithOptions,
  getResponseById,
  updateResponse,
} from "./db";
import {
  CardsCarousel,
  EventNewForm,
  type EventNewFormValues,
  EventPage,
  Layout,
  NotFoundPage,
  ResponseFormRow,
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
  description: z.string().max(2000).optional(),
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
  const rawDescription = typeof body.description === "string" ? body.description : undefined;

  const parsed = eventCreateSchema.safeParse({
    title: rawTitle,
    options: rawOptions,
    customQuestion: rawCustomQuestion,
    description: rawDescription,
  });

  if (!parsed.success) {
    const values: EventNewFormValues = {
      title: rawTitle,
      options: rawOptions,
      customQuestion: rawCustomQuestion,
      description: rawDescription,
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
  const description =
    parsed.data.description === undefined || parsed.data.description === ""
      ? null
      : parsed.data.description;

  const { id } = await createEvent({
    title: parsed.data.title,
    options: parsed.data.options,
    customQuestion,
    description,
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

// 回答送信フォーム（POST 新規 / PUT 編集）の生入力。
type RawResponseSubmission = {
  name: string;
  customAnswer: string | undefined;
  answers: Record<string, string>;
};

const readResponseSubmission = async (c: Context): Promise<RawResponseSubmission> => {
  const body = await c.req.parseBody({ all: true });
  return {
    name: typeof body.name === "string" ? body.name : "",
    customAnswer: typeof body.customAnswer === "string" ? body.customAnswer : undefined,
    answers: parseAnswersFromBody(body),
  };
};

// 422 差し戻し時のレスポンス本文。送信値（name / customAnswer）の文字列保持のみを
// 観察可能な振る舞いとして担保する最小プレースホルダ。HTML 構造の本格復元は後続タスクで対応する。
const renderResponseValidationError = (c: Context, raw: RawResponseSubmission) =>
  c.html(
    <div>
      <span>{raw.name}</span>
      <span>{raw.customAnswer ?? ""}</span>
    </div>,
    422,
  );

// 回答送信のバリデーション（スキーマ + クロス参照検証）。
// 成功すれば validated を、失敗すれば 422 レスポンスを返す。
const validateResponseSubmission = (
  c: Context,
  raw: RawResponseSubmission,
  validOptionIds: ReadonlySet<string>,
):
  | {
      ok: true;
      data: { name: string; answers: Record<string, Answer>; customAnswer: string | null };
    }
  | { ok: false; response: Response | Promise<Response> } => {
  const parsed = responseSchema.safeParse({
    name: raw.name,
    answers: raw.answers,
    customAnswer: raw.customAnswer,
  });
  if (!parsed.success) {
    return { ok: false, response: renderResponseValidationError(c, raw) };
  }

  // クロス参照検証: 送信された optionId 集合と当該イベントの候補 ID 集合が完全一致すること。
  // 未知 ID の混入と、候補に対する回答欠落の両方をここで検出する。
  const submittedOptionIds = new Set(Object.keys(parsed.data.answers));
  const hasUnknownOption = [...submittedOptionIds].some((oid) => !validOptionIds.has(oid));
  const hasMissingOption = [...validOptionIds].some((oid) => !submittedOptionIds.has(oid));
  if (hasUnknownOption || hasMissingOption) {
    return { ok: false, response: renderResponseValidationError(c, raw) };
  }

  return {
    ok: true,
    data: {
      name: parsed.data.name,
      answers: parsed.data.answers as Record<string, Answer>,
      customAnswer: parsed.data.customAnswer ?? null,
    },
  };
};

const renderResponseSubmissionFragment = async (c: Context, eventId: string) => {
  const updated = await getEventWithOptions(eventId);
  if (!updated) return c.notFound();
  return c.html(
    <>
      <div id="responses">
        <ResponsesTable
          event={updated.event}
          options={updated.options}
          responses={updated.responses}
          aggregates={updated.aggregates}
        />
      </div>
      <CardsCarousel responses={updated.responses} oob />
    </>,
  );
};

routes.post("/events/:id/responses", async (c) => {
  const id = c.req.param("id");

  const data = await getEventWithOptions(id);
  if (!data) return c.notFound();

  const raw = await readResponseSubmission(c);
  const validOptionIds = new Set(data.options.map((o) => String(o.id)));
  const validated = validateResponseSubmission(c, raw, validOptionIds);
  if (!validated.ok) return validated.response;

  await cardService.generateAndPersist(id, validated.data);

  return renderResponseSubmissionFragment(c, id);
});

routes.get("/events/:id/responses/:responseId/edit", async (c) => {
  const eventId = c.req.param("id");
  const responseId = Number(c.req.param("responseId"));

  const data = await getEventWithOptions(eventId);
  if (!data) return c.notFound();

  const responseRow = await getResponseById(responseId);
  if (!responseRow || responseRow.eventId !== eventId) return c.notFound();

  const targetResponse = data.responses.find((r) => r.id === responseId);
  const answers = targetResponse?.answers ?? {};

  return c.html(
    <ResponseFormRow
      event={data.event}
      options={data.options}
      mode="edit"
      responseId={responseId}
      values={{
        name: responseRow.name,
        answers,
        customAnswer: responseRow.customAnswer ?? undefined,
      }}
    />,
  );
});

routes.put("/events/:id/responses/:responseId", async (c) => {
  const eventId = c.req.param("id");
  const responseId = Number(c.req.param("responseId"));

  const data = await getEventWithOptions(eventId);
  if (!data) return c.notFound();

  const responseRow = await getResponseById(responseId);
  if (!responseRow || responseRow.eventId !== eventId) return c.notFound();

  const raw = await readResponseSubmission(c);
  const validOptionIds = new Set(data.options.map((o) => String(o.id)));
  const validated = validateResponseSubmission(c, raw, validOptionIds);
  if (!validated.ok) return validated.response;

  await updateResponse(eventId, responseId, validated.data);

  return renderResponseSubmissionFragment(c, eventId);
});

export default routes;
