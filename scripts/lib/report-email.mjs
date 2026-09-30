// Turns the counter's raw numbers into the weekly summary, and the summary into an email.
// The email uses simple tables and inline styles so it looks the same in Outlook,
// Gmail and Apple Mail.

const TZ = 'Europe/London';
const num = (v) => (v && typeof v === 'object' ? +(v.value ?? 0) : +(v ?? 0)) || 0;
const fmtN = (n) => Math.round(n).toLocaleString('en-GB');

const SHEETS = {
  faq: 'FAQs',
  'getting-here': 'Getting to Thekla',
  accessibility: 'Accessibility',
  'lost-property': 'Lost property',
};
const SELLERS = { A: 'Alt Tickets', F: 'Fatsoma', S: 'Skiddle', X: 'Other' };

function friendlyReferrer(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!h) return null;
  if (/instagram/.test(h)) return 'Instagram';
  if (/facebook|fb\.com|fb\.me|messenger/.test(h)) return 'Facebook';
  if (/(^|\.)t\.co$|twitter|x\.com/.test(h)) return 'X / Twitter';
  if (/tiktok/.test(h)) return 'TikTok';
  if (/google\./.test(h)) return 'Google';
  if (/bing\.|duckduckgo|yahoo|ecosia/.test(h)) return 'Other search';
  if (/theklabristol/.test(h)) return 'Thekla website';
  if (/linktr\.ee/.test(h)) return 'Linktree';
  if (/whatsapp|wa\.me/.test(h)) return 'WhatsApp';
  if (/fatsoma|alttickets|skiddle/.test(h)) return 'Ticket sites';
  return h;
}

/** Parse the one-line event names written by site/track.js. */
export function parseEvents(list) {
  const events = new Map();
  const groups = { Sheet: {}, Link: {}, Social: {}, Map: {}, Email: {}, Copy: {}, Filter: {}, Month: {}, From: {}, FAQ: {} };
  const sellers = { A: 0, F: 0, S: 0, X: 0 };
  const totals = { tickets: 0, opened: 0, shares: 0, arrivals: 0 };

  for (const { x, y } of list || []) {
    const count = +y || 0;
    if (!x || !count) continue;
    const [kind, ...rest] = String(x).split('|');
    if (['EO', 'ES', 'EA', 'TA', 'TF', 'TS', 'TX'].includes(kind) && rest.length >= 2) {
      const [date, ...t] = rest;
      // line up rows even if a title was cut at a slightly different length
      const key = `${date}|${t.join('|').replace(/…$/, '').slice(0, 30).toLowerCase()}`;
      const row = events.get(key) || { date, title: t.join('|'), opened: 0, tickets: 0, shares: 0, arrivals: 0, seller: null };
      if (t.join('|').length > row.title.length) row.title = t.join('|');
      if (kind === 'EO') { row.opened += count; totals.opened += count; }
      else if (kind === 'ES') { row.shares += count; totals.shares += count; }
      else if (kind === 'EA') { row.arrivals += count; totals.arrivals += count; }
      else {
        const s = kind[1];
        row.tickets += count; row.seller = SELLERS[s]; sellers[s] += count; totals.tickets += count;
      }
      events.set(key, row);
    } else if (groups[kind]) {
      const label = rest.join('|') || '(unlabelled)';
      groups[kind][label] = (groups[kind][label] || 0) + count;
    }
  }
  return { events: [...events.values()], groups, sellers, totals };
}

