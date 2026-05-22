import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  customQuestion: text("custom_question"),
  description: text("description"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const eventOptions = sqliteTable(
  "event_options",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [index("event_options_event_id_idx").on(table.eventId)],
);

export const eventResponses = sqliteTable(
  "event_responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    customAnswer: text("custom_answer"),
    comment: text("comment"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index("event_responses_event_id_idx").on(table.eventId)],
);

export const eventOptionResponses = sqliteTable(
  "event_option_responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    responseId: integer("response_id")
      .notNull()
      .references(() => eventResponses.id, { onDelete: "cascade" }),
    optionId: integer("option_id")
      .notNull()
      .references(() => eventOptions.id, { onDelete: "cascade" }),
    answer: text("answer", { enum: ["○", "△", "×"] }).notNull(),
  },
  (table) => [
    index("event_option_responses_response_id_idx").on(table.responseId),
    index("event_option_responses_option_id_idx").on(table.optionId),
  ],
);

export const slackWebhooks = sqliteTable("slack_webhooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const eventCustomQuestions = sqliteTable(
  "event_custom_questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [index("event_custom_questions_event_id_idx").on(table.eventId)],
);

export const eventCustomAnswers = sqliteTable(
  "event_custom_answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    responseId: integer("response_id")
      .notNull()
      .references(() => eventResponses.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => eventCustomQuestions.id, { onDelete: "cascade" }),
    answer: text("answer").notNull(),
  },
  (table) => [
    index("event_custom_answers_response_id_idx").on(table.responseId),
    index("event_custom_answers_question_id_idx").on(table.questionId),
  ],
);

export const participantCards = sqliteTable("participant_cards", {
  responseId: integer("response_id")
    .primaryKey()
    .references(() => eventResponses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  rarity: text("rarity").notNull(),
  attribute: text("attribute").notNull(),
  race: text("race").notNull(),
  flavor: text("flavor").notNull(),
  attack: integer("attack").notNull(),
  defense: integer("defense").notNull(),
  tier: text("tier", { enum: ["ai", "template", "default"] }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Event = typeof events.$inferSelect;
export type EventOption = typeof eventOptions.$inferSelect;
export type EventResponse = typeof eventResponses.$inferSelect;
export type EventOptionResponse = typeof eventOptionResponses.$inferSelect;
export type SlackWebhook = typeof slackWebhooks.$inferSelect;
export type ParticipantCard = typeof participantCards.$inferSelect;
export type EventCustomQuestion = typeof eventCustomQuestions.$inferSelect;
export type EventCustomAnswer = typeof eventCustomAnswers.$inferSelect;
