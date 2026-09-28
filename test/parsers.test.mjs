import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseAltListing, parseAltEventPage } from '../scripts/lib/alttickets.mjs';
import { parseFatsomaPage, eventFromApi, eventFromPage, fatsomaImage } from '../scripts/lib/fatsoma.mjs';
import { parseTheklaListing } from '../scripts/lib/thekla.mjs';
import { mergeEvents } from '../scripts/lib/merge.mjs';
import { londonISO } from '../scripts/lib/util.mjs';

const fx = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('London time handles BST and GMT', () => {
  assert.equal(londonISO(2026, 10, 1, 19, 0), '2026-10-01T19:00:00+01:00');
  assert.equal(londonISO(2026, 12, 1, 19, 0), '2026-12-01T19:00:00+00:00');
  assert.equal(londonISO(2026, 10, 25, 22, 0), '2026-10-25T22:00:00+00:00'); // clocks go back that morning
});

test('Alt Tickets listing', () => {
  const ev = parseAltListing(fx('alttickets.html'));
  const titles = ev.map((e) => e.title);
  assert.deepEqual(titles.sort(), [
    'Brother Strut', 'Damian Lewis', 'Fickle Friends', 'JUST RADIOHEAD Performing OK Computer',
    'Man/Woman/Chainsaw', 'Mary In The Junkyard', 'The Cinelli Brothers',
  ].sort());
  const mary = ev.find((e) => e.title === 'Mary In The Junkyard');
  assert.equal(mary.status, 'soldout');
  assert.equal(mary.ticketUrl, null);
  assert.equal(mary.start, '2026-10-01T19:00:00+01:00');
  const bs = ev.find((e) => e.title === 'Brother Strut');
  assert.equal(bs.ticketUrl, 'https://www.alttickets.com/brother-strut-tickets/bristol-thekla/2026-10-03-18-30');
  assert.equal(ev.find((e) => e.title === 'Damian Lewis').support, 'Support: Young Martyrs');
  assert.equal(ev.find((e) => e.title === 'The Cinelli Brothers').support, 'Support: True Strays');
  assert.equal(ev.find((e) => e.title.startsWith('JUST')).start, '2027-06-12T19:00:00+01:00');
});

test('Alt Tickets event page', () => {
  const p = parseAltEventPage(fx('alt-event.html'));
  assert.match(p.image, /400x400\/brother_strut/);
  assert.equal(p.price, '£30.25');
});

test('Fatsoma page links', () => {
  const links = parseFatsomaPage(fx('fatsoma.html'));
  assert.deepEqual(links.map((l) => l.id), ['nbi6f8pt', '16xtm6e4', 'blwh7ck2', '23bau800']);
  assert.equal(links[1].url, 'https://www.fatsoma.com/thekla/promotions/16xtm6e4/pressure-theklathursday');
});

test('Fatsoma API mapping', () => {
  const e = eventFromApi({ data: [{ attributes: {
    name: 'PRESSURE. #TheklaThursday', 'starts-at': '2026-10-01T21:30:00+01:00', 'ends-at': '2026-10-02T03:00:00+01:00',
    'vanity-name': '16xtm6e4', 'seo-name': 'pressure-theklathursday', expired: false, 'price-min-with-fees': 550,
    'asset-url': 'https://cdn2.fatsoma.com/media/ABC123', 'age-restrictions': '18+',
  } }] }, 'https://www.fatsoma.com/thekla/promotions/16xtm6e4/pressure-theklathursday');
  assert.equal(e.type, 'club');
  assert.equal(e.price, '£5.50');
  assert.equal(e.image, 'https://fatsoma.imgix.net/ABC123?w=480&h=480&fit=crop&auto=format,compress');
  assert.equal(fatsomaImage('https://fatsoma.imgix.net/XYZ?auto=format'), 'https://fatsoma.imgix.net/XYZ?w=480&h=480&fit=crop&auto=format,compress');
});

