import { readFile } from "node:fs/promises";

/**
 * Some companies file under a different CIK than the one the SEC ticker file
 * maps their ticker to. Example: the 2026 ExxonMobil holdco reorg gave XOM a
 * new CIK (2115436) that carries no us-gaap facts; the filing history lives
 * under the operating company's CIK (34088).
 *
 * data/cik-overrides.txt: "TICKER CIK" per line, # comments allowed.
 */
export async function loadCikOverrides(): Promise<Map<string, number>> {
  let text: string;
  try {
    text = await readFile("data/cik-overrides.txt", "utf8");
  } catch {
    return new Map();
  }
  const map = new Map<string, number>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [ticker, cik] = trimmed.split(/\s+/);
    const n = Number(cik);
    if (!ticker || !Number.isInteger(n) || n <= 0) throw new Error(`bad cik-overrides line: "${line}"`);
    map.set(ticker, n);
  }
  return map;
}

export function applyCikOverrides<T extends { ticker: string; cik: number }>(
  rows: T[],
  overrides: Map<string, number>,
  log: (msg: string) => void,
): T[] {
  return rows.map((r) => {
    const cik = overrides.get(r.ticker);
    if (cik === undefined || cik === r.cik) return r;
    log(`${r.ticker}: CIK override ${r.cik} -> ${cik}`);
    return { ...r, cik };
  });
}
