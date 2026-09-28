// Thekla Links — motion layer (cosmetic only; the page works fully without it).
//  • background glows drift faster while you scroll, then ease back to calm
//  • background shifts from red (top) to deep navy (bottom) as you scroll
//  • header parallax
//  • porthole opener clean-up (the opener itself is pure CSS)
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Porthole opener: tap to skip, remove when done ----------
  const opener = document.querySelector('.opener');
  const endIntro = () => {
    opener?.remove();
    setTimeout(() => root.classList.remove('intro'), 900); // let the content "rise" finish
  };
  if (opener && root.classList.contains('intro')) {
    opener.addEventListener('click', endIntro, { once: true });
    opener.addEventListener('animationend', (e) => { if (e.animationName === 'porthole-open') endIntro(); });
    setTimeout(endIntro, 2500); // safety net
  }

  if (reduce) return;

  // ---------- Elements ----------
  const sea = document.querySelector('.sea');
  const glows = sea ? [...sea.querySelectorAll('.glow')] : [];
  const px = [
    [document.querySelector('.hero-photo img'), 0.35, 0],
    [document.querySelector('.logo'), 0.16, 0.05],
    [document.querySelector('h1'), 0.12, 0],
    [document.querySelector('.coords'), 0.1, 0],
    [document.querySelector('.about'), 0.06, 0],
  ].filter(([el]) => el);
  px.forEach(([el]) => el.classList.add('px'));
  const heroId = document.querySelector('.hero-id');

  // ---------- Scroll → speed ----------
  const CALM = 1, MAX = 4.5;      // playback-rate range
  let rate = CALM, target = CALM;
  let lastY = scrollY, lastT = performance.now(), lastScroll = 0;
  let ticking = false;

  const anims = () => glows.flatMap((g) => g.getAnimations ? g.getAnimations() : []);

  function frame(now) {
    const y = scrollY;

    // velocity (px per ms) → target speed; decays to calm ~150ms after scrolling stops
    const dt = Math.max(now - lastT, 1);
    const v = Math.abs(y - lastY) / dt;
    lastY = y; lastT = now;
    if (v > 0) { target = Math.min(CALM + v * 2.2, MAX); lastScroll = now; }
    else if (now - lastScroll > 150) target = CALM;

    rate += (target - rate) * (target > rate ? 0.18 : 0.05); // quick to speed up, slow to settle
    if (Math.abs(rate - target) < 0.01) rate = target;
    for (const a of anims()) a.playbackRate = rate; // seamless: no jump in position

    // depth: 0 at top → 1 at bottom (red → navy)
    const max = Math.max(root.scrollHeight - innerHeight, 1);
    sea?.style.setProperty('--depth', Math.min(y / max, 1).toFixed(3));

    // parallax, only while the header is in view
    const hy = Math.min(y, 260);
    if (y < 700) {
      for (const [el, k, shrink] of px) {
        el.style.transform = `translate3d(0, ${(hy * k).toFixed(1)}px, 0)` + (shrink ? ` scale(${(1 - (hy / 260) * shrink).toFixed(3)})` : '');
      }
      if (heroId) heroId.style.opacity = (1 - (hy / 260) * 0.45).toFixed(3);
    }

    // keep animating until the speed has settled
    if (rate !== CALM || target !== CALM) requestAnimationFrame(frame);
    else ticking = false;
  }

  const kick = () => {
    if (!ticking) { ticking = true; lastT = performance.now(); requestAnimationFrame(frame); }
  };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick, { passive: true });
  kick();

  // Pause the drift when the page isn't visible (saves battery)
  document.addEventListener('visibilitychange', () => {
    for (const a of anims()) document.hidden ? a.pause() : a.play();
  });
})();
