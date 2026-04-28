# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `bun run dev` — runs the Hono server with `--hot` reload.
- `bun run start` — runs the server (production-style).
- `bun run lint` / `lint:fix` — `oxlint` (not ESLint). Categories: correctness=error.
- `bun run format` / `format:check` — `oxfmt` (not Prettier).
- `bun run db:generate` — generate a new SQL migration in `drizzle/` from `src/schema.ts`.
- `bun run db:migrate` — apply migrations via drizzle-kit (note: the server also auto-migrates at startup, see Architecture).
- `bun run db:push` — push schema directly without a migration file (dev-only shortcut).
- `bun run db:studio` — open Drizzle Studio against the configured DB.

No test framework is configured.

## Architecture

This is a server-rendered, htmx-driven web app on Bun. The stack is unusual enough to call out:

- **Runtime: Bun.** `src/index.tsx` exports a default object `{ port, fetch }` consumed by Bun's built-in HTTP server — there is no separate `serve()` call. `bun run --hot` provides hot reload.
- **JSX is Hono JSX, not React.** `tsconfig.json` sets `"jsxImportSource": "hono/jsx"`. Components are typed as `FC` from `hono/jsx`. Don't import from `react`. JSX is rendered server-side via `c.html(<Component/>)` and returned as HTML — there is no client-side JS framework.
- **Interactivity is htmx.** The client only loads `htmx.min.js` (served from `node_modules` via `serveStatic`). Forms/buttons use `hx-*` attributes; handlers return HTML *fragments* (e.g. `<MessageList/>`) that htmx swaps into the DOM. When adding a new endpoint, decide: full page (return `<Page/>`) vs partial (return just the fragment matching the `hx-target`).
- **DB: Drizzle + libsql.** Local dev uses a file-backed SQLite (`local.db`); production points `TURSO_DATABASE_URL` at Turso. Same `@libsql/client` works for both. Drizzle dialect in `drizzle.config.ts` is `"turso"`.
- **Migrations run at import time.** `src/db.ts` calls `await migrate(db, { migrationsFolder: "./drizzle" })` at the top level — the server applies pending migrations on startup. After editing `src/schema.ts`, run `bun run db:generate` to produce a new SQL file under `drizzle/`; the next server start will apply it. Don't hand-edit generated migration SQL.
- **Styling: pico.css v2.** `pico.min.css` is served directly from `node_modules/@picocss/pico/css/` via `serveStatic` — no build step. Use semantic HTML (`<main class="container">`, `<form role="group">`, etc.) and pico's defaults rather than utility classes.

### Request flow (current app)
`GET /` renders the full `<Page/>` with the message list. `POST /messages` inserts a row and returns only the `<MessageList/>` fragment, which htmx swaps into `#messages` via `hx-swap="outerHTML"`. This pattern (full page on initial GET, fragment on htmx-driven mutation) is the convention to follow for new features.

## Environment

`.env` provides `TURSO_DATABASE_URL` (defaults to `file:local.db`) and optional `TURSO_AUTH_TOKEN`. `PORT` defaults to 3000.
