// Live news for the in-app News viewer (consumer). Pulls the newest automotive
// + Astra-related headlines so the rider never has to leave the app.
//
// Source: ANTARA public RSS (a reliable Indonesian wire), fetched through
// rss2json which returns JSON + CORS headers (so it works on native AND the web
// smoke build). We take the automotive feed wholesale and pull only the
// Astra-related items out of the economy feed. If the network/feed is
// unavailable we fall back to a small curated list so the demo never shows an
// empty screen.

export type NewsCategory = 'Otomotif' | 'Astra';

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  link: string;
  publishedAt: number; // epoch ms (0 if unknown)
  snippet: string;
  image?: string;
  category: NewsCategory;
}

// Astra Group brands → tag a story as "Astra" rather than generic automotive.
const ASTRA_RE = /\b(astra|astrapay|honda|daihatsu|isuzu|astra\s*honda)\b/i;

interface FeedConfig {
  url: string;
  source: string;
  // Decide the category for an item from its text — return null to drop it.
  assign: (text: string) => NewsCategory | null;
}

const FEEDS: FeedConfig[] = [
  // Automotive wire — keep everything; Astra-brand stories get the Astra tag.
  {
    url: 'https://www.antaranews.com/rss/otomotif.xml',
    source: 'ANTARA Otomotif',
    assign: (t) => (ASTRA_RE.test(t) ? 'Astra' : 'Otomotif'),
  },
  // Economy wire — keep ONLY Astra-related corporate news.
  {
    url: 'https://www.antaranews.com/rss/ekonomi.xml',
    source: 'ANTARA Ekonomi',
    assign: (t) => (/\bastra\b/i.test(t) ? 'Astra' : null),
  },
];

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
};
function strip(html = ''): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstImg(html = ''): string | undefined {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1];
}

interface Rss2JsonItem {
  guid?: string;
  link?: string;
  title?: string;
  pubDate?: string;
  author?: string;
  description?: string;
  content?: string;
  thumbnail?: string;
  enclosure?: { link?: string };
}

function parseDate(s?: string): number {
  if (!s) return 0;
  // ANTARA emits "YYYY-MM-DD HH:MM:SS" (no 'T'); normalise for Date.parse.
  return Date.parse(s.includes('T') ? s : s.replace(' ', 'T')) || Date.parse(s) || 0;
}

async function fetchFeed(cfg: FeedConfig): Promise<NewsArticle[]> {
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(cfg.url)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`news ${res.status}`);
  const json = (await res.json()) as { status?: string; items?: Rss2JsonItem[] };
  if (json.status !== 'ok' || !Array.isArray(json.items)) throw new Error('news feed invalid');
  const out: NewsArticle[] = [];
  json.items.forEach((it, i) => {
    const title = strip(it.title);
    const snippet = strip(it.description || it.content);
    const category = cfg.assign(`${title} ${snippet}`);
    if (!category || !it.link) return;
    out.push({
      id: it.guid || it.link || `${cfg.source}-${i}`,
      title,
      source: cfg.source,
      link: it.link,
      publishedAt: parseDate(it.pubDate),
      snippet: snippet.slice(0, 170),
      image: it.thumbnail || it.enclosure?.link || firstImg(it.description) || firstImg(it.content),
      category,
    });
  });
  return out;
}

/** Newest automotive + Astra headlines, merged + de-duped, newest first. */
export async function fetchNews(): Promise<NewsArticle[]> {
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const items = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  if (!items.length) return FALLBACK_NEWS;

  items.sort((a, b) => b.publishedAt - a.publishedAt);
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const a of items) {
    const key = a.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out.length ? out : FALLBACK_NEWS;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Recent → "x menit/jam lalu"; older → absolute "12 Des 2025". */
export function formatWhen(ms: number, now: number): string {
  if (!ms) return '';
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return 'Baru saja';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? 'Kemarin' : `${d} hari lalu`;
  const dt = new Date(ms);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

// Offline/failure fallback — keeps the demo populated even with no network.
const FALLBACK_NEWS: NewsArticle[] = [
  { id: 'fb1', category: 'Astra', source: 'AstraPay', link: 'https://www.astrapay.com/', publishedAt: 0,
    title: 'AstraPay perluas pembayaran digital untuk ekosistem otomotif',
    snippet: 'Dompet digital AstraPay menambah kanal pembayaran servis dan sparepart untuk pemilik kendaraan.' },
  { id: 'fb2', category: 'Otomotif', source: 'AHM', link: 'https://www.astra-honda.com/', publishedAt: 0,
    title: 'Tips perawatan motor matic agar irit dan awet',
    snippet: 'Servis rutin tepat interval, cek tekanan ban, dan ganti oli berkala menjaga performa motor harian.' },
  { id: 'fb3', category: 'Astra', source: 'Astra International', link: 'https://www.astra.co.id/', publishedAt: 0,
    title: 'Astra dorong digitalisasi layanan purna jual kendaraan',
    snippet: 'Grup Astra memperluas layanan bengkel dan booking servis digital di seluruh Indonesia.' },
  { id: 'fb4', category: 'Otomotif', source: 'Otomotif', link: 'https://oto.detik.com/', publishedAt: 0,
    title: 'Cara cek kondisi ban motor sebelum berkendara jauh',
    snippet: 'Periksa kembang ban, tekanan angin, dan retakan dinding ban untuk berkendara lebih aman.' },
];
