#!/usr/bin/env node
// Weekly analytics report: reads last week's numbers from the Thekla Links counter
// (Cloudflare Worker, see workers/counter) and emails them through Microsoft 365.
//
//   node scripts/report.mjs            → build + send
//   DRY_RUN=1 node scripts/report.mjs  → build only (writes report-out/report.html)
//
// Env (set as GitHub secrets / variables):
//   COUNTER_URL, COUNTER_TOKEN        the counter's address and its secret token
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SENDER   (Microsoft 365 app registration + sending mailbox)
//   REPORT_TO     comma-separated recipients
//   FORCE=1       send even if it isn't 9am in London (the schedule runs at 08:00 and 09:00 UTC to cover BST/GMT)
//   REPORT_WEEK_ENDING=YYYY-MM-DD  report the week ending on that Sunday instead of last week
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { londonISO, londonDay } from './lib/util.mjs';
import { renderReport, summarise } from './lib/report-email.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'report-out');
const env = process.env;
const TZ = 'Europe/London';

// ---------- only send at 9am UK time on the scheduled run ----------
const londonHour = +new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date());
if (env.GITHUB_EVENT_NAME === 'schedule' && !env.FORCE && londonHour !== 9) {
  console.log(`It's ${londonHour}:00 in London, not 9am. Skipping this run (the other scheduled run will send).`);
  process.exit(0);
}

// ---------- the week: Monday 06:00 → next Monday 06:00, so Sunday's late club night counts ----------
function weekWindow() {
  let endDay;
  if (env.REPORT_WEEK_ENDING) {
    endDay = env.REPORT_WEEK_ENDING; // a Sunday
  } else {
    const today = londonDay(new Date());
    const d = new Date(`${today}T12:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0
    d.setUTCDate(d.getUTCDate() - dow - 1); // last Sunday
    endDay = d.toISOString().slice(0, 10);
  }
  const sun = new Date(`${endDay}T12:00:00Z`);
  const mon = new Date(sun); mon.setUTCDate(sun.getUTCDate() - 6);
  const nextMon = new Date(sun); nextMon.setUTCDate(sun.getUTCDate() + 1);
  const ymd = (x) => x.toISOString().slice(0, 10).split('-').map(Number);
  const start = new Date(londonISO(...ymd(mon), 6, 0));
  const end = new Date(londonISO(...ymd(nextMon), 6, 0));
  return { start, end, monDay: mon.toISOString().slice(0, 10), sunDay: endDay };
}

// ---------- the counter ----------
const COUNTER = (env.COUNTER_URL || '').replace(/\/$/, '');
async function collect(start, end) {
  const url = `${COUNTER}/report?from=${start.getTime()}&to=${end.getTime()}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${env.COUNTER_TOKEN}` } });
  if (!res.ok) throw new Error(`Counter → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ---------- Microsoft Graph ----------
async function sendMail({ subject, html, to }) {
  const tokenRes = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
    }),
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Microsoft sign-in failed: ${token.error_description || token.error || tokenRes.status}`);

  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MS_SENDER)}/sendMail`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });
  if (res.status !== 202) throw new Error(`Sending failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

// ---------- run ----------
const missing = ['COUNTER_URL', 'COUNTER_TOKEN'].filter((k) => !env[k]);
if (missing.length) { console.error(`Missing ${missing.join(', ')}`); process.exit(1); }

const week = weekWindow();
const prevStart = new Date(week.start.getTime() - 7 * 86400e3);
const [thisWeek, lastWeek] = await Promise.all([
  collect(week.start, week.end),
  collect(prevStart, week.start),
]);

// Full event names (tracking cuts long titles to 50 characters)
let listings = [];
try {
  const site = (env.SITE_URL || 'https://links.theklabristol.co.uk').replace(/\/$/, '');
  const r = await fetch(`${site}/events.json`);
  if (r.ok) listings = (await r.json()).events || [];
} catch { /* fine: the report just shows shortened names */ }

const dashboardUrl = thisWeek.viewKey ? `${COUNTER}/dashboard?key=${thisWeek.viewKey}` : null;
const summary = summarise({ week, thisWeek, lastWeek, shareUrl: dashboardUrl, listings });
const { subject, html } = renderReport(summary);

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, 'report.html'), html);
delete thisWeek.viewKey; delete lastWeek.viewKey; // keep the dashboard key out of the saved copy
await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify({ summary: { ...summary, shareUrl: undefined }, raw: { thisWeek, lastWeek } }, null, 1));
console.log(`Built: ${subject}`);

if (env.DRY_RUN) { console.log('DRY_RUN set: not sending. See report-out/report.html'); process.exit(0); }

const to = (env.REPORT_TO || '').split(/[,;\s]+/).filter(Boolean);
const needMs = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_SENDER'].filter((k) => !env[k]);
if (!to.length || needMs.length) {
  console.error(`Can't send: missing ${[...(to.length ? [] : ['REPORT_TO']), ...needMs].join(', ')}`);
  process.exit(1);
}
await sendMail({ subject, html, to });
console.log(`Sent to ${to.join(', ')}`);
