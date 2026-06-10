/* ───────────────────────────────────────────────────────────────
   Veil · Pointer motion
   Subtle, reverent mouse-aware animation: light & presence, not flash.
   Auto-OFF for reduced-motion and for touch (no fine pointer).
   All work is rAF-batched; only CSS custom properties are written.
   ─────────────────────────────────────────────────────────────── */
(() => {
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine   = window.matchMedia('(pointer: fine)');
  if (mqReduce.matches || !mqFine.matches) return;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

  /* ── Hero: glow follows the cursor + gentle stage parallax ── */
  const hero = document.querySelector('.hero-ed, .hero-c');
  if (hero) {
    let tHx = 50, tHy = 47, hx = 50, hy = 47;   // glow position (%)
    let tPx = 0, tPy = 0, px = 0, py = 0;        // parallax (-1..1)
    let raf = 0;
    const tick = () => {
      hx = lerp(hx, tHx, 0.09); hy = lerp(hy, tHy, 0.09);
      px = lerp(px, tPx, 0.09); py = lerp(py, tPy, 0.09);
      hero.style.setProperty('--hx', hx.toFixed(2) + '%');
      hero.style.setProperty('--hy', hy.toFixed(2) + '%');
      hero.style.setProperty('--px', px.toFixed(3));
      hero.style.setProperty('--py', py.toFixed(3));
      if (Math.abs(hx - tHx) > 0.1 || Math.abs(hy - tHy) > 0.1 ||
          Math.abs(px - tPx) > 0.004 || Math.abs(py - tPy) > 0.004) {
        raf = requestAnimationFrame(tick);
      } else { raf = 0; }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      tHx = clamp(fx, 0, 1) * 100;
      tHy = clamp(fy, 0, 1) * 100;
      tPx = clamp((fx - 0.5) * 2, -1, 1);
      tPy = clamp((fy - 0.5) * 2, -1, 1);
      kick();
    });
    hero.addEventListener('pointerleave', () => { tHx = 50; tHy = 47; tPx = 0; tPy = 0; kick(); });
  }

  /* ── CTA 'altar': gold beam gathers toward cursor X ── */
  const cta = document.querySelector('.cta');
  if (cta) {
    let t = 50, c = 50, raf = 0;
    const tick = () => {
      c = lerp(c, t, 0.11);
      cta.style.setProperty('--cta-mx', c.toFixed(2) + '%');
      if (Math.abs(c - t) > 0.1) raf = requestAnimationFrame(tick); else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    cta.addEventListener('pointermove', (e) => {
      const r = cta.getBoundingClientRect();
      t = clamp((e.clientX - r.left) / r.width, 0, 1) * 100;
      kick();
    });
    cta.addEventListener('pointerleave', () => { t = 50; kick(); });
  }

  /* ── Brand emblem: 3D tilt of the gate + its light shifts ── */
  const emblem = document.querySelector('.brand-emblem');
  if (emblem) {
    let nx = 0, ny = 0, raf = 0;
    const apply = () => {
      raf = 0;
      emblem.style.setProperty('--ex', (nx * 15).toFixed(2) + 'deg');   // rotateY
      emblem.style.setProperty('--ey', (-ny * 15).toFixed(2) + 'deg');  // rotateX
      emblem.style.setProperty('--gx', (nx * 26).toFixed(1) + 'px');
      emblem.style.setProperty('--gy', (ny * 20).toFixed(1) + 'px');
    };
    emblem.addEventListener('pointermove', (e) => {
      const r = emblem.getBoundingClientRect();
      nx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
      ny = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
      if (!raf) raf = requestAnimationFrame(apply);
    });
    emblem.addEventListener('pointerleave', () => {
      nx = 0; ny = 0; if (!raf) raf = requestAnimationFrame(apply);
    });
  }

  /* ── Feature & plan cards: tilt toward cursor + light sheen ── */
  document.querySelectorAll('.feature, .plan').forEach((card) => {
    const featured = card.classList.contains('plan-featured');
    const lift = card.classList.contains('plan') ? -3 : -4;
    let nx = 0, ny = 0, raf = 0;
    const apply = () => {
      raf = 0;
      const rotY = (nx * 6).toFixed(2), rotX = (-ny * 6).toFixed(2);
      card.style.transform =
        `perspective(820px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(${lift}px)` +
        (featured ? ' scale(1.02)' : '');
      card.style.setProperty('--mx', ((nx + 0.5) * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((ny + 0.5) * 100).toFixed(1) + '%');
    };
    card.addEventListener('pointerenter', () => {
      card.classList.add('is-tilting');
      card.style.setProperty('--sheen', '1');
    });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      nx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
      ny = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
      if (!raf) raf = requestAnimationFrame(apply);
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('is-tilting');
      card.style.transform = '';
      card.style.setProperty('--sheen', '0');
    });
  });
})();
