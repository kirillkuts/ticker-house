import { Pool } from "pg";

// App data (users, sessions, chats, dashboards) lives in Postgres; ClickHouse
// keeps the market data. One pool per process, survives Next.js dev reloads.

const globalForDb = globalThis as unknown as { pgPool?: Pool };

export function db(): Pool {
  globalForDb.pgPool ??= new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgresql://ticker:ticker@localhost:5432/ticker_house",
    max: 10,
  });
  return globalForDb.pgPool;
}

let ensured: Promise<void> | null = null;

// Idempotent schema bootstrap, same pattern the ClickHouse tables used.
export function ensureSchema(): Promise<void> {
  ensured ??= (async () => {
    await db().query(`
      CREATE TABLE IF NOT EXISTS users (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email         text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token      text PRIMARY KEY,
        user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chats (
        chat_id    text PRIMARY KEY,
        user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title      text NOT NULL,
        messages   text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS chats_user_recent ON chats (user_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS dashboard_widgets (
        widget_id text PRIMARY KEY,
        user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tool      text NOT NULL,
        input     text NOT NULL,
        added_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS widgets_user_added ON dashboard_widgets (user_id, added_at);
    `);
  })();
  return ensured;
}
