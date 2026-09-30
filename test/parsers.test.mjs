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

test('Skiddle mapping', async () => {
  const { eventFromSkiddle } = await import('../scripts/lib/skiddle.mjs');
  const e = eventFromSkiddle({
    eventname: 'Garage Nation &amp; Friends', date: '2026-10-17', EventCode: 'CLUB',
    openingtimes: { doorsopen: '22:00', doorsclose: '03:00', lastentry: '01:00' },
    link: 'https://www.skiddle.com/whats-on/Bristol/Thekla/Garage-Nation/123/', entryprice: '£12.50',
    minage: '18', imageurl: 'https://i/s.jpg', largeimageurl: 'https://i/l.jpg',
    description: '<p>UKG all night.</p><p>Two rooms</p>', cancelled: false,
  });
  assert.equal(e.title, 'Garage Nation & Friends');
  assert.equal(e.type, 'club');
  assert.equal(e.start, '2026-10-17T22:00:00+01:00');
  assert.equal(new Date(e.end).toISOString(), '2026-10-18T02:00:00.000Z');
  assert.equal(e.price, '£12.50');
  assert.equal(e.age, '18+');
  assert.deepEqual(e.about, ['UKG all night.', 'Two rooms']);
  assert.equal(eventFromSkiddle({ eventname: 'X', date: '2026-10-20', openingtimes: { doorsopen: '19:00' } }).type, 'gig');
});

test('merge: Skiddle never beats Alt Tickets / Fatsoma', () => {
  const win = { from: new Date('2026-09-28'), until: new Date('2027-09-28') };
  const primary = [
    { source: 'fatsoma', type: 'club', title: 'Pop Confessional ✞ Bristol\'s Best Pop Party', start: '2026-10-03T21:30:00+01:00', ticketUrl: 'https://f/pop' },
    { source: 'alttickets', type: 'gig', title: 'Fickle Friends', start: '2026-10-06T18:30:00+01:00', ticketUrl: 'https://a/ff' },
  ];
  const skiddle = [
    { source: 'skiddle', type: 'club', title: 'POP CONFESSIONAL - Bristol', start: '2026-10-03T22:00:00+01:00', ticketUrl: 'https://s/1', about: ['From Skiddle'] },
    { source: 'skiddle', type: 'club', title: 'Totally Different Name', start: '2026-10-03T22:30:00+01:00', ticketUrl: 'https://s/2' },   // same night, same type, 1hr apart → dupe
    { source: 'skiddle', type: 'gig', title: 'Fickle Friends (Live)', start: '2026-10-06T19:00:00+01:00', ticketUrl: 'https://s/3' },
    { source: 'skiddle', type: 'club', title: 'Garage Nation', start: '2026-10-17T22:00:00+01:00', ticketUrl: 'https://s/4' },       // new → kept
    { source: 'skiddle', type: 'club', title: 'After Party', start: '2026-10-04T01:00:00+01:00', ticketUrl: 'https://s/5' },          // 1am = Sat night, but 3.5hrs later → kept
  ];
  const out = mergeEvents(primary, [], { ...win, secondary: skiddle });
  assert.deepEqual(out.map((e) => `${e.source}:${e.title}`), [
    "fatsoma:Pop Confessional ✞ Bristol's Best Pop Party",
    'skiddle:After Party',
    'alttickets:Fickle Friends',
    'skiddle:Garage Nation',
  ]);
  assert.deepEqual(out[0].about, ['From Skiddle'], 'borrows description from the Skiddle duplicate');
  assert.equal(out[0].url, 'https://f/pop', 'but keeps the Fatsoma ticket link');
});

test('report: tracked names roll up per event and per section', async () => {
  const { parseEvents } = await import('../scripts/lib/report-email.mjs');
  const r = parseEvents([
    { x: 'EO|2026-10-03|Pop Confessional ✞ Bristol\'s Best …', y: 10 },
    { x: 'TF|2026-10-03|Pop Confessional ✞ Bristol\'s Best …', y: 4 },
    { x: 'TA|2026-10-06|Fickle Friends', y: 2 },
    { x: 'ES|2026-10-06|Fickle Friends', y: 1 },
    { x: 'Sheet|getting-here', y: 3 }, { x: 'Link|Merch', y: 0 }, { x: 'Filter|club', y: 5 },
  ]);
  assert.equal(r.events.length, 2);
  const pop = r.events.find((e) => e.title.startsWith('Pop'));
  assert.deepEqual([pop.opened, pop.tickets, pop.seller], [10, 4, 'Fatsoma']);
  assert.deepEqual(r.totals, { tickets: 6, opened: 10, shares: 1, arrivals: 0 });
  assert.deepEqual(r.groups.Sheet, { 'getting-here': 3 });
  assert.deepEqual(r.groups.Link, {}, 'zero counts are left out');
});

test('Alt Tickets: recently announced flag', () => {
  const ev = parseAltListing(fx('alttickets.html'));
  assert.equal(ev.find((e) => e.title === 'Fickle Friends').recent, true);
  assert.equal(ev.find((e) => e.title === 'Brother Strut').recent, false);
});

test('featured scoring: gigs and clubs scored separately, pins, series', async () => {
  const { scoreEvents, parsePins } = await import('../scripts/lib/featured.mjs');
  const ev = [
    { type: 'gig', title: 'Blood Red Shoes', start: '2026-10-30T18:30:00+00:00', status: 'low', recent: true, ticketUrl: 'https://a/brs' },
    { type: 'gig', title: 'Quiet Tuesday', start: '2026-10-27T18:30:00+00:00' },
    { type: 'club', title: 'PRESSURE. #TheklaThursday', start: '2026-10-08T21:30:00+01:00', going: 40 },
    { type: 'club', title: 'PRESSURE. #TheklaThursday', start: '2026-10-15T21:30:00+01:00', going: 20 },
    { type: 'club', title: 'PRESSURE. #TheklaThursday', start: '2026-10-22T21:30:00+01:00', going: 10 },
    { type: 'club', title: 'Boat-o-ween', start: '2026-10-31T22:00:00+00:00', going: 80, about: ['x'] },
  ];
  scoreEvents(ev, parsePins('# c\nquiet tues\n'));
  assert.equal(ev[0].feature, 7);          // low + recent + Fri
  assert.equal(ev[1].pinned, true);
  assert.ok(ev[2].series && ev[2].series === ev[3].series);
  assert.ok(ev[5].feature > ev[2].feature, 'one-off busy night beats the weekly regular');
  assert.equal(ev[5].series, undefined);
});
