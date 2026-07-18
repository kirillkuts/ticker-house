// SIC division ranges -> coarse sector/industry labels. v1 granularity.
const RANGES: [number, number, string][] = [
  [100, 999, "Agriculture"],
  [1000, 1499, "Mining"],
  [1500, 1799, "Construction"],
  [2000, 3999, "Manufacturing"],
  [4000, 4999, "Transportation & Utilities"],
  [5000, 5199, "Wholesale Trade"],
  [5200, 5999, "Retail Trade"],
  [6000, 6799, "Finance & Real Estate"],
  [7000, 8999, "Services"],
  [9100, 9729, "Public Administration"],
];

export function sicToSector(sic: number): string {
  const hit = RANGES.find(([lo, hi]) => sic >= lo && sic <= hi);
  return hit ? hit[2] : "";
}

// Industry: use the SIC description itself at v1 granularity.
export function sicToIndustry(sicDescription: string): string {
  return sicDescription
    .toLowerCase()
    .replace(/(^|[\s\/&-])\w/g, (c) => c.toUpperCase());
}
