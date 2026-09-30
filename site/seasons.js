// Thekla Links — seasonal effects (like Google's holiday doodles).
//
// The page picks a season from today's UK date and adds light decorations:
// a garland along the top, a hat on the logo, a tint on the background glow and
// a few drifting particles behind the listings. Everything sits behind or around
// the content, never over the buttons, and switches off for "reduce motion".
//
// Preview any season:  ?season=halloween  (or christmas, nye, bonfire, valentines, easter, pride, harbour)
// Turn effects off:    ?season=off
// Season switcher:     ?season=preview
//
// To change dates or switch a season off, edit SEASONS below (enabled: false).
(() => {
  const TZ = 'Europe/London';
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- dates ----------
  const nowParts = (d = new Date()) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23',
    }).formatToParts(d).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour };
  };
  const md = (m, d) => m * 100 + d; // 1031 = 31 Oct
  const between = (t, from, to) => { const v = md(t.m, t.d); return v >= from && v <= to; };

  function easterSunday(y) { // Anonymous Gregorian algorithm
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(y, month - 1, day));
  }
  const dayOffset = (date, n) => { const x = new Date(date); x.setUTCDate(x.getUTCDate() + n); return x; };
  const toMd = (x) => md(x.getUTCMonth() + 1, x.getUTCDate());

  // Bristol Harbour Festival: the Friday–Sunday around the third Saturday of July
  function harbourWeekend(y) {
    const firstSat = 1 + ((6 - new Date(Date.UTC(y, 6, 1)).getUTCDay() + 7) % 7);
    const sat = firstSat + 14;
    return [md(7, sat - 1), md(7, sat + 1)];
  }

  // ---------- the calendar ----------
  const SEASONS = [
    { id: 'nye', name: 'New Year', enabled: true,
      when: (t) => (t.m === 12 && t.d === 31 && t.h >= 12) || (t.m === 1 && t.d === 1) },
    { id: 'christmas', name: 'Christmas', enabled: true, when: (t) => between(t, 1201, 1230) || (t.m === 12 && t.d === 31 && t.h < 12) },
    { id: 'bonfire', name: 'Bonfire Night', enabled: true, when: (t) => between(t, 1103, 1106) },
    { id: 'halloween', name: 'Halloween', enabled: true, when: (t) => between(t, 1024, 1031) || md(t.m, t.d) === 1101 },
    { id: 'valentines', name: "Valentine's", enabled: true, when: (t) => between(t, 210, 214) },
    { id: 'easter', name: 'Easter', enabled: true,
      when: (t) => { const e = easterSunday(t.y); return between(t, toMd(dayOffset(e, -3)), toMd(dayOffset(e, 1))); } },
    { id: 'pride', name: 'Pride', enabled: true, when: (t) => t.m === 6 },
    { id: 'harbour', name: 'Harbour Festival', enabled: true,
      when: (t) => { const [a, b] = harbourWeekend(t.y); return between(t, a, b); } },
  ];

  // ---------- artwork (simple original SVGs) ----------
  const svg = (body, vb = '0 0 64 64') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;
  const ART = {
    pumpkin: svg(`<path d="M33 15c1-5 5-8 9-8" stroke="#56752c" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="21" cy="38" rx="14" ry="17" fill="#d9661a"/><ellipse cx="43" cy="38" rx="14" ry="17" fill="#d9661a"/>
      <ellipse cx="32" cy="38" rx="13" ry="19" fill="#f28a2c"/>
      <path d="M20 33l5-6 5 6zM34 33l5-6 5 6z" fill="#3a1705"/><path d="M19 43q13 10 26 0l-4 1-2 3-3-3-4 3-4-3-3 3-2-3z" fill="#3a1705"/>`),
    bat: svg(`<path d="M32 26c-3-4-8-5-12-3 2 1 3 3 2 5-5-4-12-3-18 1 5 0 8 3 9 7 3-3 7-3 9 0 2-2 5-3 8-1 2 2 2 5 2 5s0-3 2-5c3-2 6-1 8 1 2-3 6-3 9 0 1-4 4-7 9-7-6-4-13-5-18-1-1-2 0-4 2-5-4-2-9-1-12 3l-1-4-1 4z" fill="#111"/>`),
    skull: svg(`<path d="M32 8c-12 0-20 8-20 19 0 7 3 11 7 13v8h26v-8c4-2 7-6 7-13 0-11-8-19-20-19z" fill="#ece6d6"/>
      <ellipse cx="24" cy="29" rx="5" ry="6" fill="#1a1a1a"/><ellipse cx="40" cy="29" rx="5" ry="6" fill="#1a1a1a"/>
      <path d="M32 34l-3 6h6z" fill="#1a1a1a"/><path d="M24 48v6M29 48v6M35 48v6M40 48v6" stroke="#1a1a1a" stroke-width="2"/>`),
    bauble: (c) => svg(`<defs><radialGradient id="g" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".25" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".85"/></radialGradient></defs>
      <rect x="27" y="4" width="10" height="8" rx="2" fill="#c9a24a"/><circle cx="32" cy="36" r="24" fill="url(#g)"/>
      <path d="M12 34q20 8 40 0" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none"/>`),
    tree: svg(`<path d="M32 4l14 20h-7l11 16h-8l12 16H10l12-16h-8l11-16h-7z" fill="#1f7a4d"/><rect x="28" y="56" width="8" height="7" fill="#6b3e1f"/>
      <circle cx="26" cy="30" r="2.5" fill="#e52342"/><circle cx="38" cy="42" r="2.5" fill="#f0c04c"/><circle cx="24" cy="48" r="2.5" fill="#6ec3ff"/><circle cx="36" cy="22" r="2.5" fill="#f0c04c"/>`),
    snow: svg(`<g stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M32 6v52M9 19l46 26M9 45l46-26"/><path d="M26 10l6 6 6-6M26 54l6-6 6 6"/></g>`),
    egg: (a, b) => svg(`<path d="M32 4C20 4 12 24 12 38c0 12 9 22 20 22s20-10 20-22C52 24 44 4 32 4z" fill="${a}"/>
      <path d="M13 34l6-5 6 5 7-5 7 5 6-5 6 5" stroke="${b}" stroke-width="3.5" fill="none"/><circle cx="24" cy="46" r="3" fill="${b}"/><circle cx="40" cy="46" r="3" fill="${b}"/><circle cx="32" cy="20" r="3" fill="${b}"/>`),
    heart: (c) => svg(`<path d="M32 56S6 40 6 22C6 12 13 6 21 6c5 0 9 3 11 7 2-4 6-7 11-7 8 0 15 6 15 16 0 18-26 34-26 34z" fill="${c}"/>`),
    boat: (c) => svg(`<path d="M8 40h48l-8 12H16z" fill="${c}"/><path d="M32 8v30" stroke="#efe8da" stroke-width="2"/><path d="M33 10l16 26H33z" fill="#efe8da"/><path d="M31 14L19 34h12z" fill="#e52342"/>`),
    bunny: svg(`<g fill="#f3ede4"><ellipse cx="24" cy="20" rx="7" ry="18" transform="rotate(-10 24 20)"/><ellipse cx="42" cy="20" rx="7" ry="18" transform="rotate(10 42 20)"/><ellipse cx="33" cy="50" rx="20" ry="16"/></g>
      <ellipse cx="24" cy="20" rx="3" ry="12" fill="#f4b6c6" transform="rotate(-10 24 20)"/><ellipse cx="42" cy="20" rx="3" ry="12" fill="#f4b6c6" transform="rotate(10 42 20)"/>
      <circle cx="26" cy="47" r="2.5" fill="#222"/><circle cx="40" cy="47" r="2.5" fill="#222"/><ellipse cx="33" cy="53" rx="3" ry="2" fill="#e88aa2"/>`, '0 0 66 66'),
    spider: svg(`<g stroke="#111" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M24 30l-12-8M24 34l-14 0M24 38l-12 8M24 42l-9 12M40 30l12-8M40 34l14 0M40 38l12 8M40 42l9 12"/></g><ellipse cx="32" cy="38" rx="10" ry="12" fill="#111"/><circle cx="32" cy="24" r="7" fill="#111"/><circle cx="29.5" cy="23" r="1.5" fill="#e52342"/><circle cx="34.5" cy="23" r="1.5" fill="#e52342"/>`),
    skeleton: svg(`<g stroke="#ece6d6" stroke-width="3" stroke-linecap="round" fill="none">
      <path d="M32 20v26"/><path d="M24 26h16M23 31h18M24 36h16"/><path d="M32 24l-12 12M32 24l12 12M20 36l-3 9M44 36l3 9"/><path d="M32 46l-7 16M32 46l7 16"/></g>
      <circle cx="32" cy="11" r="8" fill="#ece6d6"/><circle cx="29" cy="10" r="2" fill="#111"/><circle cx="35" cy="10" r="2" fill="#111"/>`, '0 0 64 66'),
    cobweb: svg(`<g stroke="#efe8da" stroke-opacity=".45" stroke-width="1.2" fill="none">
      <path d="M0 0L64 64M0 0L64 24M0 0L24 64M0 0L64 44M0 0L44 64"/>
      <path d="M14 5q2 6 5 9t9 5M5 14q6 2 9 5t5 9"/><path d="M27 10q4 12 9 17t17 9M10 27q12 4 17 9t9 17"/><path d="M40 15q6 18 13 25t25 13M15 40q18 6 25 13t13 25"/></g>`),
    // hats for the logo
    santa: svg(`<path d="M10 44C14 22 30 8 48 10c-6 6-8 16-6 30z" fill="#d42a35"/><circle cx="50" cy="10" r="7" fill="#fff"/><rect x="4" y="40" width="44" height="12" rx="6" fill="#fff"/>`),
    witch: svg(`<path d="M22 44L40 4l2 10 10 6-14 4 6 20z" fill="#1c1426"/><ellipse cx="32" cy="46" rx="30" ry="7" fill="#1c1426"/><rect x="18" y="38" width="30" height="5" fill="#f28a2c"/>`),
    party: svg(`<defs><pattern id="s" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="5" height="10" fill="#e52342"/><rect x="5" width="5" height="10" fill="#f0c04c"/></pattern></defs>
      <path d="M32 4L50 54H14z" fill="url(#s)"/><circle cx="32" cy="5" r="5" fill="#efe8da"/><path d="M12 54h40" stroke="#efe8da" stroke-width="4" stroke-linecap="round"/>`),
    ears: svg(`<ellipse cx="20" cy="24" rx="8" ry="22" fill="#f3ede4" transform="rotate(-14 20 24)"/><ellipse cx="44" cy="24" rx="8" ry="22" fill="#f3ede4" transform="rotate(14 44 24)"/>
      <ellipse cx="20" cy="26" rx="4" ry="15" fill="#f4b6c6" transform="rotate(-14 20 26)"/><ellipse cx="44" cy="26" rx="4" ry="15" fill="#f4b6c6" transform="rotate(14 44 26)"/>`),
  };
  const url = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
  const imgCache = new Map();
  const toImg = (s) => {
    if (!imgCache.has(s)) { const i = new Image(); i.src = `data:image/svg+xml,${encodeURIComponent(s)}`; imgCache.set(s, i); }
    return imgCache.get(s);
  };

  // Garland tiles (repeat along the top of the page)
  const GARLAND = {
    chain: svg(`<path d="M0 6 Q60 34 120 6" stroke="none" fill="none" id="p"/>
      ${Array.from({ length: 9 }, (_, i) => { const x = 6 + i * 13.5; const y = 6 + 28 * Math.sin((i + .5) / 9 * Math.PI) * .85; return `<ellipse cx="${x}" cy="${y}" rx="7" ry="4" transform="rotate(${(i - 4) * 7} ${x} ${y})" fill="none" stroke="#8e939c" stroke-width="2.6"/>`; }).join('')}`, '0 0 120 40'),
    tinsel: svg(`<path d="M0 4 Q60 34 120 4" stroke="#d4a64a" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="1 3"/>
      <path d="M0 4 Q60 34 120 4" stroke="#e52342" stroke-width="3" fill="none"/>
      ${[20, 45, 75, 100].map((x) => `<circle cx="${x}" cy="${4 + 30 * Math.sin(x / 120 * Math.PI) * .83}" r="2" fill="#fff"/>`).join('')}`, '0 0 120 40'),
    bunting: (cols) => svg(`<path d="M0 4 Q60 22 120 4" stroke="#efe8da" stroke-width="1.5" fill="none"/>
      ${[0, 1, 2, 3, 4].map((i) => { const x = 8 + i * 22; const y = 4 + 18 * Math.sin((x + 8) / 120 * Math.PI) * .95; return `<path d="M${x} ${y} l16 0 l-8 16z" fill="${cols[i % cols.length]}"/>`; }).join('')}`, '0 0 120 40'),
    hearts: svg(`<path d="M0 4 Q60 26 120 4" stroke="#f4b6c6" stroke-width="1.5" fill="none"/>
      ${[15, 45, 75, 105].map((x) => { const y = 4 + 22 * Math.sin(x / 120 * Math.PI) * .95; return `<path transform="translate(${x - 7} ${y}) scale(.22)" d="M32 56S6 40 6 22C6 12 13 6 21 6c5 0 9 3 11 7 2-4 6-7 11-7 8 0 15 6 15 16 0 18-26 34-26 34z" fill="${x % 2 ? '#ff6aa8' : '#e52342'}"/>`; }).join('')}`, '0 0 120 40'),
  };

  // ---------- what each season shows ----------
  const PASTELS = ['#f7c8d8', '#c8e6f7', '#fbe7a1', '#cdeec2', '#dccbf5'];
  const RAINBOW = ['#e52342', '#f28a2c', '#f0c04c', '#3fb56b', '#3a86ff', '#8a4dd6'];
  const LOOK = {
    halloween: {
      tint: ['#3b1d5e', '#ff7a1a'], hat: ART.witch, garland: GARLAND.chain,
      extras: [
        { art: ART.cobweb, css: 'top:0;left:0;width:110px;height:110px' },
        { art: ART.cobweb, css: 'top:0;right:0;width:110px;height:110px;transform:scaleX(-1)' },
        { art: ART.spider, css: 'top:0;right:18%;width:34px;height:34px', cls: 'dangle', thread: 90 },
        { art: ART.skeleton, css: 'top:0;left:12%;width:44px;height:46px', cls: 'dangle slow', thread: 60 },
        { art: ART.pumpkin, css: 'top:calc(min(100vw, 560px) * 0.625 - 62px);left:14px;width:58px;height:58px', anchor: 'hero' },
        { art: ART.pumpkin, css: 'top:calc(min(100vw, 560px) * 0.625 - 48px);right:18px;width:44px;height:44px', anchor: 'hero' },
      ],
      particles: { type: 'flutter', count: 7, art: [ART.bat], size: [22, 38] },
      extraParticles: { type: 'fall', count: 5, art: [ART.skull, ART.pumpkin], size: [18, 26], speed: .35 },
    },
    bonfire: {
      tint: ['#3a1a10', '#ff6a1a'], particles: { type: 'fireworks', colors: ['#ff6a1a', '#ffb347', '#e52342', '#fff3c4'], rate: 2400 },
    },
    christmas: {
      tint: ['#0f4d3a', '#d4a64a'], hat: ART.santa, garland: GARLAND.tinsel,
      extras: [
        ...[['8%', 70, '#e52342'], ['27%', 40, '#d4a64a'], ['73%', 55, '#3a86ff'], ['90%', 34, '#e52342']].map(([x, len, c], i) => (
          { art: ART.bauble(c), css: `top:0;left:${x};width:30px;height:30px`, cls: `dangle ${i % 2 ? 'slow' : ''}`, thread: len })),
        { art: ART.tree, css: 'top:calc(min(100vw, 560px) * 0.625 - 60px);left:12px;width:56px;height:56px', anchor: 'hero' },
        { art: ART.tree, css: 'top:calc(min(100vw, 560px) * 0.625 - 48px);right:14px;width:44px;height:44px', anchor: 'hero' },
      ],
      particles: { type: 'fall', count: 26, art: [ART.snow], size: [8, 18], speed: .6, alpha: [.35, .8] },
    },
    nye: {
      tint: ['#2a2350', '#d8b04c'], hat: ART.party, banner: true,
      particles: { type: 'fireworks', colors: ['#f0c04c', '#fff3c4', '#e52342', '#ff6aa8', '#c8e6f7'], rate: 1700 },
      extraParticles: { type: 'confetti', count: 26, colors: ['#f0c04c', '#efe8da', '#e52342', '#ff6aa8'] },
    },
    valentines: {
      tint: ['#4a1330', '#ff5c8a'], garland: GARLAND.hearts,
      particles: { type: 'rise', count: 14, art: ['#e52342', '#ff6aa8', '#f4b6c6'].map(ART.heart), size: [12, 24], speed: .45, alpha: [.35, .75] },
    },
    easter: {
      tint: ['#4b3f8a', '#f3a6c8'], hat: ART.ears, garland: GARLAND.bunting(PASTELS),
      extras: [{ art: ART.bunny, css: 'top:calc(min(100vw, 560px) * 0.625 - 66px);right:14px;width:66px;height:66px', anchor: 'hero', cls: 'peek' }],
      particles: { type: 'fall', count: 10, art: PASTELS.map((c, i) => ART.egg(c, PASTELS[(i + 2) % 5])), size: [18, 28], speed: .45 },
    },
    pride: {
      stripe: RAINBOW, ring: RAINBOW,
      particles: { type: 'confetti', count: 16, colors: RAINBOW },
    },
    harbour: {
      tint: ['#123e66', '#f0c04c'], garland: GARLAND.bunting(['#e52342', '#efe8da', '#3a86ff', '#f0c04c']),
      extras: [
        { art: ART.boat('#3a86ff'), css: 'top:calc(min(100vw, 560px) * 0.625 - 58px);left:6%;width:48px;height:48px', anchor: 'hero', cls: 'bob' },
        { art: ART.boat('#e52342'), css: 'top:calc(min(100vw, 560px) * 0.625 - 50px);right:9%;width:36px;height:36px', anchor: 'hero', cls: 'bob slow' },
      ],
    },
  };

  // ---------- styles for the decorations ----------
  const style = document.createElement('style');
  style.textContent = `
    .season-layer { position: absolute; left: 0; right: 0; top: 0; pointer-events: none; z-index: 2; }
    .season-layer > * { position: absolute; background-size: contain; background-repeat: no-repeat; background-position: center; }
    .season-garland { left: 0; right: 0; top: 0; height: 40px; background-repeat: repeat-x !important; background-size: 120px 40px !important; background-position: top left !important; opacity: .95; }
    .season-hero-layer { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
    .season-hero-layer > * { position: absolute; background-size: contain; background-repeat: no-repeat; }
    .season-thread { position: absolute; top: 0; width: 1px; background: rgba(239,232,218,.35); transform-origin: top center; }
    .dangle { transform-origin: 50% -80px; animation: sway 4s ease-in-out infinite alternate; }
    .dangle.slow { animation-duration: 6s; }
    .bob { animation: bob 3.2s ease-in-out infinite alternate; }
    .bob.slow { animation-duration: 4.4s; }
    .peek { animation: peek 7s ease-in-out infinite; }
    @keyframes sway { from { rotate: -6deg; } to { rotate: 6deg; } }
    @keyframes bob { from { translate: 0 0; rotate: -3deg; } to { translate: 0 -5px; rotate: 3deg; } }
    @keyframes peek { 0%, 55%, 100% { translate: 0 45%; opacity: 0; } 62%, 90% { translate: 0 0; opacity: 1; } }
    .season-hat { position: absolute; width: 58px; height: 58px; top: -30px; left: 58%; z-index: 3; pointer-events: none; background-size: contain; background-repeat: no-repeat; rotate: 16deg; }
    html[data-season="easter"] .season-hat { width: 64px; height: 64px; top: -44px; left: 50%; translate: -50% 0; rotate: 0deg; }
    html[data-season="halloween"] .season-hat { width: 72px; height: 72px; top: -44px; left: 50%; rotate: -8deg; }
    .logo { overflow: visible !important; position: relative; }
    .logo img { border-radius: 50%; }
    .season-ring { position: absolute; inset: -6px; border-radius: 50%; pointer-events: none; }
    .season-stripe { position: fixed; top: 0; left: 0; right: 0; height: 5px; z-index: 50; pointer-events: none; padding-top: env(safe-area-inset-top, 0px); box-sizing: content-box; }
    .season-banner {
      position: relative; z-index: 3; margin: 14px auto 0; width: fit-content; max-width: 100%; padding: 8px 16px; border-radius: 999px;
      font: 800 15px/1.2 var(--display); letter-spacing: .08em; text-transform: uppercase; color: #1b1406;
      background: linear-gradient(90deg, #f0c04c, #fff3c4, #f0c04c); box-shadow: 0 6px 22px rgba(240,192,76,.35);
      font-variant-numeric: tabular-nums;
    }
    #season-fx { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
    .season-preview {
      position: fixed; left: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 60;
      display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-radius: 999px;
      background: rgba(11,16,25,.9); border: 1px solid rgba(239,232,218,.2); color: #efe8da;
      font: 700 12px/1 var(--body); box-shadow: 0 8px 24px rgba(0,0,0,.4);
    }
    .season-preview select { font: 700 13px/1 var(--body); color: #0b1019; background: #efe8da; border: 0; border-radius: 999px; padding: 7px 10px; }
    @media (prefers-reduced-motion: reduce) { .dangle, .bob, .peek { animation: none; } .peek { translate: 0 0; } }
  `;
  document.head.appendChild(style);

  // ---------- apply / remove ----------
  let cleanup = [];
  let stopFx = null;

  function clear() {
    cleanup.forEach((el) => el.remove());
    cleanup = [];
    if (stopFx) { stopFx(); stopFx = null; }
    root.removeAttribute('data-season');
    ['--s-a', '--s-b'].forEach((v) => root.style.removeProperty(v));
  }

  function place(parent, item, cls) {
    const el = document.createElement('div');
    el.className = [cls, item.cls].filter(Boolean).join(' ');
    el.style.cssText = item.css;
    el.style.backgroundImage = url(item.art);
    if (item.thread) {
      // hang from a thread: move the item down and draw the thread above it
      el.style.top = `${item.thread}px`;
      el.style.transformOrigin = `50% -${item.thread}px`;
      const th = document.createElement('div');
      th.className = 'season-thread';
      th.style.cssText = `height:${item.thread + 4}px;top:-${item.thread}px;left:50%`;
      el.appendChild(th);
    }
    parent.appendChild(el);
    return el;
  }

  function apply(id) {
    clear();
    const look = LOOK[id];
    if (!look) return;
    root.setAttribute('data-season', id);

    // background glow tint
    if (look.tint) {
      root.style.setProperty('--s-a', look.tint[0]);
      root.style.setProperty('--s-b', look.tint[1]);
    }

    const hero = document.querySelector('.hero');
    const top = document.createElement('div');
    top.className = 'season-layer';
    document.body.appendChild(top);
    cleanup.push(top);

    if (look.garland) {
      const g = document.createElement('div');
      g.className = 'season-garland';
      g.style.backgroundImage = url(look.garland);
      top.appendChild(g);
    }
    const heroLayer = document.createElement('div');
    heroLayer.className = 'season-hero-layer';
    hero?.appendChild(heroLayer);
    cleanup.push(heroLayer);
    for (const item of look.extras || []) place(item.anchor === 'hero' ? heroLayer : top, item, '');

    const logo = document.querySelector('.logo');
    if (logo && look.hat) {
      const h = document.createElement('div');
      h.className = 'season-hat';
      h.style.backgroundImage = url(look.hat);
      logo.appendChild(h);
      cleanup.push(h);
    }
    if (logo && look.ring) {
      const r = document.createElement('div');
      r.className = 'season-ring';
      r.style.background = `conic-gradient(${look.ring.join(',')},${look.ring[0]})`;
      r.style.webkitMask = r.style.mask = 'radial-gradient(closest-side, transparent calc(100% - 5px), #000 calc(100% - 4px))';
      logo.prepend(r);
      cleanup.push(r);
    }
    if (look.stripe) {
      const s = document.createElement('div');
      s.className = 'season-stripe';
      s.style.background = `linear-gradient(90deg, ${look.stripe.join(',')})`;
      document.body.appendChild(s);
      cleanup.push(s);
    }
    if (look.banner) {
      const b = document.createElement('div');
      b.className = 'season-banner';
      document.querySelector('.hero-id')?.appendChild(b);
      cleanup.push(b);
      const tick = () => {
        if (!b.isConnected) return;
        const t = nowParts();
        const nextYear = t.m === 1 && t.d === 1 ? t.y : t.y + 1;
        if (t.m === 1 && t.d === 1) b.textContent = `Happy New Year ${t.y}`;
        else {
          const ms = Math.max(0, Date.UTC(nextYear, 0, 1) - Date.now()); // UK is on GMT at New Year
          const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
          b.textContent = ms > 0 && ms < 24 * 3600e3 ? `${h}h ${String(m).padStart(2, '0')}m to ${nextYear}` : `Happy New Year ${nextYear}`;
        }
        setTimeout(tick, 20e3);
      };
      tick();
    }

    if (!reduce) stopFx = startFx(look);
  }

  // ---------- particles (drawn on one canvas behind the listings) ----------
  function startFx(look) {
    const layers = [look.particles, look.extraParticles].filter(Boolean);
    if (!layers.length) return null;
    const canvas = document.createElement('canvas');
    canvas.id = 'season-fx';
    document.querySelector('.sea')?.after(canvas);
    cleanup.push(canvas);
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);

    const rand = (a, b) => a + Math.random() * (b - a);
    const phone = innerWidth < 600 ? 0.65 : 1;
    const pools = layers.map((L) => {
      const n = Math.round((L.count || 0) * phone);
      const make = (initial) => {
        const size = rand(...(L.size || [6, 10]));
        const p = {
          x: rand(0, W), y: initial ? rand(0, H) : (L.type === 'rise' ? H + 30 : -30),
          size, rot: rand(0, Math.PI * 2), vr: rand(-.02, .02), phase: rand(0, 6.28),
          v: (L.speed || .5) * rand(.6, 1.3) * (size / 14 + .4),
          alpha: L.alpha ? rand(...L.alpha) : rand(.55, .9),
          img: L.art ? toImg(L.art[Math.floor(Math.random() * L.art.length)]) : null,
          color: L.colors ? L.colors[Math.floor(Math.random() * L.colors.length)] : null,
          dir: Math.random() < .5 ? -1 : 1,
        };
        if (L.type === 'flutter') { p.y = rand(H * .05, H * .6); p.x = initial ? rand(0, W) : (p.dir > 0 ? -40 : W + 40); p.v = rand(.6, 1.2); }
        if (L.type === 'confetti') { p.size = rand(5, 9); p.v = rand(.5, 1.1); }
        return p;
      };
      return { L, list: Array.from({ length: n }, () => make(true)), make, bursts: [], next: 400 };
    });

    let last = performance.now(), raf = 0, running = true;
    function frame(now) {
      if (!running) return;
      const dt = Math.min((now - last) / 16.7, 3); last = now;
      ctx.clearRect(0, 0, W, H);
      for (const pool of pools) {
        const { L } = pool;
        if (L.type === 'fireworks') { fireworks(pool, dt, now); continue; }
        pool.list.forEach((p, i) => {
          p.phase += 0.02 * dt;
          if (L.type === 'fall' || L.type === 'confetti') { p.y += p.v * dt; p.x += Math.sin(p.phase) * .4 * dt; p.rot += p.vr * dt * (L.type === 'confetti' ? 4 : 1); }
          if (L.type === 'rise') { p.y -= p.v * dt; p.x += Math.sin(p.phase) * .5 * dt; }
          if (L.type === 'flutter') { p.x += p.v * p.dir * dt; p.y += Math.sin(p.phase * 3) * .8 * dt; }
          const out = p.y > H + 40 || p.y < -60 || p.x < -60 || p.x > W + 60;
          if (out) pool.list[i] = pool.make(false);
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          if (L.type === 'confetti') {
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * Math.abs(Math.cos(p.phase * 3)) + 1);
          } else if (p.img?.complete) {
            if (L.type === 'flutter') { ctx.scale(p.dir, 1); ctx.scale(1, .85 + .15 * Math.sin(p.phase * 12)); }
            else ctx.rotate(Math.sin(p.phase) * .3 + (L.type === 'fall' ? p.rot : 0));
            ctx.drawImage(p.img, -p.size / 2, -p.size / 2, p.size, p.size);
          }
          ctx.restore();
        });
      }
      raf = requestAnimationFrame(frame);
    }

    function fireworks(pool, dt, now) {
      const { L } = pool;
      pool.next -= 16.7 * dt;
      if (pool.next <= 0) {
        pool.next = L.rate * rand(.6, 1.3);
        const cx = rand(W * .15, W * .85), cy = rand(H * .12, H * .45);
        const color = L.colors[Math.floor(Math.random() * L.colors.length)];
        const n = phone < 1 ? 36 : 54;
        pool.bursts.push({ cx, cy, t: 0, color, sparks: Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2 + rand(-.05, .05), s = rand(1.6, 3.2);
          return { x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s };
        }) });
      }
      ctx.globalCompositeOperation = 'lighter';
      pool.bursts = pool.bursts.filter((b) => {
        b.t += dt;
        const life = 1 - b.t / 80;
        if (life <= 0) return false;
        ctx.fillStyle = b.color;
        for (const s of b.sparks) {
          s.vx *= .985; s.vy = s.vy * .985 + .035 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
          ctx.globalAlpha = Math.max(life, 0) * .9;
          ctx.beginPath(); ctx.arc(s.x, s.y, 1.6, 0, Math.PI * 2); ctx.fill();
        }
        return true;
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    const vis = () => {
      if (document.hidden || root.classList.contains('sheet-open')) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    };
    document.addEventListener('visibilitychange', vis);
    const mo = new MutationObserver(vis);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    raf = requestAnimationFrame(frame);

    return () => {
      running = false; cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', vis);
      mo.disconnect();
    };
  }

  // ---------- choose the season ----------
  const param = new URLSearchParams(location.search).get('season');
  const auto = () => SEASONS.find((s) => s.enabled && s.when(nowParts()))?.id || null;
  const showPicker = param === 'preview' || window.__PREVIEW__;
  const initial = param && param !== 'preview' ? (param === 'off' ? null : param) : auto();
  apply(initial);

  if (showPicker) {
    const bar = document.createElement('label');
    bar.className = 'season-preview';
    bar.innerHTML = `Season <select id="season-pick" aria-label="Preview a season">
      <option value="">Auto (${auto() ? SEASONS.find((s) => s.id === auto()).name : 'none today'})</option>
      <option value="off">Off</option>
      ${SEASONS.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
    </select>`;
    document.body.appendChild(bar);
    const sel = bar.querySelector('select');
    sel.value = param && param !== 'preview' ? param : '';
    sel.addEventListener('change', () => apply(sel.value === '' ? auto() : sel.value === 'off' ? null : sel.value));
  }

  window.TheklaSeasons = { apply, list: SEASONS.map((s) => s.id), easterSunday, harbourWeekend };
})();
