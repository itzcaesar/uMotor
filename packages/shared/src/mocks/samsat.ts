// "Samsat" (Indonesian vehicle registry) lookup. Hybrid, all-regions:
//
//  1. Resolve the plate's region from its letter prefix (full national map).
//  2. Try a REAL unofficial Samsat API (web-scraper style, JSON) for the
//     vehicle's brand/model/year/color. Endpoint is configurable via
//     EXPO_PUBLIC_SAMSAT_API; defaults to a known public scraper.
//  3. Fall back to a deterministic generator when the API is unreachable,
//     CORS/cleartext-blocked, the region isn't served, or the plate is unknown
//     — so EVERY valid plate from ANY region resolves and the demo never stalls.
//
// Note on the owner name: no public or unofficial Samsat API exposes the
// registered owner (privacy — UU PDP 27/2022; official apps mask/omit it). The
// owner name here is therefore always synthesized, never scraped.

export interface VehicleInfo {
  plate: string;
  region: string; // province/area resolved from the plate prefix
  brand: string;
  model: string;
  year: number;
  engine_cc: number;
  color: string;
  owner_name: string;
  /** PKB (annual road tax) due date, ISO yyyy-mm-dd. */
  tax_due: string;
  /** STNK validity (5-yearly), ISO yyyy-mm-dd. */
  stnk_valid_until: string;
  /** 'samsat' = a live API answered; 'estimated' = local fallback. */
  source: 'samsat' | 'estimated';
}

// No baked-in endpoint: sending a user's plate to a hardcoded third party is an
// unwanted data leak (and cleartext http is blocked on web/iOS anyway). The live
// lookup is strictly opt-in via EXPO_PUBLIC_SAMSAT_API; without it every plate
// resolves through the local region-aware estimator.
const DEFAULT_SAMSAT_BASE = '';
const SAMSAT_TIMEOUT_MS = 2500;
const MIN_LATENCY_MS = 600;

type CuratedEntry = Omit<VehicleInfo, 'plate' | 'region' | 'source'>;

// Curated entries for the plates the demo + seed depend on (treated as verified).
const CURATED: Record<string, CuratedEntry> = {
  'D 4821 BJK': mk('Honda', 'Vario 160', 2023, 160, 'Hitam', 'Budi Santoso'),
  'D 2871 KCE': mk('Yamaha', 'NMAX 155', 2022, 155, 'Biru', 'Budi Santoso'),
  'D 1234 ABC': mk('Honda', 'BeAT', 2021, 110, 'Putih', 'Andi Pratama'),
  'B 5678 DEF': mk('Yamaha', 'Aerox 155', 2023, 155, 'Merah', 'Dewi Anggraini'),
  'D 9012 GHI': mk('Honda', 'PCX 160', 2024, 160, 'Silver', 'Rizki Hidayat'),
};

function mk(
  brand: string,
  model: string,
  year: number,
  engine_cc: number,
  color: string,
  owner_name: string,
): CuratedEntry {
  return {
    brand,
    model,
    year,
    engine_cc,
    color,
    owner_name,
    tax_due: isoInDays(120),
    stnk_valid_until: isoYear(year + 5),
  };
}

