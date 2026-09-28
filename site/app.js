// Thekla Links — renders site/events.json (rebuilt every few hours by GitHub Actions).
(() => {
  const TZ = 'Europe/London';
  const COMING_UP_MAX = 12;
  const DEFAULT_LENGTH_H = { gig: 4.5, club: 5.5 }; // when no end time is known
  const REFRESH_MS = 30 * 60 * 1000;

  const $ = (s) => document.querySelector(s);
  let data = window.__EVENTS__ || null; // preview builds inline the data
  let filter = 'all';

  // ---------- filter (remembered per viewer; #gigs / #clubs deep links for stories) ----------
  const fromHash = { '#gigs': 'gig', '#clubs': 'club', '#all': 'all' }[location.hash];
  try { filter = fromHash || localStorage.getItem('thekla-filter') || 'all'; } catch { filter = fromHash || 'all'; }

  document.querySelectorAll('[data-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      filter = b.dataset.filter;
      try { localStorage.setItem('thekla-filter', filter); } catch {}
      render();
    });
  });

  // ---------- time helpers (always London time, whatever the phone says) ----------
  const fmt = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });
  const dayKey = (d) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('/').reverse().join('-');
  const addDays = (key, n) => {
    const [y, m, d] = key.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n, 12));
    return t.toISOString().slice(0, 10);
  };
  const time = (d) => fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).format(d).replace(':00', '').replace(/\s/g, '').toLowerCase();
  const weekday = (d) => fmt({ weekday: 'short' }).format(d);
  const dateNum = (d) => fmt({ day: 'numeric' }).format(d);
  const month = (d) => fmt({ month: 'short' }).format(d);

  function dayLabel(key, todayKey) {
    if (key === todayKey) return 'Tonight';
    if (key === addDays(todayKey, 1)) return 'Tomorrow';
    const d = new Date(`${key}T12:00:00Z`);
    return fmt({ weekday: 'long', day: 'numeric', month: 'short' }).format(d);
  }

  window.TheklaFmt = { fmt, time, weekday, dateNum, month, esc: (x) => esc(x) };
  const endOf = (e) => (e.end ? new Date(e.end) : new Date(new Date(e.start).getTime() + DEFAULT_LENGTH_H[e.type] * 3600e3));

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- rendering ----------
  function card(e, now, compact) {
    const start = new Date(e.start);
    const isLive = start <= now && endOf(e) > now;
    const typeWord = e.type === 'club' ? 'Club' : 'Gig';

    let when = '';
    if (e.timeKnown !== false) {
      when = e.type === 'gig' ? `Doors ${time(start)}` : e.end ? `${time(start)}–${time(new Date(e.end))}` : `From ${time(start)}`;
    }
    if (compact) when = `${weekday(start)} ${dateNum(start)} ${month(start)}${when ? ' · ' + when : ''}`;

    const chips = [];
    if (isLive) chips.push('<span class="chip live">On now</span>');
    if (e.status === 'soldout') chips.push('<span class="chip soldout">Sold out</span>');
    if (e.status === 'low') chips.push('<span class="chip low">Last few</span>');
    if (e.status === 'cancelled') chips.push('<span class="chip soldout">Cancelled</span>');
    if (e.status === 'postponed') chips.push('<span class="chip soldout">Postponed</span>');

    const hasTickets = e.linkKind === 'tickets' && !['soldout', 'cancelled'].includes(e.status);
    const where = e.source === 'fatsoma' ? 'Fatsoma' : 'Alt Tickets';
    const label = `${e.title}, ${typeWord}, ${fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(start)}${when ? ', ' + when : ''}${e.status === 'soldout' ? ', sold out' : ''}. Show details`;

    const art = e.image
      ? `<img src="${esc(e.image)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
      : '';
    const cta = hasTickets
      ? `<a class="cta" href="${esc(e.ticketUrl || e.url)}" target="_blank" rel="noopener" aria-label="Tickets for ${esc(e.title)} on ${where}">Tickets</a>`
      : `<span class="cta info" aria-hidden="true">Info</span>`;
    return `<li><article class="ev ${e.type}" data-id="${esc(e.id)}">
      <button type="button" class="ev-open" data-event="${esc(e.id)}" aria-label="${esc(label)}"></button>
      <div class="art"><div class="tile">${esc(weekday(start))}<b>${esc(dateNum(start))}</b></div>${art}</div>
      <div class="ev-body">
        <div class="ev-title">${esc(e.title)}</div>
        ${e.support && !compact ? `<div class="ev-support">+ ${esc(e.support)}</div>` : ''}
        <div class="ev-meta"><span class="tag">${typeWord}</span>${when ? `<span>${esc(when)}</span>` : ''}${chips.join('')}${e.price && !compact && hasTickets ? `<span>From ${esc(e.price)}</span>` : ''}</div>
      </div>
      ${cta}
    </article></li>`;
  }

  function render() {
    if (data) window.TheklaEvents = data.events || [];
    document.dispatchEvent(new CustomEvent('thekla:events'));
    document.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    if (!data) return;

    const now = new Date();
    const todayKey = dayKey(now);
    const weekEndKey = addDays(todayKey, 7); // exclusive: today + next 6 days
    const events = (data.events || [])
      .filter((e) => endOf(e) > now && e.status !== 'past')
      .filter((e) => filter === 'all' || e.type === filter)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    // Late-night starts (before 6am) belong to the previous night
    const nightKey = (e) => {
      const d = new Date(e.start);
      const h = Number(fmt({ hour: 'numeric', hour12: false }).format(d));
      return h < 6 ? dayKey(new Date(d.getTime() - 6 * 3600e3)) : dayKey(d);
    };

    const week = events.filter((e) => nightKey(e) < weekEndKey);
    const later = events.filter((e) => nightKey(e) >= weekEndKey).slice(0, COMING_UP_MAX);

    const lastDay = new Date(`${addDays(todayKey, 6)}T12:00:00Z`);
    $('#tw-range').textContent = `${fmt({ day: 'numeric', month: 'short' }).format(now)} – ${fmt({ day: 'numeric', month: 'short' }).format(lastDay)}`;

    const noun = filter === 'gig' ? 'gigs' : filter === 'club' ? 'club nights' : 'events';
    const weekEl = $('#week');
    weekEl.classList.remove('skeleton');
    if (!week.length) {
      weekEl.innerHTML = `<div class="empty">No ${noun} in the next seven days.${later.length ? ' Here’s what’s coming up next.' : ''}</div>`;
    } else {
      const groups = new Map();
      week.forEach((e) => { const k = nightKey(e); groups.set(k, [...(groups.get(k) || []), e]); });
      weekEl.innerHTML = [...groups].map(([k, list]) => `
        <div class="day">
          <h3 class="day-label ${k === todayKey ? 'today' : ''}">${esc(dayLabel(k, todayKey))}</h3>
          <ul class="events">${list.map((e) => card(e, now, false)).join('')}</ul>
        </div>`).join('');
    }

    $('#coming-up').hidden = !later.length;
    $('#later').innerHTML = `<ul class="events">${later.map((e) => card(e, now, true)).join('')}</ul>`;

    if (data.generatedAt) {
      const mins = Math.round((now - new Date(data.generatedAt)) / 60000);
      const ago = mins < 60 ? `${Math.max(mins, 1)} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hr ago` : `${Math.round(mins / 1440)} days ago`;
      $('#updated').textContent = `Listings updated ${ago}`;
    }
  }

  async function load() {
    try {
      const r = await fetch(`events.json?t=${Math.floor(Date.now() / 600000)}`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
    } catch (err) {
      if (!data) {
        $('#week').classList.remove('skeleton');
        $('#week').innerHTML = '<div class="empty">Listings didn’t load. Check your connection, or use the full gig and club guides below.</div>';
        $('#coming-up').hidden = true;
        return;
      }
    }
    render();
  }

  if (data) render(); else load();
  setInterval(render, 60 * 1000); // keeps "On now" / Tonight accurate
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !window.__EVENTS__) load(); });
  setInterval(() => { if (!document.hidden && !window.__EVENTS__) load(); }, REFRESH_MS);
})();
