import { createClient } from "@clickhouse/client";

export function chClient() {
  return createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER ?? "ticker",
    password: process.env.CLICKHOUSE_PASSWORD ?? "ticker",
    database: process.env.CLICKHOUSE_DB ?? "ticker_house",
  });
}

export async function queryRows<T>(query: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const ch = chClient();
  try {
    const rs = await ch.query({ query, query_params: params, format: "JSONEachRow" });
    return await rs.json<T>();
  } finally {
    await ch.close();
  }
}
