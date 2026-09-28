// Preload for offline end-to-end runs: node --import ./test/mock-fetch.mjs scripts/collect.mjs
import fs from 'node:fs';
const fx = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const res = (body, status = 200) => new Response(body, { status });
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.includes('alttickets.com/venue/')) return res(fx('alttickets.html'));
  if (url.includes('alttickets.com/brother-strut')) return res(fx('alt-event.html'));
  if (url.includes('alttickets.com')) return res('<html><head><meta property="og:image" content="https://example.com/a.jpg"></head><body>£20.00 inc</body></html>');
  if (url.includes('fatsoma.com/p/thekla')) return res(fx('fatsoma.html'));
  if (url.includes('api.fatsoma.com') && url.includes('16xtm6e4')) return res('', 500); // force page fallback
  if (url.includes('api.fatsoma.com')) {
    const id = /vanity-name%5D=|vanity-name]=([a-z0-9]+)/.exec(decodeURIComponent(url))?.[1] || 'x';
    const d = { nbi6f8pt: ['it girls. non-stop club anthems', '2026-09-30T22:00:00+01:00'], blwh7ck2: ['Pop Confessional ✞ Bristol\'s Best Pop Party ⚓️', '2026-10-03T21:30:00+01:00'], '23bau800': ['1D vs 5SOS - A Boyband Special', '2026-10-07T22:00:00+01:00'] }[id];
    return res(JSON.stringify({ data: [{ attributes: { name: d[0], 'starts-at': d[1], 'vanity-name': id, 'seo-name': 's', 'asset-url': 'https://cdn2.fatsoma.com/media/K' } }] }));
  }
  if (url.includes('fatsoma.com')) return res(fx('fatsoma-event.html'));
  if (url.includes('skiddle.com/api/v1/venues')) return res(JSON.stringify({ error: 0, results: [{ id: 1234, name: 'Thekla' }] }));
  if (url.includes('skiddle.com/api/v1/events')) return res(JSON.stringify({ error: 0, results: [
    { eventname: 'PRESSURE - Thekla Thursday', date: '2026-10-01', EventCode: 'CLUB', openingtimes: { doorsopen: '21:30', doorsclose: '03:00' }, link: 'https://www.skiddle.com/e/1' },
    { eventname: 'Garage Nation', date: '2026-10-17', EventCode: 'CLUB', openingtimes: { doorsopen: '22:00', doorsclose: '03:00' }, link: 'https://www.skiddle.com/e/2', entryprice: '£12.50', description: '<p>UKG all night.</p>' },
  ] }));
  if (url.includes('theklabristol.co.uk/live')) return res(fx('thekla-live.html'));
  if (url.includes('theklabristol.co.uk/club')) return res('down', 503); // simulate backend error
  return res('not found', 404);
};
