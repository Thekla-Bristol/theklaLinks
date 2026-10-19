// Thekla Admin — links.theklabristol.co.uk/admin
// Firebase Authentication (email + password) and one Firestore document (public/live)
// that the public page reads. See firestore.rules for who can change what.
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const CFG = window.THEKLA_CONFIG || {};
const OWNERS = (CFG.owners || []).map((e) => e.toLowerCase());
const TZ = 'Europe/London';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const has = (v) => v !== undefined && v !== null && v !== '';

// ---------- London time ----------
const fmt = (o) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...o });
const parts = (d) => Object.fromEntries(fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
const dayKey = (d) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
const hm = (d) => { const p = parts(d); return `${p.hour}:${p.minute}`; };
const nightKey = (iso) => dayKey(new Date(new Date(iso).getTime() - 6 * 3600e3));
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10); };
const offsetMin = (d) => { const p = parts(d); return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(d.getTime() / 60000) * 60000) / 60000); };
function londonISO(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = (time || '20:00').split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall;
  for (let i = 0; i < 3; i++) t = wall - offsetMin(new Date(t)) * 60000;
  const off = offsetMin(new Date(t));
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${date}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}
const hhmm = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); if (!m) return s || ''; const h = +m[1]; return `${h % 12 || 12}${m[2] === '00' ? '' : ':' + m[2]}${h < 12 ? 'am' : 'pm'}`; };
const late = (x) => { const m = /^(\d{1,2}):(\d{2})/.exec(x || ''); return m ? (+m[1] < 6 ? 24 + +m[1] : +m[1]) * 60 + +m[2] : 9999; };
const ago = (iso) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hr ago` : `${Math.round(mins / 1440)} days ago`;
};
const when = (iso) => fmt({ weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const STATUS = {
  '': 'Automatic (from the ticket site)', onsale: 'On sale', low: 'Last few tickets', soldout: 'Sold out',
  cancelled: 'Cancelled', postponed: 'Postponed', rescheduled: 'New date', moved: 'Moved',
};
const STATUS_SHORT = { onsale: 'On sale', low: 'Last few', soldout: 'Sold out', cancelled: 'Cancelled', postponed: 'Postponed', rescheduled: 'New date', moved: 'Moved', presale: 'Pre-sale' };
const SELLER = { alttickets: 'Alt Tickets', fatsoma: 'Fatsoma', skiddle: 'Skiddle', thekla: 'Thekla site' };

// ---------- state ----------
let fb = null;          // Firebase modules + instances
let me = '';            // signed-in email
let raw = [];           // events.json events
let feed = {};          // events.json (generatedAt, sources)
let live = {};          // public/live document
let admins = [];        // [{email, addedBy, addedAt}]
let tab = 'tonight';

// ---------- small UI helpers ----------
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('err', !!err); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2200);
}
function friendly(e) {
  const c = e?.code || '';
  return ({
    'auth/invalid-credential': 'That email and password don’t match. Try again, or use “Forgot password?”.',
    'auth/wrong-password': 'That email and password don’t match.',
    'auth/user-not-found': 'That email and password don’t match.',
    'auth/invalid-email': 'That doesn’t look like an email address.',
    'auth/email-already-in-use': 'This email already has a password. Sign in, or use “Forgot password?” to choose a new one.',
    'auth/weak-password': 'Please choose a longer password (at least 10 characters).',
    'auth/password-does-not-meet-requirements': 'Please choose a longer password (at least 10 characters).',
    'auth/operation-not-allowed': 'Email & password sign-in isn’t switched on yet. In the Firebase console: Authentication → Sign-in method → Email/Password → Enable → Save.',
    'auth/unauthorized-domain': 'This web address isn’t allowed yet. In the Firebase console: Authentication → Settings → Authorized domains → add links.theklabristol.co.uk.',
    'auth/configuration-not-found': 'Authentication isn’t set up yet. In the Firebase console: Authentication → Get started, then switch on Email/Password.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'permission-denied': 'You don’t have permission to do that. Check the Firestore rules are published (README step 6), then sign out and in again.',
    'db-missing': 'The database isn’t set up yet. In the Firebase console: Firestore Database → Create database (keep the ID as “(default)”).',
    'db-disabled': 'The Firestore database is switched off for this project. In the Firebase console, open Firestore Database and finish creating it.',
    unavailable: e?.message || 'Can’t reach the server. Check your connection and try again.',
  })[c] || e?.message || 'Something went wrong.';
}
function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.textContent; btn.textContent = 'Please wait…'; } else if (btn.dataset.label) btn.textContent = btn.dataset.label; }

// ---------- auth screens ----------
function showAuth(view) {
  $('#boot').hidden = true; $('#app').hidden = true; $('#auth').hidden = false;
  $$('#auth [data-view]').forEach((el) => { el.hidden = el.dataset.view !== view; });
  $$('#auth .msg').forEach((m) => { m.textContent = ''; m.classList.remove('ok'); });
  const first = $(`#auth [data-view="${view}"] input`);
  if (first) setTimeout(() => first.focus(), 30);
}
document.addEventListener('click', (ev) => {
  const go = ev.target.closest('[data-go]');
  if (go) {
    const email = $('#auth form:not([hidden]) input[name="email"]')?.value;
    showAuth(go.dataset.go);
    if (email) $$(`#auth [data-view="${go.dataset.go}"] input[name="email"]`).forEach((i) => { i.value = email; });
  }
  if (ev.target.closest('[data-signout]')) fb?.auth && fb.a.signOut(fb.auth);
});

