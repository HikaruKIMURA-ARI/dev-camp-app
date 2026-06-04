import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("[migrate] TURSO_DATABASE_URL is not set");
  process.exit(1);
}

const isRemote = url.startsWith("libsql://") || url.startsWith("https://");
if (isRemote && !process.env.TURSO_AUTH_TOKEN) {
  console.error("[migrate] TURSO_AUTH_TOKEN is required for remote databases");
  process.exit(1);
}

console.info(`[migrate] target: ${isRemote ? "remote libsql" : url}`);

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.info("[migrate] done");
} catch (err) {
  console.error("[migrate] failed");
  printError(err);
  process.exit(1);
}

function printError(err: unknown, depth = 0): void {
  const pad = "  ".repeat(depth);
  if (err instanceof Error) {
    console.error(`${pad}${err.name}: ${err.message}`);
    if ("query" in err && typeof err.query === "string") {
      console.error(`${pad}query: ${err.query.trim()}`);
    }
    if ("params" in err && Array.isArray(err.params) && err.params.length > 0) {
      console.error(`${pad}params:`, err.params);
    }
    if (err.cause !== undefined) {
      console.error(`${pad}caused by:`);
      printError(err.cause, depth + 1);
    }
    return;
  }
  console.error(`${pad}`, err);
}
