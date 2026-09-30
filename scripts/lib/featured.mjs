// Scores events for the "Featured" section. The page picks the top 2 gigs and the
// top 2 club nights itself (after this week, within 6 weeks), so gigs only ever
// compete with gigs and clubs with clubs.
//
//   Gigs  (Alt Tickets): few tickets left +3, recently announced +3, Fri/Sat +1
//   Clubs (Fatsoma etc): people going, scaled against the busiest club night (0-4),
//                        one-off special rather than a weekly regular +2, has a description +0.5
//   Everyone:            pinned in site/featured.txt → always featured first
import { slugify } from './util.mjs';

/** Name shared by a weekly series, e.g. every "PRESSURE. #TheklaThursday". */
export const seriesKey = (title) => slugify(title).split('-').filter((w) => w.length > 2).slice(0, 3).join('-');

/** Lines from featured.txt: ticket links or bits of event names. # starts a comment. */
export function parsePins(text) {
  return String(text || '').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
}

export function scoreEvents(events, pins = []) {
  const counts = {};
  for (const e of events) { const k = seriesKey(e.title); counts[k] = (counts[k] || 0) + 1; }
  const maxGoing = Math.max(1, ...events.filter((e) => e.type === 'club').map((e) => e.going || 0));

  for (const e of events) {
    const key = seriesKey(e.title);
    const recurring = counts[key] >= 3;
    if (recurring) e.series = key;

    let score = 0;
    if (e.type === 'gig') {
      if (e.status === 'low') score += 3;
      if (e.recent) score += 3;
      const dow = new Date(e.start).getUTCDay();
      if (dow === 5 || dow === 6) score += 1;
    } else {
      score += ((e.going || 0) / maxGoing) * 4;
      if (!recurring) score += 2;
      if (e.about?.length) score += 0.5;
    }
    e.feature = Math.round(score * 10) / 10;

    const t = e.title.toLowerCase();
    if (pins.some((p) => (/^https?:/i.test(p) ? [e.ticketUrl, e.url, e.pageUrl].some((u) => u && u.split('?')[0] === p.split('?')[0]) : t.includes(p.toLowerCase())))) {
      e.pinned = true;
    }
  }
  return events;
}
