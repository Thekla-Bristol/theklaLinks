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

  // Umami: every tap also goes to the Umami dashboard as a custom event (queued until its script loads)
  const umamiQueue = [];
  const toUmami = (name) => {
    if (window.umami && typeof window.umami.track === 'function') window.umami.track(name);
    else if (umamiQueue.length < 50) umamiQueue.push(name);
  };
  const flush = setInterval(() => {
    if (window.umami && typeof window.umami.track === 'function') {
      while (umamiQueue.length) window.umami.track(umamiQueue.shift());
      clearInterval(flush);
    }
  }, 500);
  setTimeout(() => clearInterval(flush), 20000);

  const track = (name) => {
    try {
      const n = clip(String(name));
      send({ k: 'ev', n });
      toUmami(n);
    } catch { /* never break the page */ }
  };
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

  // ---------- Google Analytics ----------
  // Ticket links get tags so purchases on Fatsoma (and any site that reports them) are
  // credited to this page, by event and by which part of the page the tap came from.
  window.ticketLink = (url, e, section) => {
    try {
      const u = new URL(url);
      u.searchParams.set('utm_source', 'thekla_links');
      u.searchParams.set('utm_medium', 'referral');
      if (e?.id) u.searchParams.set('utm_campaign', String(e.id).slice(0, 60));
      if (section) u.searchParams.set('utm_content', section);
      return u.href;
    } catch { return url; }
  };

  // Mirror taps into Google Analytics as readable events (no-op until gtag exists)
  const gaEvent = (name, params) => { try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch { /* ignore */ } };
  const SELLER_NAME = { alttickets: 'Alt Tickets', fatsoma: 'Fatsoma', skiddle: 'Skiddle' };
  const baseEvent = track.event;
  track.event = (kind, e, section) => {
    baseEvent(kind, e);
    if (!e) return;
    const p = { event_title: String(e.title).slice(0, 100), event_date: String(e.start).slice(0, 10), event_type: e.type, ticket_site: SELLER_NAME[e.source] || 'Other', ...(section ? { page_section: section } : {}) };
    if (kind === 'T') gaEvent('ticket_click', p);
    else if (kind === 'O') gaEvent('view_event', p);
    else if (kind === 'Share') gaEvent('share', { ...p, method: 'share_button' });
  };
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-track]');
    if (!el) return;
    const [group, ...rest] = String(el.dataset.track).split('|');
    gaEvent('page_click', { click_group: group, click_label: rest.join('|').slice(0, 100) });
  }, { capture: true });

  // ---------- Cookie choice (only affects Google Analytics) ----------
  const KEY = 'thekla-consent';
  const getChoice = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const setChoice = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };
  function initConsent() {
    const bar = document.getElementById('consent');
    if (!bar) return;
    const show = () => { bar.hidden = false; bar.style.display = ''; };
    const hide = () => { bar.hidden = true; bar.style.display = 'none'; };
    if (!getChoice()) setTimeout(show, 1200); // after the opener animation
    bar.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-consent]');
      if (!b) return;
      const v = b.dataset.consent === 'granted' ? 'granted' : 'denied';
      setChoice(v);
      if (typeof window.gtag === 'function') window.gtag('consent', 'update', { analytics_storage: v });
      hide();
    });
    document.addEventListener('click', (ev) => { if (ev.target.closest('[data-consent-open]')) show(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initConsent); else initConsent();

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
