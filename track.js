// Thekla Links — anonymous usage tracking (our own counter on Cloudflare, no cookies).
// Every tracked action is one short "event name" so the weekly report can count
// them with a single query. Formats (max 50 characters):
//   EO|2026-10-03|Title         event details opened
//   TA|2026-10-03|Title         ticket tap (A = Alt Tickets, F = Fatsoma, S = Skiddle, X = other)
//   ES|2026-10-03|Title         event shared
//   EA|2026-10-03|Title         someone arrived from a shared event link
// Every event code is 2 letters, so the title is always cut at the same length (36)
// and the report can line them up.
//   Sheet|getting-here          pop-up card opened
//   Link|Merch                  link button
//   Social|theklabris           social link
//   Map|Google Maps             map app from Getting to Thekla
//   Email|accessibility         email button
//   Copy|office@…               copy button
//   Filter|gig  Month|2027-02   list controls
//   From|ig-bio                 ?src= tag on the link people arrived from
(() => {
  const MAX = 50;
  // The counter's address is filled in by the deploy workflow (COUNTER_URL variable).
  const endpoint = (document.querySelector('meta[name="thekla-counter"]')?.content || '').replace(/\/$/, '');
  const enabled = /^https?:\/\//.test(endpoint) && /^https?:$/.test(location.protocol);

  function send(payload) {
    if (!enabled) return;
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(`${endpoint}/e`, new Blob([body], { type: 'text/plain' }))) return;
    } catch { /* fall through */ }
    fetch(`${endpoint}/e`, { method: 'POST', body, keepalive: true, mode: 'no-cors', headers: { 'content-type': 'text/plain' } }).catch(() => {});
  }

  // One page view per visit to the page (opening pop-ups doesn't count as a new page)
  send({ k: 'pv', r: document.referrer || '' });

  const clip = (s) => (s.length > MAX ? s.slice(0, MAX - 1) + '…' : s);
  const cleanTitle = (t) => String(t || '').replace(/[|]/g, '/').replace(/\s+/g, ' ').trim();
  const SELLER = { alttickets: 'A', fatsoma: 'F', skiddle: 'S' };

  const track = (name) => { try { send({ k: 'ev', n: clip(String(name)) }); } catch { /* never break the page */ } };
  const CODE = { O: 'EO', Share: 'ES', Arrive: 'EA' };
  const TITLE_MAX = MAX - 14; // "XX|YYYY-MM-DD|"
  track.event = (kind, e) => {
    if (!e) return;
    const k = kind === 'T' ? `T${SELLER[e.source] || 'X'}` : CODE[kind];
    let t = cleanTitle(e.title);
    if (t.length > TITLE_MAX) t = t.slice(0, TITLE_MAX - 1) + '…';
    track(`${k}|${String(e.start).slice(0, 10)}|${t}`);
  };
  window.track = track;

  // Static elements carry data-track="Link|Merch" etc.
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-track]');
    if (el) track(el.dataset.track);
  }, { capture: true });

  // Which link did people arrive from? Use ?src=ig-bio, ?src=ig-story, ?src=qr-poster…
  try {
    const q = new URLSearchParams(location.search);
    const src = q.get('src') || q.get('utm_source') || q.get('ref');
    if (src) track(`From|${src.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40)}`);
  } catch { /* ignore */ }
})();
