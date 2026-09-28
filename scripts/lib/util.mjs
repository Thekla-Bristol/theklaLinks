// Shared helpers: fetching, London time, text normalising.
import fs from 'node:fs/promises';
import path from 'node:path';

export const UA =
  'Mozilla/5.0 (compatible; TheklaLinksBot/1.0; +https://links.theklabristol.co.uk)';

const DEBUG_DIR = process.env.DEBUG_DIR || '';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch text with retries + timeout. Returns { ok, status, text }. */
export async function get(url, { tries = 3, timeout = 20000, accept = 'text/html' } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept, 'accept-language': 'en-GB,en;q=0.9' },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      const text = await res.text();
      clearTimeout(t);
      if (res.ok || res.status === 404) return { ok: res.ok, status: res.status, text };
      last = new Error(`HTTP ${res.status} for ${url}`);
    } catch (e) {
      clearTimeout(t);
      last = e;
    }
    await sleep(800 * (i + 1));
  }
  throw last;
}

export async function getJSON(url, opts = {}) {
  const r = await get(url, { ...opts, accept: 'application/vnd.api+json, application/json' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return JSON.parse(r.text);
}

export async function debugSave(name, content) {
  if (!DEBUG_DIR) return;
  await fs.mkdir(DEBUG_DIR, { recursive: true });
  await fs.writeFile(path.join(DEBUG_DIR, name), content);
}

/** Run async fn over items with limited concurrency. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await fn(items[idx], idx);
        } catch (e) {
          out[idx] = undefined;
          console.warn('  ! ', e.message);
        }
      }
    })
  );
  return out;
}

// ---------- Time (everything is Europe/London) ----------
const TZ = 'Europe/London';

function tzOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** London wall-clock → ISO string with offset, e.g. 2026-10-01T19:00:00+01:00 */
export function londonISO(y, m, d, hh = 0, mm = 0) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  let off = tzOffsetMinutes(guess);
  off = tzOffsetMinutes(new Date(guess.getTime() - off * 60000));
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** YYYY-MM-DD of an instant, in London */
export function londonDay(isoOrDate) {
  const d = new Date(isoOrDate);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
}

export const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function fullYear(y) {
  y = +y;
  return y < 100 ? 2000 + y : y;
}

/** "10:00pm" / "9:30 PM" → [22, 0] */
export function parse12h(s) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(s || '');
  if (!m) return null;
  let h = +m[1] % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  return [h, +(m[2] || 0)];
}

// ---------- Text ----------
export const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

export function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#8211;/g, '–').replace(/&#8217;/g, '’')
    .replace(/&nbsp;/g, ' ');
}

export function slugify(s) {
  return (s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function titleFromSlug(slug) {
  return slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const STOP = new Set(['the', 'a', 'an', 'and', 'at', 'of', 'live', 'presents', 'tour', 'bristol', 'thekla', 'plus', 'special', 'guests', 'tickets']);
export function tokens(s) {
  return new Set(slugify(s).split('-').filter((w) => w.length > 1 && !STOP.has(w)));
}

/** Rough similarity between two event titles (0..1). */
export function titleSimilarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

export function absUrl(href, base) {
  try { return new URL(href, base).href; } catch { return null; }
}
