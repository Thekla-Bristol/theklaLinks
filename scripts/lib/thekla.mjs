// Backup source: theklabristol.co.uk gig + club guides.
// Used to (a) add events missing from the ticket sites and (b) find the Thekla
// event page for events with no ticket link.
import * as cheerio from 'cheerio';
import { findCards, textLines, nearestTitle } from './cards.mjs';
import { get, debugSave, londonISO, fullYear, parse12h, clean, decodeEntities, MONTHS, absUrl } from './util.mjs';

const BASE = 'https://www.theklabristol.co.uk/';
export const THEKLA_PAGES = [
  { url: `${BASE}live/`, type: 'gig' },
  { url: `${BASE}club/`, type: 'club' },
];

// "Sat.07.Mar.26"  |  "Thu. 24 Oct 24"  |  "Saturday 3 October 2026"
const DATE_RE = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s*(\d{1,2})(?:st|nd|rd|th)?[.\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*(\d{2,4})\b/i;
const PLACEHOLDER = /^(live music|club night|tba|tbc|to be announced|coming soon)$/i;
const NOISE = /^(buy tickets|book tickets|tickets|more info|info|sold out|free entry|support:?|doors:?.*|\||on sale.*)$/i;
const TICKET_HOST = /(alttickets\.com|fatsoma\.com|seetickets|skiddle|dice\.fm|ticketweb|gigantic\.com|ticketmaster)/i;

export function parseTheklaListing(html, type) {
  const $ = cheerio.load(html);
  const out = [];
  for (const { card, dateEl, match } of findCards($, DATE_RE)) {
    const [, , d, mon, y] = match;
    const $c = $(card);
    const hrefs = $c.find('a[href]').toArray().map((a) => absUrl($(a).attr('href'), BASE)).filter(Boolean);
    const pageUrl = hrefs.find((h) => /theklabristol\.co\.uk\/(gigs|club-nights|club|events?)\/[^/]+/i.test(h) && !/\/club\/?$/.test(h)) || null;
    const ticketUrl = hrefs.find((h) => TICKET_HOST.test(h)) || null;

    const lines = textLines($, card).filter((l) => !DATE_RE.test(l) && !NOISE.test(l));
    let title = clean(nearestTitle($, card, dateEl, (t) => NOISE.test(t) || DATE_RE.test(t) || /^support/i.test(t)));
    if (!title) title = lines[0] || '';
    title = decodeEntities(title);
    if (!title || PLACEHOLDER.test(title)) continue;

    // "Support: X" on one line, or "Support:" then "X" on the next
    const raw = textLines($, card);
    const si = raw.findIndex((l) => /^support\b/i.test(l));
    let support = si < 0 ? '' : raw[si].replace(/^support\s*:?\s*/i, '') || raw[si + 1] || '';

    const time = /(\d{1,2}[:.]\d{2}\s*[ap]m|\d{1,2}\s*[ap]m)/i.exec($c.text());
    const hm = time ? parse12h(time[1].replace('.', ':')) : null;
    const [h, mi] = hm || (type === 'club' ? [22, 0] : [19, 0]);

    out.push({
      source: 'thekla', type, title, support: decodeEntities(support),
      start: londonISO(fullYear(y), MONTHS[mon.toLowerCase()], +d, h, mi),
      timeKnown: !!hm, ticketUrl, pageUrl, status: /sold\s*out/i.test($c.text()) ? 'soldout' : null,
      image: absUrl($c.find('img[src]').first().attr('src') || '', BASE) || null,
    });
  }
  return out;
}

export async function fetchThekla() {
  const all = [];
  const errors = [];
  for (const { url, type } of THEKLA_PAGES) {
    try {
      const r = await get(url);
      await debugSave(`thekla-${type}.html`, r.text);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      all.push(...parseTheklaListing(r.text, type));
    } catch (e) {
      errors.push(`${type}: ${e.message}`);
      console.warn(`  Thekla ${type} guide unavailable (${e.message})`);
    }
  }
  if (errors.length === THEKLA_PAGES.length) throw new Error(errors.join('; '));
  return all;
}
