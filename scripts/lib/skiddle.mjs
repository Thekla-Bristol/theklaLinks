// External promoters' events — Skiddle's official Events API.
// Needs a free API key (https://www.skiddle.com/api/join.php) saved as the
// SKIDDLE_API_KEY repository secret. Without one, this source is skipped.
import { getJSON, londonISO, clean, decodeEntities } from './util.mjs';

const API = 'https://www.skiddle.com/api/v1';
const THEKLA = { lat: 51.448983, lng: -2.5941729 };

/** Find Thekla's Skiddle venue id (or use SKIDDLE_VENUE_ID if set). */
export async function findVenueId(key) {
  if (process.env.SKIDDLE_VENUE_ID) return process.env.SKIDDLE_VENUE_ID;
  const url = `${API}/venues/?api_key=${key}&latitude=${THEKLA.lat}&longitude=${THEKLA.lng}&radius=1&limit=100`;
  const json = await getJSON(url);
  const hit = (json.results || []).find((v) => /thekla/i.test(v.name || ''));
  if (!hit) throw new Error('Could not find Thekla in Skiddle venues (set SKIDDLE_VENUE_ID)');
  return hit.id;
}

const hm = (s) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
  return m ? [+m[1], +m[2]] : null;
};

function textParagraphs(s, maxChars = 900) {
  const text = decodeEntities(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, ''));
  const paras = text.split(/\n{2,}/).map((p) => p.split('\n').map(clean).filter(Boolean).join('\n')).filter(Boolean);
  const out = [];
  let used = 0;
  for (const p of paras) {
    if (used + p.length > maxChars) {
      if (!out.length) out.push(p.slice(0, maxChars).replace(/\s+\S*$/, '') + '…');
      break;
    }
    out.push(p); used += p.length;
  }
  return out.length ? out : null;
}

/** One Skiddle API result → our event shape. */
export function eventFromSkiddle(r) {
  if (!r || !r.eventname || !r.date) return null;
  const [y, mo, d] = String(r.date).slice(0, 10).split('-').map(Number);
  const ot = r.openingtimes || {};
  const open = hm(ot.doorsopen);
  const shut = hm(ot.doorsclose);

  let start;
  if (open) start = londonISO(y, mo, d, open[0], open[1]);
  else if (r.startdate && /T\d{2}:\d{2}/.test(r.startdate)) start = new Date(r.startdate).toISOString();
  else start = londonISO(y, mo, d, 22, 0);

  let end = null;
  if (shut) {
    end = londonISO(y, mo, d, shut[0], shut[1]);
    if (new Date(end) <= new Date(start)) end = new Date(new Date(end).getTime() + 86400e3).toISOString();
  }

  const code = String(r.EventCode || '').toUpperCase();
  const type = code === 'LIVE' ? 'gig' : code === 'CLUB' ? 'club' : open && open[0] < 20 ? 'gig' : 'club';
  const price = /(\d+(?:\.\d{2})?)/.exec(String(r.entryprice || ''));
  const age = String(r.minage || '').replace(/\D/g, '');

  return {
    source: 'skiddle', type,
    title: clean(decodeEntities(r.eventname)), support: '',
    start, end, timeKnown: !!open,
    ticketUrl: r.link || null,
    status: r.cancelled === true || r.cancelled === '1' ? 'cancelled' : null,
    price: price && +price[1] > 0 ? `£${price[1].replace(/\.00$/, '')}` : null,
    age: age ? `${age}+` : null,
    lastEntry: ot.lastentry || null,
    image: r.imageurl || null,
    imageLarge: r.largeimageurl || r.imageurl || null,
    about: textParagraphs(r.description),
  };
}

export async function fetchSkiddle({ from, until }) {
  const key = process.env.SKIDDLE_API_KEY;
  if (!key) return { skipped: true, events: [] };
  const venueid = await findVenueId(key);
  const ymd = (d) => d.toISOString().slice(0, 10);
  const events = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const url = `${API}/events/search/?api_key=${key}&venueid=${venueid}&minDate=${ymd(from)}&maxDate=${ymd(until)}&limit=100&offset=${offset}&order=date&description=1`;
    const json = await getJSON(url);
    if (json.error && json.error !== 0 && json.error !== '0') throw new Error(`Skiddle API error: ${json.errormessage || json.error}`);
    const batch = json.results || [];
    events.push(...batch.map(eventFromSkiddle).filter(Boolean));
    if (batch.length < 100) break;
  }
  return { events };
}
