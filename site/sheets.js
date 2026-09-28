// Thekla Links — bottom sheets: Getting here, Accessibility, and event details.
// Close by: the × button, tapping outside, swiping down, Esc, or the phone's Back gesture.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const F = () => window.TheklaFmt;

  let current = null;     // open <dialog>
  let pushed = false;     // did we add a history entry for it?

  // ---------- open / close ----------
  function open(id, { fromHash = false } = {}) {
    const dlg = document.getElementById(id);
    if (!dlg || typeof dlg.showModal !== 'function') return false;
    if (current && current !== dlg) closeNow(current);

    if (id === 'getting-here') loadMap(dlg);
    clearTimeout(dlg._closing);
    dlg.classList.remove('closing');
    const panel = $('.sheet-panel', dlg);
    panel.style.transform = '';
    if (!dlg.open) dlg.showModal();
    $('.sheet-scroll', dlg).scrollTop = 0;
    root.classList.add('sheet-open');
    current = dlg;

    const hash = '#' + (dlg.dataset.hash || id);
    if (!fromHash && location.hash !== hash) {
      history.pushState({ sheet: id }, '', hash);
      pushed = true;
    } else pushed = false;
    return true;
  }

  function closeNow(dlg) {
    dlg.classList.remove('closing');
    if (dlg.open) dlg.close();
    if (dlg === current) current = null;
    root.classList.remove('sheet-open');
  }

  function close({ viaHistory = false } = {}) {
    const dlg = current;
    if (!dlg) return;
    current = null;
    const finish = () => closeNow(dlg);
    if (reduce) finish();
    else {
      dlg.classList.add('closing');
      dlg._closing = setTimeout(finish, 230);
    }
    if (!viaHistory) {
      if (pushed) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    }
    pushed = false;
  }

  // Back gesture / button closes the sheet
  addEventListener('popstate', () => {
    if (current) close({ viaHistory: true });
    else openFromHash();
  });

  document.querySelectorAll('dialog.sheet').forEach((dlg) => {
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });          // Esc
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });          // tap outside
    dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    enableSwipe(dlg);
  });

  // ---------- triggers ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-sheet]');
    if (t) {
      e.preventDefault(); // never follow a link as well as opening the card
      open(t.dataset.sheet);
      return;
    }
    const ev = e.target.closest('[data-event]');
    if (ev) openEvent(ev.dataset.event);
  });

  // ---------- swipe down to close ----------
  function enableSwipe(dlg) {
    const panel = $('.sheet-panel', dlg);
    const scroller = $('.sheet-scroll', dlg);
    let y0 = 0, t0 = 0, dy = 0, dragging = false, armed = false;

    panel.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      y0 = e.touches[0].clientY; t0 = performance.now(); dy = 0; dragging = false;
      // Drag only if the content is scrolled to the top, or the touch is outside the scroll area
      armed = scroller.scrollTop <= 0 || !scroller.contains(e.target);
    }, { passive: true });

    panel.addEventListener('touchmove', (e) => {
      if (!armed) return;
      dy = e.touches[0].clientY - y0;
      if (!dragging && dy > 6) { dragging = true; panel.classList.add('dragging'); }
      if (!dragging) { if (dy < -6) armed = false; return; }
      e.preventDefault();
      panel.style.transform = `translateY(${Math.max(dy, 0)}px)`;
    }, { passive: false });

    const end = () => {
      if (!dragging) return;
      dragging = false; armed = false;
      panel.classList.remove('dragging');
      const v = dy / Math.max(performance.now() - t0, 1);
      if (dy > 110 || v > 0.6) {
        panel.style.transform = '';
        close();
      } else {
        panel.classList.add('snapping');
        panel.style.transform = '';
        setTimeout(() => panel.classList.remove('snapping'), 260);
      }
    };
    panel.addEventListener('touchend', end);
    panel.addEventListener('touchcancel', end);
  }

  // ---------- Getting here: load the map only when it's first opened ----------
  function loadMap(dlg) {
    const box = $('.map', dlg);
    if (!box || box.querySelector('iframe')) return;
    const f = document.createElement('iframe');
    f.src = box.dataset.mapSrc;
    f.title = 'Map showing Thekla on East Mud Dock, Bristol';
    f.loading = 'lazy';
    f.referrerPolicy = 'no-referrer-when-downgrade';
    f.allowFullscreen = true;
    box.appendChild(f);
  }

  // ---------- copy buttons ----------
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const text = b.dataset.copy;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      b.after(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
    }
    if (ok) {
      const old = b.textContent;
      b.textContent = 'Copied'; b.classList.add('done');
      setTimeout(() => { b.textContent = old; b.classList.remove('done'); }, 1600);
    }
  });

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 1800);
  }

  // ---------- event details ----------
  const icon = {
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7.5 7.5L12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4.5a2.5 2.5 0 0 0 0-5z"/><path d="M14 5v14" stroke-dasharray="2 2.5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  };

  // "18:00" → "6pm", "23:30" → "11:30pm"
  const hhmm = (s) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
    if (!m) return s;
    const h = +m[1];
    return `${h % 12 || 12}${m[2] === '00' ? '' : ':' + m[2]}${h < 12 ? 'am' : 'pm'}`;
  };

  function openEvent(id, opts) {
    const e = (window.TheklaEvents || []).find((x) => x.id === id);
    if (!e || !F()) return false;
    const { fmt, time, weekday, dateNum, esc } = F();
    const start = new Date(e.start);
    const end = e.end ? new Date(e.end) : null;
    const isClub = e.type === 'club';
    const hasTickets = e.linkKind === 'tickets' && !['soldout', 'cancelled'].includes(e.status);
    const seller = { fatsoma: 'Fatsoma', skiddle: 'Skiddle', alttickets: 'Alt Tickets' }[e.source] || 'the ticket site';

    const dlg = document.getElementById('event');
    dlg.dataset.hash = `e-${id}`;
    $('.sheet-panel', dlg).classList.toggle('club', isClub);

    const img = e.imageLarge || e.image;
    const media = img
      ? `<div class="blur" style="background-image:url('${esc(img)}')"></div><img src="${esc(img)}" alt="" onerror="this.previousElementSibling.remove();this.remove()">`
      : '';
    const facts = [
      ['Date', fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(start)],
      e.timeKnown !== false ? [isClub ? 'Starts' : 'Doors', time(start)] : null,
      end ? [isClub ? 'Ends' : 'Expected finish', time(end)] : null,
      e.lastEntry ? ['Last entry', hhmm(e.lastEntry)] : null,
      e.price && hasTickets ? ['Tickets from', e.price] : null,
      e.age ? ['Age', e.age] : null,
    ].filter(Boolean);

    const chips = [];
    if (e.status === 'soldout') chips.push('<span class="chip soldout">Sold out</span>');
    if (e.status === 'low') chips.push('<span class="chip low">Last few</span>');
    if (e.status === 'presale') chips.push('<span class="chip low">Pre-sale soon</span>');
    if (e.status === 'cancelled') chips.push('<span class="chip soldout">Cancelled</span>');
    if (e.status === 'postponed') chips.push('<span class="chip soldout">Postponed</span>');

    $('#event-body').innerHTML = `
      <div class="ev-media">${media || ''}<div class="big-date" ${img ? 'hidden' : ''}><span>${esc(weekday(start))}</span><b>${esc(dateNum(start))}</b></div></div>
      <div class="ev-headline">
        <div class="ev-meta"><span class="tag" style="color:var(--tone)">${isClub ? 'Club night' : 'Gig'}</span>${chips.join('')}</div>
        <h2 id="ev-title">${esc(e.title)}</h2>
        ${e.support ? `<p class="with">with ${esc(e.support)}</p>` : ''}
      </div>
      <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${e.about?.length ? `<div class="ev-about"><h3>About</h3>${e.about.map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
      <button type="button" class="venue-link" data-sheet="getting-here">${icon.pin}<span>Thekla, East Mud Dock<small>Map, parking &amp; buses</small></span></button>
      ${e.pageUrl ? `<a class="sheet-more" href="${esc(e.pageUrl)}" target="_blank" rel="noopener">Event page on theklabristol.co.uk</a>` : ''}
    `;
    // if the image fails, show the date tile instead
    const im = $('#event-body .ev-media img');
    if (im) im.addEventListener('error', () => { $('#event-body .big-date').hidden = false; });

    let primary;
    if (hasTickets) {
      primary = `<a class="btn ${isClub ? 'club' : 'gig'}" href="${esc(e.ticketUrl || e.url)}" target="_blank" rel="noopener">${icon.ticket}Get tickets on ${seller}</a>`;
    } else if (e.status === 'soldout') {
      primary = e.url && e.linkKind !== 'tickets'
        ? `<a class="btn secondary" href="${esc(e.url)}" target="_blank" rel="noopener">${icon.info}Sold out · more info</a>`
        : `<span class="btn muted">Sold out</span>`;
    } else {
      primary = `<a class="btn secondary" href="${esc(e.url)}" target="_blank" rel="noopener">${icon.info}Event info</a>`;
    }
    $('#event-actions').innerHTML = `${primary}<button type="button" class="btn secondary share" aria-label="Share this event">${icon.share}</button>`;
    $('#event-actions .share').onclick = () => share(e, id);

    return open('event', opts);
  }

  async function share(e, id) {
    const url = `${location.origin}${location.pathname}#e-${id}`;
    const { fmt } = F();
    const text = `${e.title} at Thekla, ${fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(e.start))}`;
    if (navigator.share) {
      try { await navigator.share({ title: e.title, text, url }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
  }

  // ---------- deep links: #getting-here, #accessibility, #e-<event id> ----------
  function openFromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h) return;
    if (h === 'getting-here' || h === 'accessibility') open(h, { fromHash: true });
    else if (h.startsWith('e-')) {
      const id = h.slice(2);
      if (!openEvent(id, { fromHash: true })) {
        // events may not have loaded yet
        document.addEventListener('thekla:events', function once() {
          if (openEvent(id, { fromHash: true })) document.removeEventListener('thekla:events', once);
        });
      }
    }
  }
  openFromHash();
})();