async function boot() {
  if (!CFG.firebase?.projectId) { showAuth('setup-needed'); return; }
  // Only the sign-in library is loaded. The database is reached with plain web requests
  // (see "database" below): quicker to load, and a save can never hang.
  const [app, a] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`)]);
  const inst = app.initializeApp(CFG.firebase);
  const auth = a.getAuth(inst);
  auth.languageCode = 'en-GB';
  fb = { a, auth };
  a.onAuthStateChanged(auth, onUser);
}

let unsub = null;
async function onUser(user) {
  if (unsub) { unsub(); unsub = null; }
  $('#boot').hidden = false; $('#auth').hidden = true; $('#app').hidden = true;
  if (!user) { me = ''; showAuth('signin'); return; }
  me = (user.email || '').toLowerCase();
  if (!user.emailVerified) { $('#verify-email').textContent = me; showAuth('verify'); return; }
  // Admin check: only admins can read the admin list
  try {
    await loadAdmins();
  } catch (e) {
    if (e.code === 'permission-denied') { $('#denied-email').textContent = me; showAuth('denied'); return; }
    showAuth('signin'); $('#f-signin .msg').textContent = friendly(e); return;
  }
  startApp();
}

$('#f-signin').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget; const btn = $('button[type=submit]', f);
  const email = f.email.value.trim().toLowerCase(); const pw = f.password.value;
  if (!email || !pw) { $('.msg', f).textContent = 'Enter your email and password.'; return; }
  busy(btn, true);
  try { await fb.a.signInWithEmailAndPassword(fb.auth, email, pw); f.password.value = ''; }
  catch (e) { $('.msg', f).textContent = friendly(e); }
  busy(btn, false);
});

$('#f-setup').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget; const btn = $('button[type=submit]', f); const msg = $('.msg', f);
  const email = f.email.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Enter your email address.'; return; }
  if (f.password.value.length < 10) { msg.textContent = 'Use at least 10 characters.'; return; }
  if (f.password.value !== f.password2.value) { msg.textContent = 'The two passwords don’t match.'; return; }
  busy(btn, true);
  try {
    const cred = await fb.a.createUserWithEmailAndPassword(fb.auth, email, f.password.value);
    await fb.a.sendEmailVerification(cred.user, { url: location.origin + location.pathname });
    f.reset();
  } catch (e) { msg.textContent = friendly(e); }
  busy(btn, false);
});

$('#f-reset').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.currentTarget; const btn = $('button[type=submit]', f); const msg = $('.msg', f);
  const email = f.email.value.trim().toLowerCase();
  if (!email) { msg.textContent = 'Enter your email address.'; return; }
  busy(btn, true);
  try {
    await fb.a.sendPasswordResetEmail(fb.auth, email, { url: location.origin + location.pathname });
    msg.classList.add('ok'); msg.textContent = 'If that email has an account, a reset link is on its way. Check your junk folder too.';
  } catch (e) { msg.classList.remove('ok'); msg.textContent = friendly(e); }
  busy(btn, false);
});

$('#verify-continue').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget; const msg = $('[data-view="verify"] .msg');
  busy(btn, true);
  try {
    await fb.a.reload(fb.auth.currentUser);
    await fb.auth.currentUser.getIdToken(true); // so the server sees the confirmed email
    if (fb.auth.currentUser.emailVerified) onUser(fb.auth.currentUser);
    else msg.textContent = 'Not confirmed yet. Open the link in the email first.';
  } catch (e) { msg.textContent = friendly(e); }
  busy(btn, false);
});
$('#verify-resend').addEventListener('click', async () => {
  const msg = $('[data-view="verify"] .msg');
  try { await fb.a.sendEmailVerification(fb.auth.currentUser, { url: location.origin + location.pathname }); msg.classList.add('ok'); msg.textContent = 'Sent again.'; }
  catch (e) { msg.classList.remove('ok'); msg.textContent = friendly(e); }
});

// ---------- database (Firestore over plain web requests) ----------
const DB = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(CFG.firebase?.projectId || '')}/databases/(default)/documents`;
const docName = (...segs) => `projects/${CFG.firebase?.projectId}/databases/(default)/documents/${segs.join('/')}`;
const docUrl = (...segs) => `${DB}/${segs.map(encodeURIComponent).join('/')}`;

class DbError extends Error { constructor(code, message) { super(message); this.code = code; } }

const tsVal = (s) => ({ __ts: s, toDate: () => new Date(s) });
function dec(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return tsVal(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields);
  return null;
}
const decFields = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([k, x]) => [k, dec(x)]));
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v.__ts) return { timestampValue: v.__ts };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}
const encFields = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)]));
// Field paths: names with dashes, dots etc. go in backticks
const seg = (k) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : '`' + String(k).replace(/[\\`]/g, (c) => '\\' + c) + '`');
const autoId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('');

async function api(url, { method = 'GET', body, auth = true, tries = 2 } = {}) {
  for (let i = 0; ; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let r;
    try {
      const headers = { 'content-type': 'application/json' };
      if (auth && fb?.auth?.currentUser) headers.authorization = `Bearer ${await fb.auth.currentUser.getIdToken(i > 0)}`;
      r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal, cache: 'no-store' });
    } catch (e) {
      clearTimeout(timer);
      if (i + 1 < tries && (method === 'GET' || url.endsWith(':runQuery'))) continue; // never resend a save: it may have gone through
      throw new DbError('unavailable', e.name === 'AbortError'
        ? 'The server took too long to answer. Check your connection and try again.'
        : 'Couldn’t reach the database. Check your connection. If you use an ad blocker or privacy extension, allow firestore.googleapis.com.');
    }
    clearTimeout(timer);
    if (r.ok) return r.status === 204 ? null : r.json();
    let err = {};
    try { err = (await r.json()).error || {}; } catch { /* not JSON */ }
    if (r.status === 401 && i + 1 < tries) continue; // token expired: refresh once
    if (r.status === 404 && url.includes('/documents/public/live') && method === 'GET' && !/database/i.test(err.message || '')) return null;
    const msg = err.message || `HTTP ${r.status}`;
    if (r.status === 403 || err.status === 'PERMISSION_DENIED') throw new DbError('permission-denied', msg);
    if (r.status === 404 || /database .*does not exist|not found/i.test(msg)) throw new DbError('db-missing', msg);
    if (r.status === 400 && /FAILED_PRECONDITION|not been used|disabled/i.test(`${err.status} ${msg}`)) throw new DbError('db-disabled', msg);
    if (r.status >= 500 && i + 1 < tries) { await new Promise((res) => setTimeout(res, 800)); continue; }
    throw new DbError(err.status || `http-${r.status}`, msg);
  }
}

async function getLive() {
  const d = await api(docUrl('public', 'live'));
  return d ? decFields(d.fields) : {};
}
async function listAdmins() {
  const d = await api(`${DB}/admins?pageSize=300`);
  return (d?.documents || []).map((x) => ({ email: decodeURIComponent(x.name.split('/').pop()), ...decFields(x.fields) }));
}
async function queryLog(n = 60) {
  const d = await api(`${DB}:runQuery`, { method: 'POST', body: { structuredQuery: { from: [{ collectionId: 'log' }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: n } } });
  return (d || []).filter((x) => x.document).map((x) => decFields(x.document.fields));
}
/** One all-or-nothing save. writes: Firestore REST "Write" objects */
const commit = (writes) => api(`${DB}:commit`, { method: 'POST', body: { writes } });
const logWrite = (action, target, summary) => ({
  update: { name: docName('log', autoId()), fields: encFields({ by: me, action, target: target || '', summary: summary || '' }) },
  updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }],
  currentDocument: { exists: false },
});

// ---------- data ----------
async function loadAdmins() {
  admins = await listAdmins();
}

async function loadFeed() {
  try {
    const r = await fetch(`../events.json?t=${Date.now()}`, { cache: 'no-store' });
    feed = await r.json();
    raw = feed.events || [];
  } catch { feed = {}; raw = []; toast('Couldn’t load the listings. Refresh to try again.', true); }
}

// Picks up changes made by other admins: checks every 20 seconds while the tab is open
let liveStamp = '';
async function refreshLive({ quiet = true } = {}) {
  try {
    const d = await getLive();
    const stamp = JSON.stringify(d);
    if (stamp !== liveStamp) { liveStamp = stamp; live = d; renderAll(); }
  } catch (e) { if (!quiet) toast(friendly(e), true); }
}
function watchLive() {
  const t = setInterval(() => { if (!document.hidden && !$('#editor').open) refreshLive(); }, 20000);
  const vis = () => { if (!document.hidden) refreshLive(); };
  document.addEventListener('visibilitychange', vis);
  unsub = () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
}

