// Thekla Links — live changes made in the admin portal (/admin).
// Reads one public document from Firebase (Firestore) as the page loads, so changes show
// straight away. events.json also carries a copy from the last update, and a copy is kept
// on the phone, so the page still shows admin changes if Firebase can't be reached.
(() => {
  const cfg = (window.THEKLA_CONFIG && window.THEKLA_CONFIG.firebase) || {};
  const CACHE = 'thekla-live-v1';
  const FALLBACK = { gig: 'https://www.alttickets.com/venue/bristol/thekla', club: 'https://www.fatsoma.com/p/thekla' };
  let live = null;
  const subs = [];

  // ---------- Firestore REST format → plain objects ----------
  function dec(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
    if ('mapValue' in v) {
      const o = {};
      for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = dec(x);
      return o;
    }
    return null;
  }
  const stamp = (d) => (d && d.updatedAt ? Date.parse(d.updatedAt) || 0 : 0);
  const newest = (...docs) => docs.filter(Boolean).sort((a, b) => stamp(b) - stamp(a))[0] || null;

  const cached = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; } };
  const keep = (d) => { try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* full or blocked */ } };

  async function fetchLive() {
    if (!cfg.projectId || window.__PREVIEW__) return null;
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/public/live${cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : ''}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (r.status === 404) return {};
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return dec({ mapValue: { fields: j.fields || {} } }) || {};
    } finally { clearTimeout(t); }
  }

  let busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      const d = await fetchLive();
      if (d) { live = d; keep(d); emit(); }
    } catch { /* offline, quota, or Firebase down: keep what we have */ }
    busy = false;
  }
  const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  // ---------- applying changes to events ----------
  const sourceOf = (url, fallback) => {
    const h = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
    return /fatsoma/.test(h) ? 'fatsoma' : /alttickets/.test(h) ? 'alttickets' : /skiddle/.test(h) ? 'skiddle' : fallback;
  };
  const paras = (s) => String(s || '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const has = (v) => v !== undefined && v !== null && v !== '';

  function mergeOne(raw, o) {
    const e = { ...raw };
    if (has(o.title)) e.title = o.title;
    if (has(o.support)) e.support = o.support === '-' ? '' : o.support;
    if (has(o.bio)) e.about = paras(o.bio);
    if (has(o.status)) { if (o.status === 'onsale') delete e.status; else e.status = o.status; }
    if (has(o.statusNote)) e.statusNote = o.statusNote;
    if (has(o.image)) { e.image = o.image; e.imageLarge = o.image; }
    if (has(o.ticketUrl)) { e.ticketUrl = o.ticketUrl; e.url = o.ticketUrl; e.linkKind = 'tickets'; e.source = sourceOf(o.ticketUrl, e.source); }
    if (o.featured === 'pin') e.pinned = true;
    if (o.featured === 'never') { e.pinned = false; e.noFeature = true; }
    if (o.times && typeof o.times === 'object') e.times = o.times;
    e.edited = true;
    return e;
  }

  function apply(events) {
    const L = live || {};
    const ov = L.overrides || {};
    const out = [];
    for (const raw of events || []) {
      const o = ov[raw.id];
      if (o && o.hidden) continue;
      out.push(o ? mergeOne(raw, o) : raw);
    }
    for (const [id, m] of Object.entries(L.manual || {})) {
      if (!m || !m.title || !m.start || out.some((x) => x.id === id)) continue;
      const link = m.ticketUrl || m.infoUrl || '';
      const base = {
        ...m, id, manual: true,
        type: m.type === 'club' ? 'club' : 'gig',
        source: sourceOf(m.ticketUrl, 'thekla'),
        linkKind: m.ticketUrl ? 'tickets' : 'info',
        url: link || FALLBACK[m.type === 'club' ? 'club' : 'gig'],
        about: m.about ? paras(m.about) : undefined,
        imageLarge: m.image || undefined,
      };
      const o = ov[id];
      if (o && o.hidden) continue;
      out.push(o ? mergeOne(base, o) : base);
    }
    return out.sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  // ---------- simple text formatting for admin-written text ----------
  // **bold**, [link text](https://…), blank line = new paragraph
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^\s)]+)\)/g, (m, t, u) => {
        const ext = /^https?:/.test(u);
        return `<a href="${u}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
      })
      .replace(/\n/g, '<br>');
  }
  const block = (s) => String(s || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${inline(p)}</p>`).join('');
  const format = (s, mode) => (mode === 'block' ? block(s) : inline(String(s || '').trim()));

  // ---------- notice banner + editable text on the page ----------
  function renderNotice() {
    const box = document.getElementById('notice');
    if (!box) return;
    const n = (live && live.notice) || {};
    const until = n.until ? Date.parse(n.until) : 0;
    const on = n.on && has(n.text) && (!until || until > Date.now());
    if (!on) { box.hidden = true; box.innerHTML = ''; box.dataset.key = ''; return; }
    const key = JSON.stringify([n.text, n.level, n.linkUrl, n.linkText]);
    if (box.dataset.key === key && !box.hidden) return;
    const link = has(n.linkUrl) && /^(https?:|mailto:|tel:)/.test(n.linkUrl)
      ? ` <a href="${esc(n.linkUrl)}" ${/^https?:/.test(n.linkUrl) ? 'target="_blank" rel="noopener"' : ''} data-track="Notice|link">${esc(n.linkText || 'More info')} →</a>` : '';
    box.innerHTML = `<div class="notice-box ${n.level === 'urgent' ? 'urgent' : ''}"><span class="notice-icon" aria-hidden="true">${n.level === 'urgent' ? '!' : 'i'}</span><p>${inline(n.text)}${link}</p></div>`;
    box.dataset.key = key;
    box.hidden = false;
  }

  function renderInfo() {
    const info = (live && live.info) || {};
    const blocks = info.blocks || {};
    document.querySelectorAll('[data-edit]').forEach((el) => {
      if (el._orig === undefined) el._orig = el.innerHTML;
      const v = blocks[el.dataset.edit];
      const html = has(v) ? format(v, el.dataset.editMode) : el._orig;
      if (el.innerHTML !== html) el.innerHTML = html;
    });
    const faq = document.getElementById('faq-groups');
    if (faq) {
      if (faq._orig === undefined) faq._orig = faq.innerHTML;
      const groups = Array.isArray(info.faq) && info.faq.length ? info.faq : null;
      const html = groups
        ? groups.filter((g) => g && (g.items || []).length).map((g) => `
          ${has(g.group) ? `<h3 class="faq-group">${esc(g.group)}</h3>` : ''}
          <div class="faq-list">${(g.items || []).filter((i) => i && has(i.q)).map((i) => `<details class="faq"><summary>${esc(i.q)}</summary><div class="faq-a">${block(i.a)}</div></details>`).join('')}</div>`).join('')
        : faq._orig;
      if (faq._html !== html) { faq.innerHTML = html; faq._html = html; }
    }
  }

  function decorate() {
    try { renderNotice(); } catch (e) { console.error(e); }
    try { renderInfo(); } catch (e) { console.error(e); }
  }

  window.TheklaLive = {
    apply,
    decorate,
    format,
    /** events.json carries a copy of the live data from the last update */
    useSnapshot(s) { const n = newest(live, cached(), s); if (n && n !== live) { live = n; } },
    onChange(f) { subs.push(f); },
    refresh,
    get: () => live,
  };

  live = newest(cached(), window.__LIVE__ || null);
  decorate();
  refresh();
  // Pick up changes made while the page is open (e.g. tonight's times on the night)
  setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