test('Fatsoma event page fallback', () => {
  const e = eventFromPage(fx('fatsoma-event.html'), 'https://x');
  assert.equal(e.title, 'PRESSURE. #TheklaThursday');
  assert.equal(e.start, '2026-10-01T21:30:00+01:00');
});

test('Thekla listings', () => {
  const live = parseTheklaListing(fx('thekla-live.html'), 'gig');
  assert.deepEqual(live.map((e) => e.title), ['Brother Strut', 'Violet Grohl', 'Secret Band']);
  assert.equal(live[1].support, 'The Kicks');
  assert.equal(live[1].status, 'soldout');
  assert.equal(live[1].pageUrl, 'https://www.theklabristol.co.uk/gigs/violet-grohl/');
  assert.equal(live[2].start, '2026-10-13T19:30:00+01:00');
  const club = parseTheklaListing(fx('thekla-club.html'), 'club');
  assert.equal(club.length, 1);
  assert.equal(club[0].start, '2026-10-01T22:00:00+01:00');
});

test('merge: dedupe, links, fallbacks', () => {
  const alt = parseAltListing(fx('alttickets.html'));
  alt.push({ source: 'alttickets', type: 'gig', title: 'Violet Grohl', start: '2026-10-04T19:00:00+01:00', status: 'soldout', ticketUrl: null });
  const club = [{ source: 'fatsoma', type: 'club', title: 'PRESSURE. #TheklaThursday', start: '2026-10-01T21:30:00+01:00', ticketUrl: 'https://f/1' }];
  const backup = [...parseTheklaListing(fx('thekla-live.html'), 'gig'), ...parseTheklaListing(fx('thekla-club.html'), 'club')];
  const out = mergeEvents([...alt, ...club], backup, { from: new Date('2026-09-28'), until: new Date('2026-11-28') });

  const titles = out.map((e) => e.title);
  assert.equal(titles.filter((t) => t === 'Brother Strut').length, 1);
  assert.ok(titles.includes('Secret Band'), 'backup-only event kept');
  assert.ok(!titles.some((t) => t.startsWith('JUST')), 'outside window dropped');

  const violet = out.find((e) => e.title === 'Violet Grohl');
  assert.equal(violet.url, 'https://www.theklabristol.co.uk/gigs/violet-grohl/', 'no ticket → Thekla event page');
  assert.equal(violet.linkKind, 'info');
  assert.equal(violet.support, 'The Kicks');

  const mary = out.find((e) => e.title === 'Mary In The Junkyard');
  assert.equal(mary.url, 'https://www.theklabristol.co.uk/live/', 'no ticket, no page → gig guide');
  assert.equal(out.find((e) => e.title === 'Damian Lewis').support, 'Young Martyrs');
  // Club-night merge: "Pressure Presents: Freshers" vs "PRESSURE. #TheklaThursday" → same night? similarity low; ok either way
  assert.ok(out.every((e, i) => i === 0 || new Date(out[i - 1].start) <= new Date(e.start)), 'sorted');
});

test('Fatsoma description → paragraphs', async () => {
  const { htmlToParagraphs } = await import('../scripts/lib/fatsoma.mjs');
  const p = htmlToParagraphs('<p><strong>No Diggity</strong> - 90s/00s Hip-Hop</p><p>Back-to-back classics<br>all night</p><ul><li>Top deck</li><li>Quayside</li></ul><script>x</script>');
  assert.deepEqual(p, ['No Diggity - 90s/00s Hip-Hop', 'Back-to-back classics\nall night', '• Top deck', '• Quayside']);
  assert.equal(htmlToParagraphs(''), null);
  assert.ok(htmlToParagraphs('<p>' + 'word '.repeat(400) + '</p>')[0].endsWith('…'));
});

test('Alt event page: age + finish time', () => {
  const p = parseAltEventPage('<html><body><p>Age restriction: 14+</p><p>Doors at 18:30, Expected finish time: 22:00</p><img src="/static_alt_tickets/images/campaign/1170x375/x.jpg"></body></html>');
  assert.equal(p.age, '14+');
  assert.deepEqual(p.finish, [22, 0]);
  assert.match(p.imageLarge, /1170x375/);
});
