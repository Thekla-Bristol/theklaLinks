// Thekla Links visit counter (Cloudflare Worker + D1).
//
//   POST /e            the page sends a page view or a tap (no cookies, no IP stored)
//   GET  /report       totals for a time window, for the weekly email (needs the COUNTER_TOKEN)
//   GET  /dashboard    live "this week so far" page (needs the view key from the weekly email)
//
// Visitors are counted with a one-way hash of (week + IP + browser + secret) that resets every
// Monday, the same approach privacy-first tools like Plausible use. Nothing personal is stored.
import { summarise, renderReport } from '../../../scripts/lib/report-email.mjs';

const TZ = 'Europe/London';
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|node-fetch|axios/i;

// ---------- helpers ----------
const londonParts = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, weekday: p.weekday };
};

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Monday (London date) of the week containing d, counting Mon 06:00 as the start of the week. */
function weekMonday(d) {
  const shifted = new Date(d.getTime() - 6 * 3600e3);
  const { day } = londonParts(shifted);
  const x = new Date(`${day}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

function originAllowed(origin, env) {
  if (!origin) return false;
  return String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).some((rule) => {
    if (rule === origin) return true;
    if (rule.includes('*')) {
      const re = new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+') + '$');
      return re.test(origin);
    }
    return false;
  });
}

function cors(res, origin, env) {
  if (originAllowed(origin, env)) {
    res.headers.set('access-control-allow-origin', origin);
    res.headers.set('access-control-allow-methods', 'POST, OPTIONS');
    res.headers.set('access-control-allow-headers', 'content-type');
    res.headers.set('vary', 'origin');
  }
  return res;
}

const deviceOf = (ua) => (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua) ? 'tablet' : /Mobi|iPhone|iPod|Android/i.test(ua) ? 'mobile' : 'desktop');

// ---------- collect ----------
async function collect(req, env) {
  const origin = req.headers.get('origin') || (() => { try { return new URL(req.headers.get('referer')).origin; } catch { return ''; } })();
  if (!originAllowed(origin, env)) return new Response('forbidden', { status: 403 });
  const ua = req.headers.get('user-agent') || '';
  if (!ua || BOT.test(ua)) return new Response(null, { status: 204 });

  let body;
  try { body = JSON.parse(await req.text()); } catch { return new Response('bad request', { status: 400 }); }
  const kind = body.k === 'pv' ? 'pv' : body.k === 'ev' ? 'ev' : null;
  if (!kind) return new Response('bad request', { status: 400 });
  const name = String(body.n || '').slice(0, 80);
  if (kind === 'ev' && !name) return new Response('bad request', { status: 400 });

  let referrer = '';
  try {
    const host = new URL(String(body.r || '')).hostname.replace(/^www\./, '');
    if (host && !originAllowed(`https://${host}`, env) && !/theklabristol\.co\.uk$|github\.io$/.test(host)) referrer = host;
  } catch { /* none */ }

  const now = new Date();
  const { day, hour } = londonParts(now);
  const ip = req.headers.get('cf-connecting-ip') || '';
  const visitor = (await sha256hex(`${weekMonday(now)}|${env.COUNTER_TOKEN || ''}|${ip}|${ua}`)).slice(0, 16);

  await env.DB.prepare('INSERT INTO hits (ts, day, hour, kind, name, visitor, referrer, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(now.getTime(), day, hour, kind, name, visitor, kind === 'pv' ? referrer : '', kind === 'pv' ? deviceOf(ua) : '')
    .run();
  return new Response(null, { status: 204 });
}

// ---------- totals for a window (same shapes the report expects) ----------
export async function gather(env, from, to) {
  const q = (sql) => env.DB.prepare(sql).bind(from, to);
  const [stats, events, refs, devs, days, hours] = await env.DB.batch([
    q(`SELECT COUNT(*) AS pageviews, COUNT(DISTINCT visitor) AS visitors, COUNT(DISTINCT visitor || day) AS visits
       FROM hits WHERE kind = 'pv' AND ts >= ? AND ts < ?`),
    q(`SELECT name AS x, COUNT(*) AS y FROM hits WHERE kind = 'ev' AND ts >= ? AND ts < ? GROUP BY name ORDER BY y DESC LIMIT 2000`),
    q(`SELECT referrer AS x, COUNT(DISTINCT visitor || day) AS y FROM hits WHERE kind = 'pv' AND referrer != '' AND ts >= ? AND ts < ?
       GROUP BY referrer ORDER BY y DESC LIMIT 12`),
    q(`SELECT device AS x, COUNT(DISTINCT visitor) AS y FROM hits WHERE kind = 'pv' AND ts >= ? AND ts < ? GROUP BY device`),
    q(`SELECT day AS x, COUNT(DISTINCT visitor) AS y FROM hits WHERE kind = 'pv' AND ts >= ? AND ts < ? GROUP BY day ORDER BY day`),
    q(`SELECT hour AS h, COUNT(DISTINCT visitor || day) AS y FROM hits WHERE kind = 'pv' AND ts >= ? AND ts < ? GROUP BY hour`),
  ]);
  const s = stats.results[0] || {};
  return {
    stats: { pageviews: s.pageviews || 0, visitors: s.visitors || 0, visits: s.visits || 0 },
    events: events.results,
    referrers: refs.results,
    devices: devs.results,
    byDay: { sessions: days.results },
    byHour: { sessions: hours.results.map((r) => ({ x: `0000-00-00 ${String(r.h).padStart(2, '0')}:00:00`, y: r.y })) },
  };
}

async function viewKey(env) {
  return (await sha256hex(`view:${env.COUNTER_TOKEN || ''}`)).slice(0, 24);
}

// ---------- report API ----------
async function report(req, env, url) {
  const auth = req.headers.get('authorization') || '';
  if (!env.COUNTER_TOKEN || auth !== `Bearer ${env.COUNTER_TOKEN}`) return new Response('unauthorised', { status: 401 });
  const from = +url.searchParams.get('from');
  const to = +url.searchParams.get('to');
  if (!from || !to || to <= from) return new Response('from/to (ms) required', { status: 400 });
  const data = await gather(env, from, to);
  return Response.json({ ...data, viewKey: await viewKey(env) });
}

// ---------- live dashboard: this week so far ----------
async function dashboard(env, url) {
  if (!env.COUNTER_TOKEN || url.searchParams.get('key') !== (await viewKey(env))) {
    return new Response('This link needs the key from the weekly email.', { status: 401 });
  }
  const now = new Date();
  const monDay = weekMonday(now);
  const [y, m, d] = monDay.split('-').map(Number);
  // Monday 06:00 London → now
  const start = new Date(Date.UTC(y, m - 1, d, 6) - (londonOffsetMin(new Date(Date.UTC(y, m - 1, d, 6))) * 60e3));
  const sun = new Date(Date.UTC(y, m - 1, d + 6, 12)).toISOString().slice(0, 10);
  const prevStart = new Date(start.getTime() - 7 * 86400e3);
  const prevSame = new Date(now.getTime() - 7 * 86400e3);
  const [thisWeek, lastWeek] = await Promise.all([
    gather(env, start.getTime(), now.getTime()),
    gather(env, prevStart.getTime(), prevSame.getTime()),
  ]);
  const S = summarise({ week: { start, end: now, monDay, sunDay: sun }, thisWeek, lastWeek });
  S.range.note = `This week so far, compared with the same point last week. Updated ${new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(now)}.`;
  S.footerNote = 'Live stats: refresh the page for the latest numbers. Visits are counted anonymously, with no cookies.';
  const { html } = renderReport(S);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

function londonOffsetMin(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime()) / 60000);
}

// ---------- entry ----------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || '';
    try {
      if (url.pathname === '/e') {
        if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin, env);
        if (req.method === 'POST') return cors(await collect(req, env), origin, env);
      }
      if (url.pathname === '/report' && req.method === 'GET') return await report(req, env, url);
      if (url.pathname === '/dashboard' && req.method === 'GET') return await dashboard(env, url);
      if (url.pathname === '/') return new Response('Thekla Links counter is running.');
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return new Response(`Error: ${e.message}`, { status: 500 });
    }
  },
  async scheduled(_event, env) {
    await env.DB.prepare('DELETE FROM hits WHERE ts < ?').bind(Date.now() - 400 * 86400e3).run();
  },
};
