#!/usr/bin/env node
// Collects upcoming Thekla events and writes site/events.json.
//   node scripts/collect.mjs
// Env:
//   PREVIOUS_URL  deployed events.json — used for any source that fails this run
//   DEBUG_DIR     save the raw HTML that was downloaded (for diagnosing layout changes)
//   DAYS_AHEAD    how far ahead to collect (default 60)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAlt } from './lib/alttickets.mjs';
import { fetchFatsoma } from './lib/fatsoma.mjs';
import { fetchThekla } from './lib/thekla.mjs';
import { mergeEvents } from './lib/merge.mjs';
import { getJSON } from './lib/util.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'events.json');
const DAYS_AHEAD = +(process.env.DAYS_AHEAD || 60);

const now = new Date();
const from = new Date(now.getTime() - 12 * 3600e3); // keep tonight's events until the site filters them
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

const [alt, fat, thek] = await Promise.all([
  run('Alt Tickets (gigs)', () => fetchAlt({ enrichUntil: until }), prevEvents, (e) => e.source === 'alttickets'),
  run('Fatsoma (clubs)', fetchFatsoma, prevEvents, (e) => e.source === 'fatsoma'),
  run('Thekla site (backup)', fetchThekla, prevEvents, (e) => e.source === 'thekla'),
]);

const events = mergeEvents([...alt.events, ...fat.events], thek.events, { from, until });

const data = {
  generatedAt: now.toISOString(),
  sources: { alttickets: alt.status, fatsoma: fat.status, thekla: thek.status },
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