/** Clean an object for saving: drop empty values; returns null if nothing left. */
function clean(v) {
  if (Array.isArray(v)) { const a = v.map(clean).filter((x) => x !== null); return a.length ? a : null; }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { const c = clean(x); if (c !== null) o[k] = c; }
    return Object.keys(o).length ? o : null;
  }
  if (v === undefined || v === null || v === false) return null;
  if (typeof v === 'string') { const s = v.trim(); return s ? s : null; }
  return v;
}

/**
 * Save changes to public/live and add a change-log entry in one go.
 * changes: [[['overrides', id], value or null to remove], …]
 */
async function save(changes, log) {
  // Only the named fields change; a field in the mask but not in "fields" is removed.
  const fields = {};
  const mask = [];
  for (const [path, value] of changes) {
    mask.push(path.map(seg).join('.'));
    if (value === null) continue;
    let o = fields;
    for (const k of path.slice(0, -1)) { o[k] ||= {}; o = o[k]; }
    o[path[path.length - 1]] = value;
  }
  await commit([
    { update: { name: docName('public', 'live'), fields: encFields(fields) }, updateMask: { fieldPaths: mask }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
    logWrite(log.action, log.target, log.summary),
  ]);
  // Show the saved state straight away (also picks up anyone else's changes)
  await refreshLive({ quiet: true });
}
async function trySave(changes, log, okMsg = 'Saved. It’s live on the page now.') {
  try { await save(changes, log); toast(okMsg); return true; }
  catch (e) { toast(friendly(e), true); return false; }
}

// ---------- events (listings + admin changes) ----------
function allEvents({ past = false } = {}) {
  const today = dayKey(new Date());
  const from = past ? addDays(today, -8) : today;
  const ov = live.overrides || {};
  const list = raw.map((e) => ({ id: e.id, base: e, o: ov[e.id] || null, manual: false }));
  for (const [id, m] of Object.entries(live.manual || {})) list.push({ id, base: { ...m, id, source: 'thekla' }, o: ov[id] || null, manual: true });
  return list
    .filter((x) => x.base.start && (past ? nightKey(x.base.start) < today && nightKey(x.base.start) >= from : nightKey(x.base.start) >= from))
    .sort((a, b) => new Date(a.base.start) - new Date(b.base.start));
}
const titleOf = (x) => x.o?.title || x.base.title;
const statusOf = (x) => x.o?.status || x.base.status || '';
function badges(x) {
  const b = [];
  const s = statusOf(x);
  if (s && s !== 'onsale') b.push(`<span class="badge ${['soldout', 'cancelled', 'postponed'].includes(s) ? 'warn' : 'gold'}">${esc(STATUS_SHORT[s] || s)}</span>`);
  if (x.o?.hidden) b.push('<span class="badge red">Hidden</span>');
  if (x.o?.featured === 'pin') b.push('<span class="badge ok">Featured</span>');
  if (x.o?.featured === 'never') b.push('<span class="badge">Not featured</span>');
  if (x.o?.times) b.push('<span class="badge ok">Times</span>');
  if (x.manual) b.push('<span class="badge">Added by hand</span>');
  else if (x.o) b.push('<span class="badge">Edited</span>');
  return b.join('');
}
function row(x) {
  const d = new Date(x.base.start);
  return `<button type="button" class="ev-row ${x.o?.hidden ? 'is-hidden' : ''}" data-edit-event="${esc(x.id)}">
    <span class="date-tile">${esc(fmt({ weekday: 'short' }).format(d))}<b>${esc(fmt({ day: 'numeric' }).format(d))}</b></span>
    <span><span class="t">${esc(titleOf(x))}</span>
      <span class="m"><span class="dot ${x.base.type === 'club' ? 'club' : ''}"></span>${x.base.type === 'club' ? 'Club' : 'Gig'} · ${esc(fmt({ month: 'short' }).format(d))} · ${esc(hhmm(hm(d)))}${x.manual ? '' : ` · ${esc(SELLER[x.base.source] || x.base.source || '')}`} ${badges(x)}</span></span>
    <span class="chev" aria-hidden="true">›</span>
  </button>`;
}

function renderEvents() {
  const q = $('#ev-search').value.trim().toLowerCase();
  const f = $('#ev-filter').value;
  let list = allEvents({ past: f === 'past' });
  if (q) list = list.filter((x) => `${titleOf(x)} ${x.base.support || ''}`.toLowerCase().includes(q));
  if (f === 'gig' || f === 'club') list = list.filter((x) => (x.base.type === 'club' ? 'club' : 'gig') === f);
  if (f === 'edited') list = list.filter((x) => x.o || x.manual);
  if (f === 'hidden') list = list.filter((x) => x.o?.hidden);
  if (f === 'manual') list = list.filter((x) => x.manual);
  if (!list.length) { $('#ev-list').innerHTML = `<div class="empty">No events match.</div>`; return; }
  let lastMonth = '';
  $('#ev-list').innerHTML = list.map((x) => {
    const m = fmt({ month: 'long', year: 'numeric' }).format(new Date(x.base.start));
    const h = m !== lastMonth ? `<h3 class="day-h">${esc(m)}</h3>` : '';
    lastMonth = m;
    return h + row(x);
  }).join('');
}
$('#ev-search').addEventListener('input', renderEvents);
$('#ev-filter').addEventListener('change', renderEvents);
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-edit-event]');
  if (b) openEditor(b.dataset.editEvent, { focus: b.dataset.focus });
});
$('#add-event').addEventListener('click', () => openEditor(null));

