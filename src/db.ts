import { createClient } from "@libsql/client";
import { asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  type Event,
  type EventOption,
  type EventResponse,
  eventOptionResponses,
  eventOptions,
  eventResponses,
  events,
} from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle" });

export interface CreateEventInput {
  title: string;
  options: string[];
  customQuestion: string | null;
}

export const createEvent = async (input: CreateEventInput): Promise<{ id: string }> => {
  const id = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(events).values({
      id,
      title: input.title,
      customQuestion: input.customQuestion,
    });

    await tx.insert(eventOptions).values(
      input.options.map((label, index) => ({
        eventId: id,
        label,
        sortOrder: index,
      })),
    );
  });

  return { id };
};

export type Answer = "○" | "△" | "×";

export type AggregateCounts = { circle: number; triangle: number; cross: number };

export interface EventWithOptions {
  event: Event;
  options: EventOption[];
  responses: Array<EventResponse & { answers: Record<string, Answer> }>;
  aggregates: Record<string, AggregateCounts>;
}

const ANSWER_TO_AGG_KEY: Record<Answer, keyof AggregateCounts> = {
  "○": "circle",
  "△": "triangle",
  "×": "cross",
};

export const getEventWithOptions = async (id: string): Promise<EventWithOptions | null> => {
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) return null;

  const options = await db
    .select()
    .from(eventOptions)
    .where(eq(eventOptions.eventId, id))
    .orderBy(asc(eventOptions.sortOrder));

  const responses = await db
    .select()
    .from(eventResponses)
    .where(eq(eventResponses.eventId, id))
    .orderBy(asc(eventResponses.id));

  const aggregates: Record<string, AggregateCounts> = {};
  for (const option of options) {
    aggregates[String(option.id)] = { circle: 0, triangle: 0, cross: 0 };
  }

  // 全 response の option 回答を 1 回の SELECT でまとめて取得し、in-memory で responseId ごとに振り分ける（N+1 回避）。
  const responseIds = responses.map((r) => r.id);
  const optResponses =
    responseIds.length === 0
      ? []
      : await db
          .select()
          .from(eventOptionResponses)
          .where(inArray(eventOptionResponses.responseId, responseIds));

  const answersByResponseId = new Map<number, Record<string, Answer>>();
  for (const optResponse of optResponses) {
    const optionKey = String(optResponse.optionId);
    const answer = optResponse.answer as Answer;

    let answers = answersByResponseId.get(optResponse.responseId);
    if (!answers) {
      answers = {};
      answersByResponseId.set(optResponse.responseId, answers);
    }
    answers[optionKey] = answer;

    const agg = aggregates[optionKey];
    if (agg) agg[ANSWER_TO_AGG_KEY[answer]] += 1;
  }

  const responsesWithAnswers = responses.map((response) => ({
    ...response,
    answers: answersByResponseId.get(response.id) ?? {},
  }));

  return { event, options, responses: responsesWithAnswers, aggregates };
};

export interface ResponseInput {
  name: string;
  answers: Record<string, Answer>;
  customAnswer?: string | null;
}

export const addResponse = async (
  eventId: string,
  input: ResponseInput,
): Promise<{ responseId: number }> => {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(eventResponses)
      .values({ eventId, name: input.name, customAnswer: input.customAnswer ?? null })
      .returning({ id: eventResponses.id });
    const responseId = row!.id;

    const entries = Object.entries(input.answers);
    if (entries.length > 0) {
      await tx.insert(eventOptionResponses).values(
        entries.map(([optionId, answer]) => ({
          responseId,
          optionId: Number(optionId),
          answer,
        })),
      );
    }
    return { responseId };
  });
};