function change(now, before) {
  if (!before && !now) return { text: 'no change', dir: 0 };
  if (!before) return { text: 'new this week', dir: 1 };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: 'same as last week', dir: 0 };
  return { text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% on last week`, dir: Math.sign(pct) };
}

export function summarise({ week, thisWeek, lastWeek, shareUrl, listings = [] }) {
  const s = thisWeek.stats || {};
  const p = lastWeek.stats || {};
  const cur = parseEvents(thisWeek.events);
  const prev = parseEvents(lastWeek.events);

  const visitors = num(s.visitors), pageviews = num(s.pageviews), visits = num(s.visits);
  const bounces = num(s.bounces), totaltime = num(s.totaltime);

  // Referrers → friendly names, merged
  const refMap = {};
  let referred = 0;
  for (const r of thisWeek.referrers || []) {
    const name = friendlyReferrer(r.x);
    if (!name || !r.y) continue;
    refMap[name] = (refMap[name] || 0) + r.y;
    referred += r.y;
  }
  const direct = Math.max(visits - referred, 0);
  const sources = Object.entries(refMap).map(([name, n]) => ({ name, n }));
  if (direct) sources.push({ name: 'Direct / Instagram app', n: direct, note: 'Instagram’s in-app browser usually hides where people came from' });
  sources.sort((a, b) => b.n - a.n);

  const devTotal = (thisWeek.devices || []).reduce((t, d) => t + (+d.y || 0), 0);
  const devices = (thisWeek.devices || [])
    .filter((d) => d.y)
    .map((d) => ({ name: { mobile: 'Phone', tablet: 'Tablet', desktop: 'Computer', laptop: 'Computer' }[d.x] || d.x, pct: Math.round((d.y / devTotal) * 100) }))
    .reduce((acc, d) => { const f = acc.find((a) => a.name === d.name); f ? (f.pct += d.pct) : acc.push(d); return acc; }, []);

  // Visits by day (Mon–Sun) and busiest hour
  const series = (o) => (o && (o.sessions || o.pageviews)) || [];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${week.monDay}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
    days.push({ key: d.toISOString().slice(0, 10), label: new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(d), n: 0 });
  }
  for (const pt of series(thisWeek.byDay)) {
    const key = String(pt.x).slice(0, 10);
    const day = days.find((d) => d.key === key) || (key > days[6].key ? days[6] : null); // early Monday → Sunday night
    if (day) day.n += +pt.y || 0;
  }
  const hours = new Array(24).fill(0);
  for (const pt of series(thisWeek.byHour)) {
    const h = +String(pt.x).slice(11, 13);
    if (!Number.isNaN(h)) hours[h] += +pt.y || 0;
  }
  const peakHour = hours.some(Boolean) ? hours.indexOf(Math.max(...hours)) : null;
  const busiest = days.reduce((a, b) => (b.n > a.n ? b : a), days[0]);

  // Swap shortened names for the full ones where the listing is still known
  for (const row of cur.events) {
    const short = row.title.replace(/…$/, '').toLowerCase();
    const hit = listings.find((l) => String(l.start).slice(0, 10) === row.date && l.title.toLowerCase().startsWith(short.slice(0, 30)));
    if (hit) row.title = hit.title;
  }
  const eventRows = cur.events
    .filter((e) => e.opened || e.tickets || e.shares || e.arrivals)
    .sort((a, b) => b.tickets - a.tickets || b.opened - a.opened || a.date.localeCompare(b.date));

  const label = (k, v) => ({
    Sheet: SHEETS[v.replace(/ \(direct link\)$/, '')] ? SHEETS[v.replace(/ \(direct link\)$/, '')] + (v.endsWith('(direct link)') ? ' (direct link)' : '') : v,
    Filter: { gig: 'Gigs only', club: 'Clubs only', all: 'All events' }[v] || v,
    Month: (() => { const m = /^(\d{4})-(\d{2})$/.exec(v); return m ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, 15))) : v; })(),
    Copy: { address: 'Address', email: 'Email address', phone: 'Phone number' }[v] || v,
    Email: { accessibility: 'Accessibility email', 'lost-property': 'Lost property email', faq: 'Email from FAQs' }[v] || v,
    Social: v === 'facebook' ? 'Facebook' : `Instagram @${v}`,
  }[k] ?? v);

  const group = (k) => Object.entries(cur.groups[k]).filter(([, n]) => n > 0)
    .map(([v, n]) => ({ name: label(k, v), n })).sort((a, b) => b.n - a.n);

  return {
    range: {
      mon: week.monDay, sun: week.sunDay,
      label: `${fmtDay(week.monDay, { day: 'numeric', month: 'short' })} – ${fmtDay(week.sunDay, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    },
    kpis: [
      { name: 'Visitors', value: visitors, change: change(visitors, num(p.visitors)) },
      { name: 'Page views', value: pageviews, change: change(pageviews, num(p.pageviews)) },
      { name: 'Ticket taps', value: cur.totals.tickets, change: change(cur.totals.tickets, prev.totals.tickets) },
      { name: 'Events opened', value: cur.totals.opened, change: change(cur.totals.opened, prev.totals.opened) },
    ],
    extras: {
      visits,
      avgTime: visits ? Math.round(totaltime / visits) : 0,
      bounceRate: visits ? Math.round((bounces / visits) * 100) : 0,
      tapsPerHundred: visitors ? Math.round((cur.totals.tickets / visitors) * 100) : 0,
      shares: cur.totals.shares, arrivals: cur.totals.arrivals,
    },
    sellers: Object.entries(cur.sellers).filter(([, n]) => n).map(([k, n]) => ({ name: SELLERS[k], n })),
    events: eventRows,
    sources: sources.slice(0, 8),
    tags: group('From'),
    devices,
    days, busiest, peakHour,
    sections: [
      { title: 'Pop-up cards', rows: group('Sheet') },
      { title: 'Link buttons', rows: group('Link') },
      { title: 'Socials', rows: group('Social') },
      { title: 'Map apps', rows: group('Map') },
      { title: 'Emails & copy buttons', rows: [...group('Email'), ...group('Copy').map((r) => ({ ...r, name: `Copied: ${r.name}` }))] },
      { title: 'FAQ questions opened', rows: group('FAQ') },
      { title: 'Gigs / Clubs filter', rows: group('Filter') },
      { title: 'Coming Up month tabs', rows: group('Month') },
    ].filter((sec) => sec.rows.length),
    shareUrl: shareUrl || null,
    generatedAt: new Date().toISOString(),
  };
}