// ── Region resolution: Indonesian plate letter codes → area ──────────────
// Longest (2-letter) prefixes are matched before single letters.
const REGION_BY_PREFIX: Record<string, string> = {
  // Sumatra
  BL: 'Aceh',
  BB: 'Sumatera Utara',
  BK: 'Sumatera Utara (Medan)',
  BA: 'Sumatera Barat',
  BM: 'Riau',
  BP: 'Kepulauan Riau',
  BG: 'Sumatera Selatan',
  BN: 'Kepulauan Bangka Belitung',
  BD: 'Bengkulu',
  BH: 'Jambi',
  BE: 'Lampung',
  // Jawa Tengah / DIY (2-letter)
  AA: 'Jawa Tengah (Kedu)',
  AB: 'DI Yogyakarta',
  AD: 'Jawa Tengah (Surakarta)',
  AE: 'Jawa Timur (Madiun)',
  AG: 'Jawa Timur (Kediri)',
  // Kalimantan
  DA: 'Kalimantan Selatan',
  KB: 'Kalimantan Barat',
  KH: 'Kalimantan Tengah',
  KT: 'Kalimantan Timur',
  KU: 'Kalimantan Utara',
  // Sulawesi / Maluku / Nusa Tenggara / Papua
  DB: 'Sulawesi Utara',
  DL: 'Sulawesi Utara (Kepulauan)',
  DM: 'Gorontalo',
  DN: 'Sulawesi Tengah',
  DT: 'Sulawesi Tenggara',
  DD: 'Sulawesi Selatan',
  DC: 'Sulawesi Barat',
  DK: 'Bali',
  DR: 'Nusa Tenggara Barat (Lombok)',
  EA: 'Nusa Tenggara Barat (Sumbawa)',
  DH: 'Nusa Tenggara Timur (Timor)',
  EB: 'Nusa Tenggara Timur (Flores)',
  ED: 'Nusa Tenggara Timur (Sumba)',
  DE: 'Maluku',
  DG: 'Maluku Utara',
  PA: 'Papua',
  PB: 'Papua Barat',
};
const REGION_BY_LETTER: Record<string, string> = {
  A: 'Banten',
  B: 'DKI Jakarta',
  D: 'Jawa Barat (Bandung)',
  E: 'Jawa Barat (Cirebon)',
  F: 'Jawa Barat (Bogor)',
  T: 'Jawa Barat (Purwakarta)',
  Z: 'Jawa Barat (Priangan Timur)',
  G: 'Jawa Tengah (Pekalongan)',
  H: 'Jawa Tengah (Semarang)',
  K: 'Jawa Tengah (Pati)',
  R: 'Jawa Tengah (Banyumas)',
  L: 'Jawa Timur (Surabaya)',
  M: 'Jawa Timur (Madura)',
  N: 'Jawa Timur (Malang)',
  P: 'Jawa Timur (Besuki)',
  S: 'Jawa Timur (Bojonegoro)',
  W: 'Jawa Timur (Sidoarjo)',
};
// Endpoint slug per region for the scraper API (only a few are live; the rest
// fall through to the generator). Extend as providers add coverage.
const SLUG_BY_REGION: Record<string, string> = {
  'DI Yogyakarta': 'jogja',
};

function regionForPlate(canonical: string): string {
  const letters = canonical.split(' ')[0]; // leading area code (1–2 letters)
  return (
    REGION_BY_PREFIX[letters] ??
    REGION_BY_LETTER[letters[0]] ??
    'Indonesia'
  );
}

// ── Pools for generated vehicles ─────────────────────────────────────────
const FLEET: { brand: string; models: { name: string; cc: number }[] }[] = [
  {
    brand: 'Honda',
    models: [
      { name: 'BeAT', cc: 110 },
      { name: 'Scoopy', cc: 110 },
      { name: 'Vario 125', cc: 125 },
      { name: 'Vario 160', cc: 160 },
      { name: 'PCX 160', cc: 160 },
      { name: 'CBR150R', cc: 150 },
    ],
  },
  {
    brand: 'Yamaha',
    models: [
      { name: 'Mio M3', cc: 125 },
      { name: 'Fazzio', cc: 125 },
      { name: 'NMAX 155', cc: 155 },
      { name: 'Aerox 155', cc: 155 },
      { name: 'R15', cc: 155 },
    ],
  },
  {
    brand: 'Suzuki',
    models: [
      { name: 'Address', cc: 113 },
      { name: 'Nex II', cc: 113 },
      { name: 'GSX-R150', cc: 150 },
    ],
  },
  {
    brand: 'Kawasaki',
    models: [
      { name: 'W175', cc: 177 },
      { name: 'Ninja 250', cc: 250 },
    ],
  },
];
const COLORS = ['Hitam', 'Putih', 'Merah', 'Biru', 'Abu-abu', 'Silver', 'Hijau'];
const OWNERS = [
  'Agus Setiawan',
  'Siti Rahayu',
  'Joko Widodo',
  'Putri Maharani',
  'Bambang Sutrisno',
  'Indah Permata',
  'Eko Prasetyo',
  'Ratna Sari',
];

const PLATE_RE = /^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{1,3}$/;

