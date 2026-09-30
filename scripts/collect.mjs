#!/usr/bin/env node
// Collects upcoming Thekla events and writes site/events.json.
//   node scripts/collect.mjs
// Env:
//   PREVIOUS_URL  deployed events.json — used for any source that fails this run
//   DEBUG_DIR     save the raw HTML that was downloaded (for diagnosing layout changes)
//   DAYS_AHEAD    how far ahead to collect (default 300)
//   SKIDDLE_API_KEY / SKIDDLE_VENUE_ID  optional, for Skiddle listings
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAlt } from './lib/alttickets.mjs';
import { fetchFatsoma } from './lib/fatsoma.mjs';
import { fetchThekla } from './lib/thekla.mjs';
import { fetchSkiddle } from './lib/skiddle.mjs';
import { mergeEvents } from './lib/merge.mjs';
import { scoreEvents, parsePins } from './lib/featured.mjs';
import { getJSON } from './lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'events.json');
const DAYS_AHEAD = +(process.env.DAYS_AHEAD || 300); // ~10 months, for the Coming Up month tabs

const now = new Date();
// Keep the last 8 days too: the page hides finished events itself, and the weekly
// report uses them to show full event names.
const from = new Date(now.getTime() - 8 * 86400e3);
const until = new Date(now.getTime() + DAYS_AHEAD * 86400e3);

async function previous() {
  const url = process.env.PREVIOUS_URL;
  try {
    if (url) return await getJSON(url, { tries: 1 });
  } catch { /* first deploy, or site down */ }
  try {
    return JSON.parse(await fs.readFile(OUT, 'utf8'));
  } catch {
    return { events: [] };
  }
}

async function run(name, fn, prevEvents, isSource) {
  const t0 = Date.now();
  try {
    const events = await fn();
    console.log(`✓ ${name}: ${events.length} events (${Date.now() - t0}ms)`);
    return { events, status: { ok: true, count: events.length } };
  } catch (e) {
    const kept = prevEvents.filter(isSource);
    console.warn(`✗ ${name}: ${e.message} — keeping ${kept.length} events from last run`);
    return { events: kept, status: { ok: false, error: e.message, keptFromLastRun: kept.length } };
  }
}

const prev = await previous();
const prevEvents = prev.events || [];

let skiddleSkipped = false;
const [alt, fat, thek, skid] = await Promise.all([
  run('Alt Tickets (gigs)', () => fetchAlt({ enrichUntil: until }), prevEvents, (e) => e.source === 'alttickets'),
  run('Fatsoma (clubs)', fetchFatsoma, prevEvents, (e) => e.source === 'fatsoma'),
  run('Thekla site (backup)', fetchThekla, prevEvents, (e) => e.source === 'thekla'),
  run('Skiddle (external promoters)', async () => {
    const r = await fetchSkiddle({ from, until });
    skiddleSkipped = !!r.skipped;
    return r.events;
  }, prevEvents, (e) => e.source === 'skiddle'),
]);
if (skiddleSkipped) {
  console.log('  (Skiddle skipped: add a SKIDDLE_API_KEY repository secret to include it)');
  skid.status = { ok: true, skipped: true, count: 0 };
}

const events = mergeEvents([...alt.events, ...fat.events], thek.events, { from, until, secondary: skid.events });

// Featured: score every event; pins come from site/featured.txt
let pins = [];
try { pins = parsePins(await fs.readFile(path.join(ROOT, 'site', 'featured.txt'), 'utf8')); } catch { /* no pins file */ }
scoreEvents(events, pins);
if (pins.length) console.log(`  Featured pins: ${events.filter((e) => e.pinned).map((e) => e.title).join(', ') || 'none matched'}`);

const data = {
  generatedAt: now.toISOString(),
  sources: { alttickets: alt.status, fatsoma: fat.status, skiddle: skid.status, thekla: thek.status },
  events,
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(data, null, 1));
console.log(`→ wrote ${events.length} events to site/events.json`);

// Fail the workflow only if we have nothing at all to show.
if (!events.length) {
  console.error('No events from any source.');
  process.exit(1);
}
