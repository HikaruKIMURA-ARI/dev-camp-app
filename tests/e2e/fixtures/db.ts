import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:test-e2e.db";

const client = createClient({ url });

export async function truncateAll(): Promise<void> {
  await client.execute("DELETE FROM messages");
  await client.execute("DELETE FROM sqlite_sequence WHERE name = 'messages'");
}