// ---------- tonight ----------
function runRows(base, t) {
  if (!t) return [];
  const rows = [];
  if (t.doors) rows.push([t.doors, 'Doors']);
  for (const a of t.sets || []) if (a?.name) rows.push([a.time || '', `${a.name}${a.role === 'headliner' ? ' (headliner)' : ''}`]);
  if (t.lastEntry) rows.push([t.lastEntry, 'Last entry']);
  rows.push([t.curfew || (base.type === 'club' ? '' : '22:00'), base.type === 'club' ? 'Close' : 'Curfew']);
  return rows.filter((r) => r[0] || r[1] !== 'Close').sort((a, b) => late(a[0]) - late(b[0]));
}
function renderTonight() {
  const today = dayKey(new Date());
  const all = allEvents();
  const block = (key, label) => {
    const list = all.filter((x) => nightKey(x.base.start) === key);
    const head = `<h2 class="sec-h">${label}<small>${esc(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${key}T12:00:00Z`)))}</small></h2>`;
    if (!list.length) return `${head}<div class="empty">Nothing on.</div>`;
    return head + list.map((x) => {
      const t = x.o?.times;
      const rows = runRows(x.base, t);
      const s = x.o?.status || '';
      return `<div class="card tn">
        <div class="tn-title"><b>${esc(titleOf(x))}</b><span class="badge">${x.base.type === 'club' ? 'Club' : 'Gig'}</span></div>
        ${t ? `<ol class="run-list">${rows.map(([tm, l]) => `<li><time>${esc(hhmm(tm))}</time><span>${esc(l)}</span></li>`).join('')}</ol>${t.note ? `<p class="hint">${esc(t.note)}</p>` : ''}`
          : '<p class="hint">No times added yet. Add doors, support, headliner and curfew so they show under tonight’s listing.</p>'}
        <div class="row"><button type="button" class="btn ${t ? 'secondary' : 'primary'}" data-edit-event="${esc(x.id)}" data-focus="times">${t ? 'Edit times' : 'Add times'}</button>
          <button type="button" class="btn ghost" data-edit-event="${esc(x.id)}">Edit event</button></div>
        <div><p class="hint small" style="margin-bottom:6px">Tickets</p>
          <div class="seg" role="group" aria-label="Ticket status">
            ${[['', 'Automatic'], ['low', 'Last few'], ['soldout', 'Sold out']].map(([v, l]) => `<button type="button" data-quick-status="${v}" data-id="${esc(x.id)}" aria-pressed="${s === v}">${l}</button>`).join('')}
          </div></div>
      </div>`;
    }).join('');
  };
  $('#p-tonight').innerHTML = block(today, 'Tonight') + block(addDays(today, 1), 'Tomorrow');
}
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-quick-status]');
  if (!b) return;
  const id = b.dataset.id; const v = b.dataset.quickStatus;
  const o = { ...(live.overrides?.[id] || {}) };
  if (v) o.status = v; else delete o.status;
  const c = clean(o);
  const x = allEvents().find((e) => e.id === id);
  await trySave([[['overrides', id], c]], { action: 'Status', target: x ? titleOf(x) : id, summary: v ? STATUS_SHORT[v] : 'Automatic' });
});

// ---------- event editor ----------
let editing = null; // { id, manual, x }
function actRow(a = {}) {
  return `<div class="act">
    <input type="text" name="act-name" placeholder="Act name" value="${esc(a.name || '')}" aria-label="Act name">
    <input type="time" name="act-time" value="${esc(a.time || '')}" aria-label="Stage time">
    <div class="act-foot"><select name="act-role" aria-label="Role">
      ${[['support', 'Support'], ['headliner', 'Headliner'], ['dj', 'DJ'], ['other', 'Other']].map(([v, l]) => `<option value="${v}" ${a.role === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select><button type="button" class="btn ghost x" data-act-remove aria-label="Remove act">×</button></div>
  </div>`;
}

function openEditor(id, { focus } = {}) {
  const x = id ? [...allEvents(), ...allEvents({ past: true })].find((e) => e.id === id) : null;
  const manual = !x || x.manual;
  const b = x ? x.base : { type: 'gig' };
  const o = x?.o || {};
  const t = o.times || {};
  editing = { id, manual, x };
  const d = b.start ? new Date(b.start) : null;
  const endD = b.end ? new Date(b.end) : null;
  const isClub = b.type === 'club';

  $('#ed-title').textContent = x ? titleOf(x) : 'Add an event';
  const autoStatus = b.status ? (STATUS_SHORT[b.status] || b.status) : 'On sale';

  $('#ed-body').innerHTML = `
    ${manual ? `
    <fieldset class="fs"><legend>Event</legend>
      <label>Title<input name="m-title" required value="${esc(b.title || '')}"></label>
      <div class="grid2">
        <label>Type<select name="m-type"><option value="gig" ${!isClub ? 'selected' : ''}>Gig</option><option value="club" ${isClub ? 'selected' : ''}>Club night</option></select></label>
        <label>Date<input type="date" name="m-date" required value="${d ? nightKey(b.start) : ''}"></label>
        <label>Starts (doors)<input type="time" name="m-start" value="${d ? hm(d) : '19:00'}"></label>
        <label>Ends<input type="time" name="m-end" value="${endD ? hm(endD) : ''}" placeholder="22:00"></label>
      </div>
      <label>Support / with<input name="m-support" value="${esc(b.support || '')}"></label>
      <label>About<textarea name="m-about" placeholder="A few lines about the event. Leave a blank line between paragraphs.">${esc(b.about || '')}</textarea></label>
      <label>Ticket link<input type="url" name="m-ticket" placeholder="https://…" value="${esc(b.ticketUrl || '')}"></label>
      <label>Info link (if no tickets)<input type="url" name="m-info" placeholder="https://…" value="${esc(b.infoUrl || '')}"></label>
      <div class="grid2">
        <label>Price<input name="m-price" placeholder="e.g. £12" value="${esc(b.price || '')}"></label>
        <label>Age<input name="m-age" placeholder="e.g. 14+" value="${esc(b.age || '')}"></label>
      </div>
      <label>Image link<input type="url" name="m-image" placeholder="https://… (square or landscape)" value="${esc(b.image || '')}"></label>
    </fieldset>` : `
    <p class="hint">${esc(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d))} · ${esc(hhmm(hm(d)))} · from ${esc(SELLER[b.source] || b.source)}. Anything you leave empty uses the ticket site’s details.</p>`}

    <fieldset class="fs" id="fs-status"><legend>Tickets</legend>
      <label>Status<select name="status">
        ${Object.entries(STATUS).map(([v, l]) => `<option value="${v}" ${(o.status || '') === v ? 'selected' : ''}>${v === '' && !manual ? `${l}: ${autoStatus}` : v === '' ? 'No label' : l}</option>`).join('')}
      </select></label>
      <label>Note shown with it <span class="hint small">(optional, e.g. “New date: Fri 12 Dec. Tickets still valid.”)</span><input name="statusNote" maxlength="160" value="${esc(o.statusNote || '')}"></label>
      ${manual ? '' : `<label>Ticket link <span class="hint small">(optional, replaces the ticket site link)</span><input type="url" name="ticketUrl" placeholder="${esc(b.ticketUrl || b.url || 'https://…')}" value="${esc(o.ticketUrl || '')}"></label>`}
    </fieldset>

    <fieldset class="fs" id="fs-times"><legend>Times on the night</legend>
      <p class="hint small">Shows under the listing on the day, and in the event details.</p>
      <div class="grid3">
        <label>Doors<input type="time" name="t-doors" value="${esc(t.doors || '')}"></label>
        <label>${isClub ? 'Close' : 'Curfew'}<input type="time" name="t-curfew" value="${esc(t.curfew || '')}" placeholder="${isClub ? '' : '22:00'}"></label>
        <label>Last entry<input type="time" name="t-last" value="${esc(t.lastEntry || '')}"></label>
      </div>
      <div class="acts" id="acts">${(t.sets || []).map(actRow).join('')}</div>
      <div class="row">
        <button type="button" class="btn secondary sm" data-act-add>+ Add act</button>
        ${!(t.sets || []).length && !manual ? `<button type="button" class="btn ghost sm" data-act-headliner>+ ${esc((titleOf(x) || '').slice(0, 30))} as headliner</button>` : ''}
        ${!(t.sets || []).length && b.support ? `<button type="button" class="btn ghost sm" data-act-support>+ ${esc(b.support.slice(0, 30))} as support</button>` : ''}
      </div>
      <label>Note <span class="hint small">(optional, e.g. “Times may change on the night”)</span><input name="t-note" maxlength="120" value="${esc(t.note || '')}"></label>
      ${isClub ? '' : '<p class="hint small">The 10pm curfew shows automatically if you leave Curfew empty.</p>'}
    </fieldset>

    ${manual ? '' : `
    <fieldset class="fs"><legend>Details</legend>
      <label>Title on the page<input name="title" placeholder="${esc(b.title)}" value="${esc(o.title || '')}"></label>
      <label>Support / with <span class="hint small">(type - to hide)</span><input name="support" placeholder="${esc(b.support || 'None listed')}" value="${esc(o.support || '')}"></label>
      <label>Bio
        <textarea name="bio" rows="7" placeholder="${esc((b.about || []).join('\n\n') || 'No description from the ticket site.')}">${esc(o.bio || '')}</textarea></label>
      <div class="row"><span class="hint small" style="flex:1">Leave a blank line between paragraphs. Empty = use the ticket site’s text.</span>${(b.about || []).length ? '<button type="button" class="btn ghost sm" data-bio-copy>Start from ticket site text</button>' : ''}</div>
      <label>Image link <span class="hint small">(optional)</span><input type="url" name="image" placeholder="https://…" value="${esc(o.image || '')}"></label>
      ${o.image || b.image ? `<img class="img-prev" src="${esc(o.image || b.image)}" alt="" onerror="this.remove()">` : ''}
    </fieldset>`}

    <fieldset class="fs"><legend>On the page</legend>
      <label>Featured section<select name="featured">
        <option value="">Automatic</option>
        <option value="pin" ${o.featured === 'pin' ? 'selected' : ''}>Always feature</option>
        <option value="never" ${o.featured === 'never' ? 'selected' : ''}>Never feature</option>
      </select></label>
      <label class="check"><input type="checkbox" name="hidden" ${o.hidden ? 'checked' : ''}> Hide this event from the page</label>
    </fieldset>

    <div class="ed-foot">
      ${x ? `<a class="btn ghost sm" href="../#e-${encodeURIComponent(x.id)}" target="_blank" rel="noopener">View on page</a>` : '<span></span>'}
      ${x && manual ? '<button type="button" class="btn danger sm" data-ed-delete>Delete event</button>' : ''}
      ${x && !manual && x.o ? '<button type="button" class="btn danger sm" data-ed-reset>Undo all changes</button>' : ''}
    </div>`;

  const dlg = $('#editor');
  if (!dlg.open) dlg.showModal();
  $('.ed-body', dlg).scrollTop = 0;
  if (focus === 'times') setTimeout(() => { $('#fs-times').scrollIntoView({ block: 'start' }); $('#fs-times input')?.focus({ preventScroll: true }); }, 50);
}

