import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  customQuestion: text("custom_question"),
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

export type Event = typeof events.$inferSelect;
export type EventOption = typeof eventOptions.$inferSelect;
export type EventResponse = typeof eventResponses.$inferSelect;
export type EventOptionResponse = typeof eventOptionResponses.$inferSelect;
export type SlackWebhook = typeof slackWebhooks.$inferSelect;