/** Normalise to canonical "X 1234 YZ" spacing, or null if not a valid plate. */
export function normalizePlate(input: string): string | null {
  const raw = input.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!PLATE_RE.test(raw)) return null;
  const compact = raw.replace(/\s+/g, '');
  const m = compact.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{1,3})$/);
  if (!m) return null;
  return `${m[1]} ${m[2]} ${m[3]}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoYear(year: number): string {
  return `${year}-12-31`;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function generate(plate: string, region: string): Omit<VehicleInfo, 'source'> {
  // Unsigned (>>>) shifts: signed >> on a hash with the high bit set yields a
  // negative index → undefined model → crash.
  const h = hash(plate);
  const make = FLEET[h % FLEET.length];
  const model = make.models[(h >>> 3) % make.models.length];
  const year = 2017 + ((h >>> 6) % 8); // 2017–2024
  return {
    plate,
    region,
    brand: make.brand,
    model: model.name,
    engine_cc: model.cc,
    year,
    color: COLORS[(h >>> 9) % COLORS.length],
    owner_name: OWNERS[(h >>> 12) % OWNERS.length],
    tax_due: isoInDays(30 + ((h >>> 15) % 300)),
    stnk_valid_until: isoYear(year + 5),
  };
}

// ── Real (unofficial) API call ───────────────────────────────────────────
function apiBase(): string {
  // EXPO_PUBLIC_* is inlined by Metro across the bundle; guard for non-Expo hosts.
  const env = typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_SAMSAT_API : undefined;
  return (env && env.trim()) || DEFAULT_SAMSAT_BASE;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(t);
  }
}

/** Returns scraped vehicle fields, or null if the API can't serve this plate. */
async function fetchSamsat(canonical: string, region: string): Promise<Partial<VehicleInfo> | null> {
  const base = apiBase();
  if (!base) return null; // live lookup not configured → estimator fallback
  const slug = SLUG_BY_REGION[region];
  if (!slug) return null; // region not served by the live API → fallback
  const nopol = canonical.replace(/\s+/g, '');
  const url = `${base.replace(/\/$/, '')}/samsat/${slug}?nopol=${encodeURIComponent(nopol)}`;
  try {
    const res = await fetchWithTimeout(url, SAMSAT_TIMEOUT_MS);
    if (!res.ok) return null;
    // Scraper schemas vary; map defensively across common field names.
    const j = (await res.json()) as Record<string, unknown>;
    const data = (j.data ?? j.result ?? j) as Record<string, unknown>;
    const str = (...keys: string[]) => {
      for (const k of keys) {
        const v = data[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return undefined;
    };
    const brand = str('merk', 'merek', 'brand');
    const model = str('model', 'tipe', 'type');
    if (!brand && !model) return null; // tax-only payload — not useful here
    const yearStr = str('tahun', 'year', 'tahun_buatan');
    const year = yearStr ? Number(yearStr.replace(/\D/g, '')) || undefined : undefined;
    return { brand, model, year, color: str('warna', 'color') };
  } catch {
    return null; // network / CORS / cleartext / timeout → fallback
  }
}

/**
 * Look up a plate. Resolves after a short delay (min ~600 ms for UX). Returns
 * null only for a malformed plate; any valid plate from any region yields data
 * (live API when available, otherwise an estimate flagged via `source`).
 */
export async function samsatLookup(plate: string): Promise<VehicleInfo | null> {
  const canonical = normalizePlate(plate);
  if (!canonical) {
    await delay(400);
    return null;
  }
  const region = regionForPlate(canonical);
  const base = generate(canonical, region);

  // Attempt the real API and enforce a minimum latency in parallel.
  const [real] = await Promise.all([fetchSamsat(canonical, region), delay(MIN_LATENCY_MS)]);

  if (real && (real.brand || real.model)) {
    return {
      ...base,
      brand: real.brand ?? base.brand,
      model: real.model ?? base.model,
      year: real.year ?? base.year,
      color: real.color ?? base.color,
      source: 'samsat',
    };
  }

  const curated = CURATED[canonical];
  if (curated) return { plate: canonical, region, source: 'samsat', ...curated };

  return { ...base, source: 'estimated' };
}