$('#editor').addEventListener('click', (ev) => {
  const t = ev.target;
  if (t.closest('[data-ed-close]')) $('#editor').close();
  if (t.closest('[data-act-add]')) $('#acts').insertAdjacentHTML('beforeend', actRow());
  if (t.closest('[data-act-headliner]')) { $('#acts').insertAdjacentHTML('beforeend', actRow({ name: titleOf(editing.x), role: 'headliner' })); t.closest('button').remove(); }
  if (t.closest('[data-act-support]')) { $('#acts').insertAdjacentHTML('afterbegin', actRow({ name: editing.x.base.support, role: 'support' })); t.closest('button').remove(); }
  if (t.closest('[data-act-remove]')) t.closest('.act').remove();
  if (t.closest('[data-bio-copy]')) { const ta = $('#ed-form [name="bio"]'); ta.value = (editing.x.base.about || []).join('\n\n'); ta.focus(); }
  if (t.closest('[data-ed-delete]')) deleteManual();
  if (t.closest('[data-ed-reset]')) resetEvent();
});

function readTimes(form) {
  const sets = $$('.act', form).map((el) => ({
    name: $('[name="act-name"]', el).value, time: $('[name="act-time"]', el).value, role: $('[name="act-role"]', el).value,
  })).filter((a) => a.name.trim());
  const t = { doors: form['t-doors'].value, curfew: form['t-curfew'].value, lastEntry: form['t-last'].value, note: form['t-note'].value, sets };
  return clean(t);
}
function summarise(before, after) {
  const names = { status: 'status', statusNote: 'status note', ticketUrl: 'ticket link', times: 'times', title: 'title', support: 'support', bio: 'bio', image: 'image', featured: 'featured', hidden: 'hidden' };
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed = [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  return changed.map((k) => {
    if (k === 'status') return after?.status ? `status: ${STATUS_SHORT[after.status]}` : 'status: automatic';
    if (k === 'hidden') return after?.hidden ? 'hidden' : 'shown again';
    return names[k] || k;
  }).join(', ');
}

$('#ed-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.currentTarget;
  const btn = $('#ed-save');
  const { id, manual, x } = editing;
  const ov = clean({
    status: form.status.value, statusNote: form.statusNote.value,
    ticketUrl: form.ticketUrl?.value, title: form.title?.value, support: form.support?.value,
    bio: form.bio?.value, image: form.image?.value,
    featured: form.featured.value, hidden: form.hidden.checked, times: readTimes(form),
  });
  for (const k of ['ticketUrl', 'image']) if (ov?.[k] && !/^https?:\/\//i.test(ov[k])) { toast('Links need to start with https://', true); return; }

  const changes = [];
  let newId = id;
  if (manual) {
    const title = form['m-title'].value.trim(); const date = form['m-date'].value;
    if (!title || !date) { toast('Add a title and date.', true); return; }
    const start = londonISO(date, form['m-start'].value || '19:00');
    let end = '';
    if (form['m-end'].value) {
      end = londonISO(date, form['m-end'].value);
      if (new Date(end) <= new Date(start)) end = londonISO(addDays(date, 1), form['m-end'].value); // finishes after midnight
    }
    for (const k of ['m-ticket', 'm-info', 'm-image']) if (form[k].value && !/^https?:\/\//i.test(form[k].value.trim())) { toast('Links need to start with https://', true); return; }
    const base = clean({
      title, type: form['m-type'].value, start, end, support: form['m-support'].value, about: form['m-about'].value,
      ticketUrl: form['m-ticket'].value, infoUrl: form['m-info'].value, price: form['m-price'].value, age: form['m-age'].value, image: form['m-image'].value,
      timeKnown: true,
    });
    if (!newId) newId = `m-${date}-${slug(title).slice(0, 30)}-${Math.random().toString(36).slice(2, 6)}`;
    changes.push([['manual', newId], base]);
  }
  changes.push([['overrides', newId], ov]);
  busy(btn, true);
  const ok = await trySave(changes, {
    action: manual ? (id ? 'Edited added event' : 'Added event') : 'Edited event',
    target: manual ? form['m-title'].value.trim() : titleOf(x),
    summary: manual ? '' : summarise(x?.o, ov) || 'no changes',
  });
  busy(btn, false);
  if (ok) $('#editor').close();
});

async function deleteManual() {
  const { id } = editing;
  const title = live.manual?.[id]?.title || id;
  if (!confirm(`Delete “${title}”? This removes it from the page.`)) return;
  if (await trySave([[['manual', id], null], [['overrides', id], null]], { action: 'Deleted event', target: title }, 'Deleted.')) $('#editor').close();
}
async function resetEvent() {
  const { id, x } = editing;
  if (!confirm('Undo all admin changes to this event? It will show exactly as the ticket site lists it.')) return;
  if (await trySave([[['overrides', id], null]], { action: 'Undid changes', target: titleOf(x) }, 'Changes undone.')) $('#editor').close();
}

// ---------- notice ----------
function renderNotice() {
  const n = live.notice || {};
  const until = n.until ? new Date(n.until) : null;
  const expired = until && until < new Date();
  const localUntil = until ? (() => { const p = parts(until); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; })() : '';
  $('#p-notice').innerHTML = `
    <h2 class="sec-h">Notice banner<small>A message at the top of the page, e.g. “Doors delayed to 8pm tonight” or “Office closed Monday”.</small></h2>
    <form class="card" id="f-notice">
      <p class="hint">Right now: <b>${n.on && n.text && !expired ? 'showing' : expired ? 'ended' : 'off'}</b></p>
      <label>Message<textarea name="text" maxlength="240" placeholder="Keep it short">${esc(n.text || '')}</textarea></label>
      <label>Style<select name="level"><option value="info">Normal</option><option value="urgent" ${n.level === 'urgent' ? 'selected' : ''}>Urgent (red)</option></select></label>
      <div class="grid2">
        <label>Link <span class="hint small">(optional)</span><input type="url" name="linkUrl" placeholder="https://…" value="${esc(n.linkUrl || '')}"></label>
        <label>Link text<input name="linkText" maxlength="40" placeholder="More info" value="${esc(n.linkText || '')}"></label>
      </div>
      <label>Remove automatically at <span class="hint small">(optional, UK time)</span><input type="datetime-local" name="until" value="${esc(localUntil)}"></label>
      <div><p class="hint small" style="margin-bottom:6px">Preview</p><div class="notice-prev" id="notice-prev"></div></div>
      <div class="row end">
        ${n.on ? '<button type="button" class="btn ghost" id="notice-off">Turn off</button>' : ''}
        <button type="submit" class="btn primary">${n.on ? 'Update notice' : 'Show notice'}</button>
      </div>
    </form>`;
  const f = $('#f-notice');
  const prev = () => {
    const p = $('#notice-prev');
    p.className = `notice-prev ${f.level.value === 'urgent' ? 'urgent' : ''}`;
    p.innerHTML = `<i>${f.level.value === 'urgent' ? '!' : 'i'}</i><p>${esc(f.text.value || 'Your message')}${f.linkUrl.value ? ` <u>${esc(f.linkText.value || 'More info')} →</u>` : ''}</p>`;
  };
  f.addEventListener('input', prev); prev();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!f.text.value.trim()) { toast('Write a message first.', true); return; }
    if (f.linkUrl.value && !/^https?:\/\//i.test(f.linkUrl.value)) { toast('Links need to start with https://', true); return; }
    // datetime-local is the admin's own clock; convert as UK time
    const until = f.until.value ? new Date(londonISO(f.until.value.slice(0, 10), f.until.value.slice(11, 16))).toISOString() : '';
    const notice = clean({ on: true, text: f.text.value, level: f.level.value, linkUrl: f.linkUrl.value, linkText: f.linkText.value, until });
    await trySave([[['notice'], notice]], { action: 'Notice', target: 'Banner', summary: notice.text.slice(0, 80) });
  });
  $('#notice-off')?.addEventListener('click', async () => {
    await trySave([[['notice'], { ...(live.notice || {}), on: false }]], { action: 'Notice', target: 'Banner', summary: 'turned off' }, 'Notice turned off.');
  });
}