function fmtDay(ymd, opts) {
  return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

// ---------- email ----------
const C = {
  page: '#f4f1ec', card: '#ffffff', ink: '#141821', muted: '#6b7280', line: '#e7e2d9',
  navy: '#0b1019', red: '#e52342', up: '#1f8a55', down: '#c2382f', bar: '#e52342', barBg: '#f1ece4',
};
const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

function section(title, inner, sub = '') {
  return `
  <tr><td style="padding:28px 28px 0;">
    <div style="${font}font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.red};font-weight:700;">${esc(title)}</div>
    ${sub ? `<div style="${font}font-size:13px;color:${C.muted};margin-top:4px;">${sub}</div>` : ''}
    <div style="height:10px;line-height:10px;">&nbsp;</div>
    ${inner}
  </td></tr>`;
}

function barRows(rows, { max, unit = '' } = {}) {
  if (!rows.length) return `<div style="${font}font-size:14px;color:${C.muted};">Nothing this week.</div>`;
  const top = max || Math.max(...rows.map((r) => r.n), 1);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.map((r) => {
    const w = Math.max(Math.round((r.n / top) * 100), 2);
    return `<tr>
      <td style="${font}font-size:14px;color:${C.ink};padding:5px 12px 5px 0;width:44%;vertical-align:middle;">${esc(r.name)}${r.note ? `<div style="font-size:11.5px;color:${C.muted};">${esc(r.note)}</div>` : ''}</td>
      <td style="padding:5px 0;vertical-align:middle;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="${w}%" style="background:${C.bar};height:10px;line-height:10px;font-size:0;border-radius:5px;">&nbsp;</td>
          <td style="font-size:0;line-height:10px;">&nbsp;</td>
        </tr></table>
      </td>
      <td style="${font}font-size:14px;font-weight:700;color:${C.ink};padding:5px 0 5px 12px;text-align:right;white-space:nowrap;width:56px;">${fmtN(r.n)}${unit}</td>
    </tr>`;
  }).join('')}</table>`;
}

export function renderReport(S) {
  const kpi = (k) => `
    <td width="50%" style="padding:6px;vertical-align:top;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};border-radius:12px;">
        <tr><td style="padding:16px 16px 14px;">
          <div style="${font}font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:1px;font-weight:600;">${esc(k.name)}</div>
          <div style="${font}font-size:32px;line-height:38px;font-weight:800;color:${C.ink};">${fmtN(k.value)}</div>
          <div style="${font}font-size:13px;font-weight:600;color:${k.change.dir > 0 ? C.up : k.change.dir < 0 ? C.down : C.muted};">${esc(k.change.text)}</div>
        </td></tr>
      </table>
    </td>`;

  const kpiGrid = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>${kpi(S.kpis[0])}${kpi(S.kpis[1])}</tr><tr>${kpi(S.kpis[2])}${kpi(S.kpis[3])}</tr></table>`;

  const x = S.extras;
  const extraLine = [
    `${fmtN(x.visits)} visits`,
    x.avgTime ? `${x.avgTime >= 60 ? `${Math.floor(x.avgTime / 60)}m ${x.avgTime % 60}s` : `${x.avgTime}s`} average visit` : null,
    `${x.tapsPerHundred} ticket taps per 100 visitors`,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const eventTable = S.events.length ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td style="${font}font-size:11.5px;color:${C.muted};text-transform:uppercase;letter-spacing:1px;padding:0 8px 8px 0;border-bottom:1px solid ${C.line};">Event</td>
        <td style="${font}font-size:11.5px;color:${C.muted};text-transform:uppercase;letter-spacing:1px;padding:0 8px 8px;border-bottom:1px solid ${C.line};text-align:right;">Opened</td>
        <td style="${font}font-size:11.5px;color:${C.muted};text-transform:uppercase;letter-spacing:1px;padding:0 0 8px 8px;border-bottom:1px solid ${C.line};text-align:right;">Tickets</td>
      </tr>
      ${S.events.slice(0, 30).map((e) => `
      <tr>
        <td style="${font}padding:9px 8px 9px 0;border-bottom:1px solid ${C.line};">
          <div style="font-size:14.5px;font-weight:700;color:${C.ink};">${esc(e.title)}</div>
          <div style="font-size:12.5px;color:${C.muted};">${esc(fmtDay(e.date, { weekday: 'short', day: 'numeric', month: 'short' }))}${e.seller ? ` · ${esc(e.seller)}` : ''}${e.shares ? ` · shared ${fmtN(e.shares)}×` : ''}${e.arrivals ? ` · ${fmtN(e.arrivals)} from shared links` : ''}</div>
        </td>
        <td style="${font}font-size:15px;color:${C.ink};padding:9px 8px;border-bottom:1px solid ${C.line};text-align:right;">${e.opened ? fmtN(e.opened) : '<span style="color:#b9b3a8;">–</span>'}</td>
        <td style="${font}font-size:15px;font-weight:800;color:${C.ink};padding:9px 0 9px 8px;border-bottom:1px solid ${C.line};text-align:right;">${e.tickets ? fmtN(e.tickets) : '<span style="color:#b9b3a8;font-weight:400;">–</span>'}</td>
      </tr>`).join('')}
    </table>
    ${S.events.length > 30 ? `<div style="${font}font-size:13px;color:${C.muted};padding-top:8px;">…and ${S.events.length - 30} more with fewer clicks.</div>` : ''}`
    : `<div style="${font}font-size:14px;color:${C.muted};">No events were opened or clicked this week.</div>`;

  const sellerLine = S.sellers.length
    ? `Ticket taps by site: ${S.sellers.map((s) => `<b style="color:${C.ink};">${esc(s.name)} ${fmtN(s.n)}</b>`).join(' &nbsp;·&nbsp; ')}`
    : '';

  const dayMax = Math.max(...S.days.map((d) => d.n), 1);
  const dayChart = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${S.days.map((d) => {
    const h = Math.max(Math.round((d.n / dayMax) * 80), 3);
    const isTop = d === S.busiest && d.n > 0;
    return `<td width="14%" style="vertical-align:bottom;text-align:center;padding:0 3px;">
      <div style="${font}font-size:12px;font-weight:700;color:${C.ink};padding-bottom:4px;">${fmtN(d.n)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:${h}px;line-height:${h}px;font-size:0;background:${isTop ? C.red : '#f3b4bf'};border-radius:4px 4px 0 0;">&nbsp;</td></tr></table>
      <div style="${font}font-size:12px;color:${C.muted};padding-top:6px;">${esc(d.label)}</div>
    </td>`;
  }).join('')}</tr></table>
  <div style="${font}font-size:13.5px;color:${C.muted};padding-top:12px;">
    ${S.busiest.n ? `Busiest day: <b style="color:${C.ink};">${esc(fmtDay(S.busiest.key, { weekday: 'long' }))}</b>` : ''}
    ${S.peakHour !== null ? ` &nbsp;·&nbsp; Peak time: <b style="color:${C.ink};">${hourLabel(S.peakHour)}–${hourLabel((S.peakHour + 1) % 24)}</b>` : ''}
  </div>`;

  const sourcesBlock = `${barRows(S.sources)}
    ${S.devices.length ? `<div style="${font}font-size:13.5px;color:${C.muted};padding-top:12px;">Devices: ${S.devices.map((d) => `<b style="color:${C.ink};">${esc(d.name)} ${d.pct}%</b>`).join(' &nbsp;·&nbsp; ')}</div>` : ''}
    ${S.tags.length ? `<div style="${font}font-size:13px;color:${C.muted};padding:14px 0 6px;">Tagged links (?src=…)</div>${barRows(S.tags)}` : ''}`;

  const sectionsBlock = S.sections.length
    ? S.sections.map((sec) => `<div style="${font}font-size:14px;font-weight:800;color:${C.ink};padding:6px 0 4px;">${esc(sec.title)}</div>${barRows(sec.rows)}<div style="height:12px;line-height:12px;">&nbsp;</div>`).join('')
    : `<div style="${font}font-size:14px;color:${C.muted};">No buttons or links were clicked this week.</div>`;

  const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>Thekla Links weekly report</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.card};border-radius:16px;overflow:hidden;">
    <tr><td style="background:${C.navy};padding:26px 28px 24px;border-bottom:4px solid ${C.red};">
      <div style="${font}font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f3b4bf;font-weight:700;">Thekla Links · Weekly report</div>
      <div style="${font}font-size:26px;line-height:32px;font-weight:800;color:#efe8da;padding-top:6px;">${esc(S.range.label)}</div>
      <div style="${font}font-size:13px;color:#939cab;padding-top:4px;">${esc(S.range.note || 'Monday to Sunday, including Sunday’s late club night')}</div>
    </td></tr>

    ${section('At a glance', `${kpiGrid}<div style="${font}font-size:13.5px;color:${C.muted};padding:10px 6px 0;">${extraLine}</div>`)}
    ${section('Events', `${eventTable}${sellerLine ? `<div style="${font}font-size:13.5px;color:${C.muted};padding-top:12px;">${sellerLine}</div>` : ''}`, 'Opened = details card opened. Tickets = taps through to the ticket site. Events with no clicks are left out.')}
    ${section('Where visitors came from', sourcesBlock)}
    ${section('Buttons & links', sectionsBlock, 'Only things that were clicked this week are shown.')}
    ${section('When people visited', dayChart, 'Visits per day')}

    <tr><td style="padding:28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};"><tr><td style="padding-top:16px;${font}font-size:12.5px;line-height:19px;color:${C.muted};">
        ${S.shareUrl ? `<a href="${esc(S.shareUrl)}" style="color:${C.red};font-weight:700;text-decoration:none;">See this week so far (live) →</a><br>` : ''}
        ${esc(S.footerNote || 'Sent automatically every Monday at 9am from links.theklabristol.co.uk. Visits are counted anonymously, with no cookies.')}
      </td></tr></table>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  const k = Object.fromEntries(S.kpis.map((q) => [q.name, q.value]));
  const subject = `Thekla Links weekly report · ${S.range.label}: ${fmtN(k['Visitors'])} visitors, ${fmtN(k['Ticket taps'])} ticket taps`;
  return { subject, html };
}
