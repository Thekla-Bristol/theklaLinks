// Merge sources, de-duplicate, and pick the right link for each event.
import { londonDay, titleSimilarity, slugify, tokens } from './util.mjs';

const THEKLA_FALLBACK = {
  gig: 'https://www.theklabristol.co.uk/live/',
  club: 'https://www.theklabristol.co.uk/club/',
};

// The "night" an event belongs to: starts before 6am count as the previous night.
const nightOf = (e) => londonDay(new Date(new Date(e.start).getTime() - 6 * 3600e3));

const sameEvent = (a, b) =>
  nightOf(a) === nightOf(b) && titleSimilarity(a.title, b.title) >= 0.6;

// Looser test for Skiddle listings, where promoters often word titles differently:
// same night and similar title, or same night + same kind of event starting within 90 minutes.
const GENERIC = new Set(['party', 'night', 'club', 'clubnight', 'music', 'dj', 'djs', 'best', 'all', 'nighter']);
function similarTitles(a, b) {
  const A = [...tokens(a)].filter((t) => !GENERIC.has(t));
  const B = new Set([...tokens(b)].filter((t) => !GENERIC.has(t)));
  if (!A.length || !B.size) return false;
  const shared = A.filter((t) => B.has(t)).length;
  const smaller = Math.min(A.length, B.size);
  return shared / smaller >= 0.5 && shared >= Math.min(2, smaller);
}
const likelySame = (a, b) =>
  nightOf(a) === nightOf(b) && (
    similarTitles(a.title, b.title) ||
    (a.type === b.type && Math.abs(new Date(a.start) - new Date(b.start)) <= 90 * 60e3)
  );

function tidySupport(s) {
  return (s || '')
    .replace(/^\(|\)$/g, '')
    .replace(/^(support|with|plus)\s*(from)?\s*[:\-–]?\s*/i, '')
    .trim();
}

/**
 * primary:   Alt Tickets + Fatsoma (always win)
 * secondary: Skiddle (only added when not already on Alt Tickets / Fatsoma)
 * backup:    the Thekla site (fills gaps and supplies event pages)
 */
export function mergeEvents(primary, backup, { from, until, secondary = [] }) {
  const out = [];
  const inWindow = (e) => {
    const t = new Date(e.start);
    return t >= from && t <= until && e.status !== 'past';
  };

  for (const e of primary.filter(inWindow)) {
    if (out.some((o) => o.ticketUrl && o.ticketUrl === e.ticketUrl)) continue;
    const twin = backup.find((b) => sameEvent(b, e));
    if (twin) {
      e.pageUrl ||= twin.pageUrl;
      e.support ||= twin.support;
      e.image ||= twin.image;
    }
    out.push(e);
  }

  for (const s of secondary.filter(inWindow)) {
    const dupe = out.find((o) => likelySame(o, s));
    if (dupe) {
      // keep the Alt/Fatsoma listing, but borrow anything useful it lacks
      dupe.about ||= s.about;
      dupe.imageLarge ||= s.imageLarge;
      dupe.image ||= s.image;
      continue;
    }
    if (out.some((o) => o.source === 'skiddle' && o.ticketUrl === s.ticketUrl)) continue;
    const twin = backup.find((b) => sameEvent(b, s));
    if (twin) { s.pageUrl ||= twin.pageUrl; s.support ||= twin.support; }
    out.push(s);
  }

  for (const b of backup.filter(inWindow)) {
    if (out.some((o) => sameEvent(o, b))) continue;
    out.push(b); // on the Thekla site but not (yet) on the ticket sites
  }

  for (const e of out) {
    e.support = tidySupport(e.support);
    // Where a tap should go: ticket page → Thekla event page → Thekla guide
    e.url = e.ticketUrl || e.pageUrl || THEKLA_FALLBACK[e.type];
    e.linkKind = e.ticketUrl ? 'tickets' : 'info';
    e.id = `${londonDay(e.start)}-${slugify(e.title).slice(0, 40)}`;
    for (const k of Object.keys(e)) if (e[k] === null || e[k] === '' || e[k] === undefined) delete e[k];
  }

  return out.sort((a, b) => new Date(a.start) - new Date(b.start));
}