// ---------- info pages ----------
let defaults = null; // { blocks: [{key,label,mode,text}], faq: [...] }
let faqDraft = null;
function htmlToText(html, mode) {
  const box = document.createElement('div');
  box.innerHTML = html;
  const walk = (n) => {
    if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const inner = [...n.childNodes].map(walk).join('');
    const tag = n.tagName.toLowerCase();
    if (tag === 'b' || tag === 'strong') return `**${inner}**`;
    if (tag === 'a') return `[${inner}](${n.getAttribute('href')})`;
    if (tag === 'br') return '\n';
    if (tag === 'p') return `\n\n${inner.trim()}\n\n`;
    return inner;
  };
  const t = [...box.childNodes].map(walk).join('').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return mode === 'block' ? t : t.replace(/\n\n/g, '\n');
}
async function loadDefaults() {
  if (defaults) return defaults;
  const html = await (await fetch(`../index.html?t=${Date.now()}`, { cache: 'no-store' })).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = $$('[data-edit]', doc).map((el) => ({ key: el.dataset.edit, label: el.dataset.editLabel || el.dataset.edit, mode: el.dataset.editMode || 'inline', text: htmlToText(el.innerHTML, el.dataset.editMode) }));
  const faq = [];
  let g = null;
  for (const el of $('#faq-groups', doc)?.children || []) {
    if (el.matches('h3.faq-group')) { g = { group: el.textContent.trim(), items: [] }; faq.push(g); }
    else if (el.matches('.faq-list')) {
      if (!g) { g = { group: '', items: [] }; faq.push(g); }
      for (const d of $$('details', el)) g.items.push({ q: $('summary', d).textContent.trim(), a: htmlToText($('.faq-a', d).innerHTML, 'block') });
    }
  }
  defaults = { blocks, faq };
  return defaults;
}

