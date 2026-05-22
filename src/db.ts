import { createClient } from "@libsql/client";
import { asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  type Event,
  type EventCustomQuestion,
  type EventOption,
  type EventResponse,
  eventCustomAnswers,
  eventCustomQuestions,
  eventOptionResponses,
  eventOptions,
  eventResponses,
  events,
  participantCards,
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
  customQuestion?: string | null;
  customQuestions?: string[];
  description?: string | null;
}

export const createEvent = async (input: CreateEventInput): Promise<{ id: string }> => {
  const id = crypto.randomUUID();

  // 新スキーマでは customQuestions: string[] を受け取る。後方互換のため customQuestion: string | null も継続サポート。
  // 旧 events.custom_question カラムには customQuestions[0] か customQuestion を入れる（カラム削除は後続 Phase）。
  const customQuestionsList = input.customQuestions ?? [];
  const legacyCustomQuestion =
    customQuestionsList.length > 0
      ? (customQuestionsList[0] ?? null)
      : (input.customQuestion ?? null);

  await db.transaction(async (tx) => {
    await tx.insert(events).values({
      id,
      title: input.title,
      customQuestion: legacyCustomQuestion,
      description: input.description ?? null,
    });

    if (customQuestionsList.length > 0) {
      await tx.insert(eventCustomQuestions).values(
        customQuestionsList.map((question, index) => ({
          eventId: id,
          question,
          sortOrder: index,
        })),
      );
    }

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
  customQuestions: EventCustomQuestion[];
  responses: Array<
    EventResponse & {
      answers: Record<string, Answer>;
      customAnswers: Record<string, string>;
      comment: string | null;
      card: PersistedCard | null;
    }
  >;
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

  const customQuestions = await db
    .select()
    .from(eventCustomQuestions)
    .where(eq(eventCustomQuestions.eventId, id))
    .orderBy(asc(eventCustomQuestions.sortOrder));

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

  const customAnswerRows =
    responseIds.length === 0
      ? []
      : await db
          .select()
          .from(eventCustomAnswers)
          .where(inArray(eventCustomAnswers.responseId, responseIds));

  const customAnswersByResponseId = new Map<number, Record<string, string>>();
  for (const ca of customAnswerRows) {
    let bucket = customAnswersByResponseId.get(ca.responseId);
    if (!bucket) {
      bucket = {};
      customAnswersByResponseId.set(ca.responseId, bucket);
    }
    bucket[String(ca.questionId)] = ca.answer;
  }

  const cardRows =
    responseIds.length === 0
      ? []
      : await db
          .select()
          .from(participantCards)
          .where(inArray(participantCards.responseId, responseIds));

  const cardsByResponseId = new Map<number, PersistedCard>();
  for (const c of cardRows) {
    cardsByResponseId.set(c.responseId, {
      responseId: c.responseId,
      title: c.title,
      rarity: c.rarity,
      attribute: c.attribute,
      race: c.race,
      flavor: c.flavor,
      attack: c.attack,
      defense: c.defense,
      tier: c.tier,
    });
  }

  const responsesWithAnswers = responses.map((response) => ({
    ...response,
    answers: answersByResponseId.get(response.id) ?? {},
    customAnswers: customAnswersByResponseId.get(response.id) ?? {},
    card: cardsByResponseId.get(response.id) ?? null,
  }));

  return { event, options, customQuestions, responses: responsesWithAnswers, aggregates };
};

export interface ResponseInput {
  name: string;
  answers: Record<string, Answer>;
  customAnswer?: string | null;
  customAnswers?: Record<string, string>;
  comment?: string | null;
}

export const addResponse = async (
  eventId: string,
  input: ResponseInput,
): Promise<{ responseId: number }> => {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(eventResponses)
      .values({
        eventId,
        name: input.name,
        customAnswer: input.customAnswer ?? null,
        comment: input.comment === "" ? null : (input.comment ?? null),
      })
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

    const customEntries = Object.entries(input.customAnswers ?? {});
    if (customEntries.length > 0) {
      await tx.insert(eventCustomAnswers).values(
        customEntries.map(([questionId, answer]) => ({
          responseId,
          questionId: Number(questionId),
          answer,
        })),
      );
    }
    return { responseId };
  });
};

export type Tier = "ai" | "template" | "default";

export type CardAttributes = {
  title: string;
  rarity: string;
  attribute: string;
  race: string;
  flavor: string;
  attack: number;
  defense: number;
};

export type PersistedCard = CardAttributes & {
  responseId: number;
  tier: Tier;
};

export interface AddResponseWithCardInput {
  response: ResponseInput;
  card: CardAttributes & { tier: Tier };
}

export const addResponseWithCard = async (
  eventId: string,
  input: AddResponseWithCardInput,
): Promise<{ responseId: number; card: PersistedCard }> => {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(eventResponses)
      .values({
        eventId,
        name: input.response.name,
        customAnswer: input.response.customAnswer ?? null,
        comment: input.response.comment === "" ? null : (input.response.comment ?? null),
      })
      .returning({ id: eventResponses.id });
    const responseId = row!.id;

    const entries = Object.entries(input.response.answers);
    if (entries.length > 0) {
      await tx.insert(eventOptionResponses).values(
        entries.map(([optionId, answer]) => ({
          responseId,
          optionId: Number(optionId),
          answer,
        })),
      );
    }

    const customEntries = Object.entries(input.response.customAnswers ?? {});
    if (customEntries.length > 0) {
      await tx.insert(eventCustomAnswers).values(
        customEntries.map(([questionId, answer]) => ({
          responseId,
          questionId: Number(questionId),
          answer,
        })),
      );
    }

    await tx.insert(participantCards).values({
      responseId,
      title: input.card.title,
      rarity: input.card.rarity,
      attribute: input.card.attribute,
      race: input.card.race,
      flavor: input.card.flavor,
      attack: input.card.attack,
      defense: input.card.defense,
      tier: input.card.tier,
    });

    return {
      responseId,
      card: { ...input.card, responseId },
    };
  });
};

export const getResponseById = async (responseId: number): Promise<EventResponse | null> => {
  const [row] = await db.select().from(eventResponses).where(eq(eventResponses.id, responseId));
  return row ?? null;
};

export const updateResponse = async (
  _eventId: string,
  responseId: number,
  input: ResponseInput,
): Promise<boolean> => {
  await db.transaction(async (tx) => {
    await tx
      .update(eventResponses)
      .set({
        name: input.name,
        customAnswer: input.customAnswer ?? null,
        comment: input.comment === "" ? null : (input.comment ?? null),
      })
      .where(eq(eventResponses.id, responseId));

    await tx.delete(eventOptionResponses).where(eq(eventOptionResponses.responseId, responseId));

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

    await tx.delete(eventCustomAnswers).where(eq(eventCustomAnswers.responseId, responseId));

    const customEntries = Object.entries(input.customAnswers ?? {});
    if (customEntries.length > 0) {
      await tx.insert(eventCustomAnswers).values(
        customEntries.map(([questionId, answer]) => ({
          responseId,
          questionId: Number(questionId),
          answer,
        })),
      );
    }
  });
  return true;
};
