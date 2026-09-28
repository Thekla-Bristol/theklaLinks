// Merge sources, de-duplicate, and pick the right link for each event.
import { londonDay, titleSimilarity, slugify } from './util.mjs';

const THEKLA_FALLBACK = {
  gig: 'https://www.theklabristol.co.uk/live/',
  club: 'https://www.theklabristol.co.uk/club/',
};

const sameEvent = (a, b) =>
  londonDay(a.start) === londonDay(b.start) && titleSimilarity(a.title, b.title) >= 0.6;

function tidySupport(s) {
  return (s || '')
    .replace(/^\(|\)$/g, '')
    .replace(/^(support|with|plus)\s*(from)?\s*[:\-–]?\s*/i, '')
    .trim();
}

/**
 * primary: events from Alt Tickets + Fatsoma (authoritative).
 * backup: events from the Thekla site.
 */
export function mergeEvents(primary, backup, { from, until }) {
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
