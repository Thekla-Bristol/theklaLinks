// Club nights — Thekla's Fatsoma page + Fatsoma's public JSON API.
import * as cheerio from 'cheerio';
import {
  get, getJSON, pool, debugSave, londonISO, fullYear, parse12h, clean, decodeEntities, MONTHS, absUrl,
} from './util.mjs';

export const FATSOMA_PAGE_URL = 'https://www.fatsoma.com/p/thekla';
const API = 'https://api.fatsoma.com/v1';
const BASE = 'https://www.fatsoma.com/';

// /e/nbi6f8pt/slug   or   /thekla/promotions/16xtm6e4/slug
const LINK_RE = /(?:fatsoma\.com)?\/(?:e|[a-z0-9_-]+\/promotions)\/([a-z0-9]{6,12})(?:\/([a-z0-9-]+))?/i;

/** Event links (with their vanity ids) listed on the Fatsoma page. */
export function parseFatsomaPage(html) {
  const $ = cheerio.load(html);
  const found = new Map();
  $('a[href]').each((_, a) => {
    const href = absUrl($(a).attr('href'), BASE);
    const m = href && LINK_RE.exec(new URL(href).pathname);
    if (!m || !/fatsoma\.com$/.test(new URL(href).hostname)) return;
    const id = m[1].toLowerCase();
    if (!found.has(id)) found.set(id, { id, url: href.split('?')[0] });
  });
  // Links can also live in embedded JSON / scripts.
  const raw = html.replace(/\\\//g, '/');
  for (const m of raw.matchAll(/https:\/\/www\.fatsoma\.com\/(?:e|[a-z0-9_-]+\/promotions)\/([a-z0-9]{6,12})\/[a-z0-9-]+/gi)) {
    const id = m[1].toLowerCase();
    if (!found.has(id)) found.set(id, { id, url: m[0] });
  }
  return [...found.values()];
}

/** cdn2.fatsoma.com/media/<key> → resized imgix URL */
export function fatsomaImage(assetUrl, size = 480) {
  if (!assetUrl) return null;
  const m = /\/media\/([^?]+)/.exec(assetUrl) || /imgix\.net\/([^?]+)/.exec(assetUrl);
  if (!m) return assetUrl;
  return `https://fatsoma.imgix.net/${m[1]}?w=${size}&h=${size}&fit=crop&auto=format,compress`;
}

export function eventFromApi(json, pageUrl) {
  const d = Array.isArray(json.data) ? json.data[0] : json.data;
  if (!d) return null;
  const a = d.attributes || {};
  if (!a['starts-at'] || !a.name) return null;
  const health = String(a.health || '').toLowerCase();
  return {
    source: 'fatsoma', type: 'club',
    title: clean(decodeEntities(a.name)), support: '',
    start: a['starts-at'], end: a['ends-at'] || null, timeKnown: true,
    ticketUrl: pageUrl || `${BASE}e/${a['vanity-name']}/${a['seo-name'] || ''}`,
    status: health.includes('cancel') ? 'cancelled' : health.includes('postpone') ? 'postponed'
      : a.expired ? 'past' : null,
    price: typeof a['price-min-with-fees'] === 'number' && a['price-min-with-fees'] > 0
      ? `£${(a['price-min-with-fees'] / 100).toFixed(2).replace(/\.00$/, '')}` : null,
    age: a['age-restrictions'] || null,
    image: fatsomaImage(a['asset-url']),
  };
}

/** Fallback: read an event page's og tags. "… at Thekla, East Mud Dock on 30th Sep 2026" */
export function eventFromPage(html, url) {
  const $ = cheerio.load(html);
  const ogTitle = decodeEntities($('meta[property="og:title"]').attr('content') || '');
  const m = /^(.*?)\s+at\s+Thekla.*?\bon\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i.exec(ogTitle);
  if (!m) return null;
  const body = clean($('body').text());
  const t = /\bat\s+(\d{1,2}(?::\d{2})?\s*[ap]m)/i.exec(body);
  const [h, mi] = (t && parse12h(t[1])) || [22, 0];
  return {
    source: 'fatsoma', type: 'club', title: clean(m[1]), support: '',
    start: londonISO(fullYear(m[4]), MONTHS[m[3].toLowerCase()], +m[2], h, mi),
    end: null, timeKnown: !!t, ticketUrl: url, status: null, price: null,
    image: fatsomaImage($('meta[property="og:image"]').attr('content')),
  };
}

export async function fetchFatsoma() {
  const r = await get(FATSOMA_PAGE_URL);
  await debugSave('fatsoma.html', r.text);
  if (!r.ok) throw new Error(`Fatsoma page HTTP ${r.status}`);
  const links = parseFatsomaPage(r.text);
  if (!links.length) throw new Error('Fatsoma page had 0 event links (layout change?)');

  const events = await pool(links, 4, async ({ id, url }) => {
    try {
      const json = await getJSON(`${API}/events?filter[vanity-name]=${encodeURIComponent(id)}`);
      const ev = eventFromApi(json, url);
      if (ev) return ev;
    } catch (e) {
      console.warn(`  Fatsoma API failed for ${id} (${e.message}); reading page instead`);
    }
    const p = await get(url, { tries: 2 });
    return p.ok ? eventFromPage(p.text, url) : null;
  });
  return events.filter(Boolean);
}