async function renderInfo() {
  const pane = $('#p-info');
  if (!defaults) pane.innerHTML = '<div class="empty">Loading…</div>';
  let d;
  try { d = await loadDefaults(); } catch { pane.innerHTML = '<div class="empty">Couldn’t load the page text. Refresh to try again.</div>'; return; }
  const saved = live.info?.blocks || {};
  if (!faqDraft) faqDraft = JSON.parse(JSON.stringify(live.info?.faq?.length ? live.info.faq : d.faq));
  // keep focus/scroll if the page re-renders while typing
  if (pane.contains(document.activeElement) && pane.dataset.ready) return;
  pane.dataset.ready = '1';
  pane.innerHTML = `
    <h2 class="sec-h">Info pages<small>Text on the main page and in the pop-up cards. Use **bold** and [link text](https://…). Leave a blank line for a new paragraph.</small></h2>
    ${d.blocks.map((b) => `
      <div class="card blk" data-blk="${esc(b.key)}">
        <h3>${esc(b.label)} ${has(saved[b.key]) ? '<span class="badge">Edited</span>' : ''}</h3>
        <textarea rows="${b.mode === 'block' ? 5 : 3}">${esc(has(saved[b.key]) ? saved[b.key] : b.text)}</textarea>
        <div class="row">${has(saved[b.key]) ? '<button type="button" class="btn ghost sm" data-blk-reset>Back to original</button>' : '<span></span>'}<button type="button" class="btn primary sm" data-blk-save>Save</button></div>
      </div>`).join('')}
    <h2 class="sec-h">FAQs ${live.info?.faq?.length ? '<span class="badge">Edited</span>' : ''}</h2>
    <div id="faq-ed" class="pane"></div>
    <div class="row end">
      ${live.info?.faq?.length ? '<button type="button" class="btn ghost" data-faq-reset>Back to original FAQs</button>' : ''}
      <button type="button" class="btn secondary" data-faq-addgroup>+ Add group</button>
      <button type="button" class="btn primary" data-faq-save>Save FAQs</button>
    </div>`;
  renderFaqEditor();
}
function renderFaqEditor() {
  $('#faq-ed').innerHTML = faqDraft.map((g, gi) => `
    <div class="faq-g" data-g="${gi}">
      <div class="row"><input data-f="group" value="${esc(g.group)}" placeholder="Group heading" aria-label="Group heading" style="flex:1">
        <span class="mini"><button type="button" class="btn ghost" data-faq="gup" aria-label="Move group up">↑</button><button type="button" class="btn ghost" data-faq="gdel" aria-label="Delete group">Delete</button></span></div>
      ${g.items.map((it, qi) => `
        <div class="faq-q" data-q="${qi}">
          <input data-f="q" value="${esc(it.q)}" placeholder="Question" aria-label="Question">
          <textarea data-f="a" placeholder="Answer" aria-label="Answer">${esc(it.a)}</textarea>
          <span class="mini"><button type="button" class="btn ghost" data-faq="up" aria-label="Move up">↑</button><button type="button" class="btn ghost" data-faq="down" aria-label="Move down">↓</button><button type="button" class="btn ghost" data-faq="del">Delete</button></span>
        </div>`).join('')}
      <button type="button" class="btn secondary sm" data-faq="add">+ Add question</button>
    </div>`).join('');
}
$('#p-info').addEventListener('input', (ev) => {
  const el = ev.target.closest('[data-f]');
  if (!el) return;
  const g = faqDraft[+el.closest('[data-g]').dataset.g];
  if (el.dataset.f === 'group') g.group = el.value;
  else g.items[+el.closest('[data-q]').dataset.q][el.dataset.f] = el.value;
});
$('#p-info').addEventListener('click', async (ev) => {
  const t = ev.target;
  const blk = t.closest('[data-blk]');
  if (blk && t.closest('[data-blk-save]')) {
    const key = blk.dataset.blk; const val = $('textarea', blk).value.trim();
    const def = defaults.blocks.find((b) => b.key === key);
    const v = val && val !== def.text ? val : null;
    delete $('#p-info').dataset.ready;
    await trySave([[['info', 'blocks', key], v]], { action: 'Info text', target: def.label, summary: v ? 'edited' : 'back to original' });
    return;
  }
  if (blk && t.closest('[data-blk-reset]')) {
    const key = blk.dataset.blk; const def = defaults.blocks.find((b) => b.key === key);
    delete $('#p-info').dataset.ready;
    await trySave([[['info', 'blocks', key], null]], { action: 'Info text', target: def.label, summary: 'back to original' });
    return;
  }
  const a = t.closest('[data-faq]');
  if (a) {
    const gi = +a.closest('[data-g]').dataset.g; const g = faqDraft[gi];
    const qi = a.closest('[data-q]') ? +a.closest('[data-q]').dataset.q : -1;
    const k = a.dataset.faq;
    if (k === 'add') g.items.push({ q: '', a: '' });
    if (k === 'del' && confirm('Delete this question?')) g.items.splice(qi, 1);
    if (k === 'up' && qi > 0) [g.items[qi - 1], g.items[qi]] = [g.items[qi], g.items[qi - 1]];
    if (k === 'down' && qi < g.items.length - 1) [g.items[qi + 1], g.items[qi]] = [g.items[qi], g.items[qi + 1]];
    if (k === 'gup' && gi > 0) [faqDraft[gi - 1], faqDraft[gi]] = [faqDraft[gi], faqDraft[gi - 1]];
    if (k === 'gdel' && confirm(`Delete the whole “${g.group || 'untitled'}” group?`)) faqDraft.splice(gi, 1);
    renderFaqEditor();
    if (k === 'add') $$(`[data-g="${gi}"] [data-f="q"]`).pop()?.focus();
    return;
  }
  if (t.closest('[data-faq-addgroup]')) { faqDraft.push({ group: 'New group', items: [{ q: '', a: '' }] }); renderFaqEditor(); return; }
  if (t.closest('[data-faq-save]')) {
    const out = faqDraft.map((g) => ({ group: g.group.trim(), items: g.items.filter((i) => i.q.trim()).map((i) => ({ q: i.q.trim(), a: i.a.trim() })) })).filter((g) => g.items.length);
    if (!out.length) { toast('Add at least one question.', true); return; }
    delete $('#p-info').dataset.ready;
    const same = JSON.stringify(out) === JSON.stringify(defaults.faq);
    await trySave([[['info', 'faq'], same ? null : out]], { action: 'FAQs', target: 'FAQs', summary: `${out.reduce((n, g) => n + g.items.length, 0)} questions` });
    return;
  }
  if (t.closest('[data-faq-reset]')) {
    if (!confirm('Put the FAQs back to the original wording?')) return;
    faqDraft = JSON.parse(JSON.stringify(defaults.faq));
    delete $('#p-info').dataset.ready;
    await trySave([[['info', 'faq'], null]], { action: 'FAQs', target: 'FAQs', summary: 'back to original' });
  }
});

