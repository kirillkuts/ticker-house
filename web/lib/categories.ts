// Curated coarse grouping of the covered universe (task 031). SEC industry
// strings are precise but read like tax forms ("Services-Prepackaged
// Software"); tiles should read "Tech". Keyed by the exact industry strings
// present in `securities` — an unmapped industry falls into no category and
// simply doesn't appear on a tile (log-free by design: coverage is checked in
// the verify script, not at runtime).

export interface Category {
  slug: string;
  name: string;
  blurb: string;
}

export const CATEGORIES: Category[] = [
  { slug: "tech", name: "Tech", blurb: "software, semiconductors, internet platforms and payments rails" },
  { slug: "healthcare", name: "Healthcare", blurb: "pharma, biotech, insurers and medical devices" },
  { slug: "financials", name: "Financials", blurb: "banks, brokers, insurers, exchanges and real estate" },
  { slug: "consumer", name: "Consumer & Media", blurb: "retailers, brands, restaurants, autos, travel and entertainment" },
  { slug: "industrials", name: "Industrials", blurb: "machinery, electrical equipment, chemicals and railroads" },
  { slug: "aerospace", name: "Aerospace & Defense", blurb: "engines, avionics and defense systems" },
  { slug: "energy", name: "Energy", blurb: "oil & gas majors" },
  { slug: "utilities", name: "Utilities & Telecom", blurb: "power producers and phone networks" },
];

export const categoryBySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));

const INDUSTRY_TO_SLUG: Record<string, string> = {
  // Tech
  "Semiconductors & Related Devices": "tech",
  "Services-Prepackaged Software": "tech",
  "Services-Computer Programming, Data Processing, Etc.": "tech",
  "Services-Computer Processing & Data Preparation": "tech",
  "Services-Business Services, Nec": "tech", // V, MA, UBER, ACN
  "Computer Communications Equipment": "tech",
  "Computer Peripheral Equipment, Nec": "tech",
  "Computer & Office Equipment": "tech",
  "Electronic Computers": "tech",
  "Radio & Tv Broadcasting & Communications Equipment": "tech",
  "Optical Instruments & Lenses": "tech", // KLAC
  "Special Industry Machinery, Nec": "tech", // LRCX
  // Healthcare
  "Pharmaceutical Preparations": "healthcare",
  "Biological Products, (no Diagnostic Substances)": "healthcare",
  "Hospital & Medical Service Plans": "healthcare",
  "Surgical & Medical Instruments & Apparatus": "healthcare",
  "Orthopedic, Prosthetic & Surgical Appliances & Supplies": "healthcare",
  "Electromedical & Electrotherapeutic Apparatus": "healthcare",
  "Measuring & Controlling Devices, Nec": "healthcare", // TMO
  // Financials
  "National Commercial Banks": "financials",
  "Security Brokers, Dealers & Flotation Companies": "financials",
  "Security & Commodity Brokers, Dealers, Exchanges & Services": "financials",
  "Fire, Marine & Casualty Insurance": "financials",
  "Finance Services": "financials",
  "Services-Consumer Credit Reporting, Collection Agencies": "financials",
  "Real Estate Investment Trusts": "financials",
  // Consumer & Media
  "Retail-Variety Stores": "consumer",
  "Retail-Lumber & Other Building Materials Dealers": "consumer",
  "Retail-Family Clothing Stores": "consumer",
  "Retail-Eating  Places": "consumer",
  "Retail-Eating & Drinking Places": "consumer",
  "Retail-Catalog & Mail-Order Houses": "consumer", // AMZN
  Beverages: "consumer",
  Cigarettes: "consumer",
  "Soap, Detergents, Cleang Preparations, Perfumes, Cosmetics": "consumer",
  "Rubber & Plastics Footwear": "consumer",
  "Motor Vehicles & Passenger Car Bodies": "consumer", // TSLA
  "Services-Miscellaneous Amusement & Recreation": "consumer", // DIS
  "Services-Video Tape Rental": "consumer", // NFLX
  "Transportation Services": "consumer", // BKNG
  // Industrials
  "Construction Machinery & Equip": "industrials",
  "Farm Machinery & Equipment": "industrials",
  "Misc Industrial & Commercial Machinery & Equipment": "industrials",
  "Electronic & Other Electrical Equipment (no Computer Equip)": "industrials",
  "Industrial Inorganic Chemicals": "industrials",
  "Railroads, Line-Haul Operating": "industrials",
  // Aerospace & Defense
  "Aircraft Engines & Engine Parts": "aerospace",
  "Guided Missiles & Space Vehicles & Parts": "aerospace",
  // Energy
  "Petroleum Refining": "energy",
  // Utilities & Telecom
  "Electric Services": "utilities",
  "Electric & Other Services Combined": "utilities",
  "Telephone Communications (no Radiotelephone)": "utilities",
};

// Filings with an empty/unmapped industry string, placed by hand.
const TICKER_OVERRIDES: Record<string, string> = {
  MRSH: "financials", // Marsh & McLennan, insurance broking; industry blank in the source
};

export function categorySlugOf(ticker: string, industry: string): string | null {
  return TICKER_OVERRIDES[ticker.toUpperCase()] ?? INDUSTRY_TO_SLUG[industry] ?? null;
}
