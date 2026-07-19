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
      CREATE TABLE IF NOT EXISTS dashboards (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name       text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS dashboard_id uuid REFERENCES dashboards(id) ON DELETE CASCADE;
      -- Widgets saved before dashboards existed land in a per-user "Default".
      INSERT INTO dashboards (user_id, name)
      SELECT DISTINCT w.user_id, 'Default' FROM dashboard_widgets w
      WHERE w.dashboard_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM dashboards d WHERE d.user_id = w.user_id AND d.name = 'Default');
      UPDATE dashboard_widgets w SET dashboard_id = d.id
      FROM dashboards d
      WHERE w.dashboard_id IS NULL AND d.user_id = w.user_id AND d.name = 'Default';
      CREATE TABLE IF NOT EXISTS watchlist (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        security_id integer,                -- nullable: uncovered tickers have prices only
        symbol      text NOT NULL,          -- uppercase ticker as the user knows it
        added_at    timestamptz NOT NULL DEFAULT now(),
        removed_at  timestamptz             -- soft remove: history of adds/removes is the point
      );
      CREATE UNIQUE INDEX IF NOT EXISTS watchlist_active_unique
        ON watchlist (user_id, symbol) WHERE removed_at IS NULL;
      CREATE TABLE IF NOT EXISTS stock_interest_events (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol      text NOT NULL,
        kind        text NOT NULL,
        weight      smallint NOT NULL,      -- signed; stamped from kind at insert time
        context     jsonb,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS interest_user_symbol ON stock_interest_events (user_id, symbol);
      CREATE INDEX IF NOT EXISTS interest_user_recent ON stock_interest_events (user_id, created_at DESC);
    `);
  })();
  return ensured;
}