// ---------- admins ----------
function renderAdmins() {
  const rows = [
    ...OWNERS.map((e) => ({ email: e, owner: true })),
    ...admins.filter((a) => !OWNERS.includes(a.email)).sort((a, b) => a.email.localeCompare(b.email)),
  ];
  $('#p-admins').innerHTML = `
    <h2 class="sec-h">Admins<small>Everyone here can sign in and change the page.</small></h2>
    <div class="card"><ul class="log">${rows.map((a) => `
      <li><div class="row" style="justify-content:space-between"><b>${esc(a.email)}${a.email === me ? ' (you)' : ''}</b>
        ${a.owner ? '<span class="badge ok">Owner</span>' : a.email === me ? '' : `<button type="button" class="btn danger sm" data-admin-remove="${esc(a.email)}">Remove</button>`}</div>
        ${a.addedBy ? `<span class="who">Added by ${esc(a.addedBy)}${a.addedAt?.toDate ? ` · ${esc(when(a.addedAt.toDate()))}` : ''}</span>` : ''}</li>`).join('')}</ul></div>
    <form class="card" id="f-admin">
      <h3>Add an admin</h3>
      <label>Their email<input type="email" name="email" placeholder="name@theklabristol.co.uk" required></label>
      <p class="hint small">Then send them to <b>${esc(location.host + location.pathname)}</b> and ask them to tap “First time here? Set your password”.</p>
      <div class="row end"><button type="submit" class="btn primary">Add admin</button></div>
    </form>`;
  $('#f-admin').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = ev.currentTarget.email.value.trim().toLowerCase();
    if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) { toast('Enter an email address.', true); return; }
    if (OWNERS.includes(email) || admins.some((a) => a.email === email)) { toast('They’re already an admin.'); return; }
    const btn = $('button[type=submit]', ev.currentTarget);
    busy(btn, true);
    try {
      await commit([
        { update: { name: docName('admins', email), fields: encFields({ addedBy: me }) }, updateTransforms: [{ fieldPath: 'addedAt', setToServerValue: 'REQUEST_TIME' }] },
        logWrite('Added admin', email),
      ]);
      await loadAdmins(); renderAdmins(); toast(`${email} added.`);
    } catch (e) { toast(friendly(e), true); busy(btn, false); }
  });
}
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-admin-remove]');
  if (!b) return;
  const email = b.dataset.adminRemove;
  if (!confirm(`Remove ${email} as an admin?`)) return;
  b.disabled = true;
  try {
    await commit([{ delete: docName('admins', email) }, logWrite('Removed admin', email)]);
    await loadAdmins(); renderAdmins(); toast(`${email} removed.`);
  } catch (e) { toast(friendly(e), true); b.disabled = false; }
});

// ---------- activity ----------
async function renderActivity() {
  const s = feed.sources || {};
  const names = { alttickets: 'Alt Tickets (gigs)', fatsoma: 'Fatsoma (clubs)', skiddle: 'Skiddle', thekla: 'Thekla website', admin: 'Admin changes copy' };
  const ids = new Set([...raw.map((e) => e.id), ...Object.keys(live.manual || {})]);
  const orphans = Object.keys(live.overrides || {}).filter((id) => !ids.has(id));
  const repo = (CFG.githubRepo || '').replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  $('#p-activity').innerHTML = `
    <h2 class="sec-h">Listings<small>Ticket sites are read every 3 hours (more often in the evening). Admin changes show straight away.</small></h2>
    <div class="card">
      <dl class="kv"><div><dt>Last update</dt><dd>${esc(ago(feed.generatedAt))}</dd></div>
      ${Object.entries(names).filter(([k]) => s[k]).map(([k, l]) => {
        const v = s[k];
        const txt = v.skipped ? 'Not set up' : v.ok ? (k === 'admin' ? 'OK' : `OK · ${v.count ?? 0} events`) : `Problem: ${v.error || 'failed'}${v.keptFromLastRun ? ` (showing ${v.keptFromLastRun} from last time)` : ''}`;
        return `<div><dt>${esc(l)}</dt><dd style="color:${v.ok ? 'inherit' : 'var(--warn)'}">${esc(txt)}</dd></div>`;
      }).join('')}</dl>
      <div class="row end">${repo
        ? `<a class="btn secondary" href="https://github.com/${esc(repo)}/actions/workflows/update.yml" target="_blank" rel="noopener">Refresh listings now</a>`
        : '<span class="hint small">Add githubRepo to site/config.js for a “Refresh listings now” button.</span>'}</div>
      ${repo ? '<p class="hint small">Opens GitHub. Tap “Run workflow”, then “Run workflow” again. The page updates about 2 minutes later.</p>' : ''}
    </div>
    ${orphans.length ? `
    <h2 class="sec-h">Old changes<small>These events are no longer on the ticket sites (they’ve finished, or been renamed). Clear them if you don’t need them.</small></h2>
    <div class="card"><ul class="log">${orphans.map((id) => `<li><div class="row" style="justify-content:space-between"><span>${esc(live.overrides[id]?.title || id)}</span><button type="button" class="btn ghost sm" data-orphan="${esc(id)}">Clear</button></div></li>`).join('')}</ul></div>` : ''}
    <h2 class="sec-h">Change log<small>The last 60 changes.</small></h2>
    <div class="card" id="log"><div class="empty">Loading…</div></div>`;
  try {
    const items = await queryLog(60);
    $('#log').innerHTML = items.length ? `<ul class="log">${items.map((l) => `<li><span><b>${esc(l.action)}</b>${l.target ? ` · ${esc(l.target)}` : ''}${l.summary ? ` — ${esc(l.summary)}` : ''}</span><span class="who">${esc(l.by)} · ${l.at?.toDate ? esc(when(l.at.toDate())) : 'just now'}</span></li>`).join('')}</ul>` : '<div class="empty">No changes yet.</div>';
  } catch (e) { $('#log').innerHTML = `<div class="empty">${esc(friendly(e))}</div>`; }
}
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-orphan]');
  if (!b) return;
  const id = b.dataset.orphan;
  if (await trySave([[['overrides', id], null]], { action: 'Cleared old change', target: live.overrides?.[id]?.title || id }, 'Cleared.')) renderActivity();
});

// ---------- shell ----------
function setTab(name) {
  tab = name;
  $$('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('.pane').forEach((p) => { p.hidden = p.id !== `p-${name}`; });
  try { sessionStorage.setItem('thekla-admin-tab', name); } catch {}
  renderTab();
}
function renderTab() {
  if (tab === 'tonight') renderTonight();
  if (tab === 'events') renderEvents();
  if (tab === 'notice') { if (!$('#p-notice').contains(document.activeElement)) renderNotice(); }
  if (tab === 'info') renderInfo();
  if (tab === 'admins') renderAdmins();
  if (tab === 'activity') renderActivity();
}
function renderAll() { if (tab !== 'activity') renderTab(); }
$('.tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

$('#menu-btn').addEventListener('click', () => { const m = $('#menu'); m.hidden = !m.hidden; $('#menu-btn').setAttribute('aria-expanded', String(!m.hidden)); });
document.addEventListener('click', (ev) => { if (!ev.target.closest('.me')) { $('#menu').hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); } });
$('#change-pw').addEventListener('click', async () => {
  try { await fb.a.sendPasswordResetEmail(fb.auth, me, { url: location.origin + location.pathname }); toast(`We’ve emailed ${me} a link to choose a new password.`); }
  catch (e) { toast(friendly(e), true); }
});

async function startApp() {
  $('#boot').hidden = true; $('#auth').hidden = true; $('#app').hidden = false;
  $('#me-email').textContent = me;
  try { tab = sessionStorage.getItem('thekla-admin-tab') || 'tonight'; } catch {}
  // Listings and admin changes load together
  const [, liveDoc] = await Promise.all([loadFeed(), getLive().catch((e) => { toast(friendly(e), true); return {}; })]);
  live = liveDoc || {};
  liveStamp = JSON.stringify(live);
  setTab(tab);
  watchLive();
}

boot().catch((e) => {
  console.error(e);
  $('#boot').innerHTML = `<p>Couldn’t start the admin portal. Check your connection and refresh.</p><p class="hint small">${esc(e.message || e)}</p>`;
});
