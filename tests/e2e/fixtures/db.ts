import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eventOptionResponses, eventOptions, eventResponses, events } from "../../../src/schema";

// E2E 用 DB（`playwright.config.ts` の webServer と一致させる）。
const client = createClient({ url: "file:test-e2e.db" });
const db = drizzle(client);

export async function truncateAll(): Promise<void> {
  // 外部キー依存順に DELETE する。
  await db.delete(eventOptionResponses);
  await db.delete(eventResponses);
  await db.delete(eventOptions);
  await db.delete(events);
}
