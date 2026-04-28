import { createClient } from "@libsql/client";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { messages, type Message } from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema: { messages } });

await migrate(db, { migrationsFolder: "./drizzle" });

export function listMessages(): Promise<Message[]> {
  return db.select().from(messages).orderBy(desc(messages.id)).limit(50);
}

export async function addMessage(body: string): Promise<void> {
  await db.insert(messages).values({ body });
}
