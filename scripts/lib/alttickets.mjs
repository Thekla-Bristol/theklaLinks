// Gigs — Alt Tickets venue listing for Thekla.
import * as cheerio from 'cheerio';
import { findCards, textLines, nearestTitle } from './cards.mjs';
import {
  get, pool, debugSave, londonISO, fullYear, clean, decodeEntities, slugify, titleFromSlug, absUrl,
} from './util.mjs';

export const ALT_VENUE_URL = 'https://www.alttickets.com/venue/bristol/thekla';
const BASE = 'https://www.alttickets.com/';

// "19:00 | 01/10/26"
const DATE_RE = /(\d{1,2}):(\d{2})\s*\|\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
// https://www.alttickets.com/brother-strut-tickets/bristol-thekla/2026-10-03-18-30
const URL_RE = /alttickets\.com\/([a-z0-9-]+?)-tickets\/bristol-thekla\/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/i;

const NOISE = /^(bristol\s*-\s*thekla|book tickets|buy tickets|sold out|artist reminder|more info|info|reminder|get tickets|on sale.*|tickets|waiting list|join waiting list|few tickets left|cancelled|postponed|rescheduled|new date.*|\|)$/i;

export function parseAltListing(html) {
  const $ = cheerio.load(html);
  const events = new Map();

  for (const { card, dateEl, match } of findCards($, DATE_RE)) {
    const [, hh, mm, d, m, y] = match;
    const $c = $(card);
    const link = $c.find('a[href]').toArray().map((a) => absUrl($(a).attr('href'), BASE)).find((h) => h && URL_RE.test(h));

    const lines = textLines($, card).filter((l) => !DATE_RE.test(l) && !NOISE.test(l));
    let title = clean(nearestTitle($, card, dateEl, (t) => NOISE.test(t) || DATE_RE.test(t) || /^(support|plus|with)\b/i.test(t)));
    if (!title) title = lines[0] || '';
    if (!title && link) title = titleFromSlug(URL_RE.exec(link)[1]);
    if (!title) continue;

    const support = lines.find((l) => /^(support|plus|with|\+)\b/i.test(l) && l !== title) || '';
    const text = $c.text();
    const status = /sold\s*out/i.test(text) ? 'soldout'
      : /cancel/i.test(text) ? 'cancelled'
      : /postpon|rescheduled/i.test(text) ? 'postponed'
      : /few tickets|limited/i.test(text) ? 'low'
      : /pre-?sale/i.test(text) && !link ? 'presale'
      : null;

    const start = londonISO(fullYear(y), +m, +d, +hh, +mm);
    const key = `${start}|${slugify(title)}`;
    if (events.has(key)) {
      // keep the richer duplicate (e.g. "Recently Announced" + "Full Listings")
      const prev = events.get(key);
      prev.ticketUrl ||= link || null;
      prev.support ||= support;
      prev.status ||= status;
      continue;
    }
    events.set(key, {
      source: 'alttickets', type: 'gig', title: decodeEntities(title), support: decodeEntities(support),
      start, timeKnown: true, ticketUrl: link || null, status, image: null,
    });
  }

  // Safety net: any ticket link on the page that the card pass missed.
  $('a[href]').each((_, a) => {
    const href = absUrl($(a).attr('href'), BASE);
    const m = href && URL_RE.exec(href);
    if (!m) return;
    const [, slug, y, mo, d, hh, mm] = m;
    const start = londonISO(+y, +mo, +d, +hh, +mm);
    const already = [...events.values()].some((e) => e.ticketUrl === href || (e.start === start && slugify(e.title).startsWith(slug.slice(0, 8))));
    if (already) return;
    const t = clean($(a).text());
    events.set(`${start}|${slug}`, {
      source: 'alttickets', type: 'gig',
      title: t && !NOISE.test(t) && t.length > 2 ? t : titleFromSlug(slug),
      support: '', start, timeKnown: true, ticketUrl: href, status: null, image: null,
    });
  });

  return [...events.values()];
}

/** Pull artwork + price from an Alt Tickets event page. */
export function parseAltEventPage(html) {
  const $ = cheerio.load(html);
  const og = $('meta[property="og:image"]').attr('content') || null;
  let banner = null;
  $('img[src]').each((_, img) => {
    const s = $(img).attr('src');
    if (!banner && /\/images\/campaign\//.test(s)) banner = absUrl(s, BASE);
  });
  const text = clean($('body').text());
  const price = /£\s?(\d+(?:\.\d{2})?)\s*inc/i.exec(text);
  const age = /Age restriction:?\s*(\d{1,2}\+|all ages|under \d+s?[^.,;]*)/i.exec(text);
  const finish = /(?:expected\s+)?finish(?:\s+time)?:?\s*(\d{1,2})[:.](\d{2})/i.exec(text);
  return {
    image: og || banner,
    imageLarge: banner || og,
    price: price ? `£${price[1]}` : null,
    age: age ? age[1].replace(/^all ages$/i, 'All ages') : null,
    finish: finish ? [+finish[1], +finish[2]] : null,
    soldOut: /sold\s*out/i.test(text) && !/book tickets/i.test(text),
  };
}

export async function fetchAlt({ enrichUntil }) {
  const r = await get(ALT_VENUE_URL);
  await debugSave('alttickets.html', r.text);
  if (!r.ok) throw new Error(`Alt Tickets listing HTTP ${r.status}`);
  const events = parseAltListing(r.text);
  if (!events.length) throw new Error('Alt Tickets listing parsed 0 events (layout change?)');

  // Enrich upcoming events with artwork (and price) from each event page.
  const toEnrich = events.filter((e) => new Date(e.start) <= enrichUntil);
  await pool(toEnrich, 4, async (e) => {
    let url = e.ticketUrl;
    if (!url) {
      // Sold-out events have no link on the listing; the page usually still exists.
      const dt = e.start.slice(0, 16).replace(/[T:]/g, '-');
      url = `${BASE}${slugify(e.title)}-tickets/bristol-thekla/${dt}`;
    }
    const p = await get(url, { tries: 2 });
    if (!p.ok) return;
    const info = parseAltEventPage(p.text);
    e.image = info.image;
    e.imageLarge = info.imageLarge;
    e.price = info.price;
    e.age = info.age;
    if (info.finish) {
      // finish time is on the same evening (or just after midnight)
      const [h, m] = info.finish;
      const d = new Date(e.start);
      const day = e.start.slice(0, 10).split('-').map(Number);
      let end = londonISO(day[0], day[1], day[2], h, m);
      if (new Date(end) <= d) end = new Date(new Date(end).getTime() + 86400e3).toISOString();
      e.end = end;
    }
  });
  return events;
}
