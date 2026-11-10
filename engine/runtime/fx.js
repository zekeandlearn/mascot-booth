// Effects: backgrounds, pixel transitions, particles, shockwaves, grain and vignette. All seeded and seekable.
import * as M from './motion.js';

const canvasLayer = (cs, parent, cls = '') => {
  const c = document.createElement('canvas');
  c.width = cs.W; c.height = cs.H; c.className = 'cs-abs ' + cls;
  c.style.left = '0'; c.style.top = '0';
  parent.appendChild(c);
  return c;
};

/** Pixel starfield: square stars that twinkle on a stepped clock, drifting slowly, some in the accent colour. */
export function starfield(cs, { count = 140, seed = 1, colors = ['#F6F3EE', '#F6F3EE', '#9aa0ab', '#FF783E'], drift = [6, -10], top = 0, bottom = 1, from, to } = {}) {
  const c = canvasLayer(cs, cs.bg);
  const g = c.getContext('2d');
  const stars = Array.from({ length: count }, (_, i) => ({
    x: M.rand(seed, i * 3) * cs.W, y: (top + M.rand(seed, i * 3 + 1) * (bottom - top)) * cs.H,
    s: [3, 4, 5, 6, 8][Math.floor(M.rand(seed, i * 3 + 2) * 5)], c: colors[Math.floor(M.rand(seed + 9, i) * colors.length)],
    ph: M.rand(seed + 4, i) * 10, sp: 0.6 + M.rand(seed + 5, i) * 1.8, z: 0.3 + M.rand(seed + 6, i) * 0.7,
  }));
  cs.add(c, (t) => {
    g.clearRect(0, 0, cs.W, cs.H);
    const ts = M.onTwos(t, 12);
    for (const s of stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(ts * s.sp + s.ph));
      g.globalAlpha = M.step(tw, 4);
      g.fillStyle = s.c;
      const x = ((s.x + drift[0] * t * s.z) % cs.W + cs.W) % cs.W, y = ((s.y + drift[1] * t * s.z) % cs.H + cs.H) % cs.H;
      g.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, s.s, s.s);
    }
    g.globalAlpha = 1;
  }, { from, to, parent: cs.bg });
  return c;
}

/** Perspective grid floor, like a stage. horizon = y of the far edge. speed = scroll toward camera (px/s). */
export function gridFloor(cs, { horizon = 1420, color = 'rgba(255,140,80,0.32)', fill = ['#2a1d14', '#15171C'], cell = 120, speed = 0, glow = true, from, to } = {}) {
  const c = canvasLayer(cs, cs.bg);
  const g = c.getContext('2d');
  cs.add(c, (t) => {
    g.clearRect(0, 0, cs.W, cs.H);
    const h = cs.H - horizon;
    const grad = g.createLinearGradient(0, horizon, 0, cs.H);
    grad.addColorStop(0, fill[0]); grad.addColorStop(1, fill[1]);
    g.fillStyle = grad; g.fillRect(0, horizon, cs.W, h);
    if (glow) { const gl = g.createLinearGradient(0, horizon - 120, 0, horizon + 30); gl.addColorStop(0, 'rgba(255,120,62,0)'); gl.addColorStop(1, 'rgba(255,120,62,0.12)'); g.fillStyle = gl; g.fillRect(0, horizon - 120, cs.W, 150); }
    g.strokeStyle = color; g.lineWidth = 2;
    // horizontal lines get closer toward the horizon
    const off = ((t * speed) % cell) / cell;
    for (let i = 0; i < 14; i++) {
      const k = (i + off) / 14; const y = horizon + h * k * k;
      g.globalAlpha = 0.25 + 0.75 * k; g.beginPath(); g.moveTo(0, y); g.lineTo(cs.W, y); g.stroke();
    }
    // vertical lines converge at a vanishing point above the horizon
    const vx = cs.W / 2, vy = horizon - h * 1.6;
    for (let i = -10; i <= 10; i++) {
      const xb = vx + i * cell * 1.6; const kx = (horizon - vy) / (cs.H - vy);
      g.globalAlpha = 0.5; g.beginPath(); g.moveTo(vx + (xb - vx) * kx, horizon); g.lineTo(xb, cs.H); g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, horizon - 3, cs.W, 6);
  }, { from, to, parent: cs.bg });
  return c;
}

/** Soft colour glows behind content (big blurred blobs that breathe). */
export function glows(cs, list, { from, to } = {}) {
  const host = document.createElement('div'); host.className = 'cs-abs'; host.style.inset = '0';
  const els = list.map(o => {
    const d = document.createElement('div');
    // a radial gradient instead of filter: blur() — same look, no per-frame re-rasterizing of a huge blur
    const R = o.r * 1.8;
    d.style.cssText = `position:absolute;width:${R * 2}px;height:${R * 2}px;left:${o.x - R}px;top:${o.y - R}px;opacity:${o.a ?? 0.35};background:radial-gradient(closest-side, ${o.color}, transparent);will-change:transform`;
    host.appendChild(d); return { d, o };
  });
  cs.add(host, (t) => {
    els.forEach(({ d, o }, i) => {
      const k = o.keys ? M.keys(t, o.keys) : 1;
      d.style.transform = `translate(${M.fbm(t * 0.2, i) * 60}px, ${M.fbm(t * 0.17, i + 4) * 60}px) scale(${(1 + M.fbm(t * 0.3, i + 8) * 0.12).toFixed(3)})`;
      d.style.opacity = ((o.a ?? 0.35) * k).toFixed(3);
    });
  }, { from, to, parent: cs.bg });
  return host;
}

/**
 * Pixel-block wipe: blocks pop in along a diagonal until the frame is covered at `t`, then pop out.
 * Put a scene cut exactly at `t`. Adds its own sound.
 */
export function pixelWipe(cs, t, { dur = 0.62, block = 72, colors = ['#15171C', '#1d2027', '#23262e', '#FF783E'], accentShare = 0.08, dir = 1, seed = 5, sound = true } = {}) {
  const c = canvasLayer(cs, cs.fx);
  const g = c.getContext('2d');
  const cols = Math.ceil(cs.W / block), rows = Math.ceil(cs.H / block);
  const maxd = cols + rows;
  const blocks = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    const d = (dir > 0 ? x + y : (cols - x) + (rows - y)) / maxd;
    const jit = M.rand(seed, i) * 0.18;
    const acc = M.rand(seed + 1, i) < accentShare;
    blocks.push({ x, y, d: M.clamp(d * 0.82 + jit), col: acc ? colors[3] : colors[Math.floor(M.rand(seed + 2, i) * 3)] });
  }
  const half = dur / 2;
  if (sound) { cs.sfx('glitch', t - half * 0.9, { gain: 0.5 }); cs.sfx('whoosh', t - half * 0.6, { gain: 0.55, dur: 0.5 }); }
  cs.add(c, (tt) => {
    g.clearRect(0, 0, cs.W, cs.H);
    for (const b of blocks) {
      // in: cover between t-half .. t ; out: uncover between t .. t+half, same order
      const kin = M.clamp((tt - (t - half) - b.d * half * 0.8) / (half * 0.2));
      const kout = M.clamp((tt - t - b.d * half * 0.8) / (half * 0.2));
      const k = M.step(kin * (1 - kout), 3);
      if (k <= 0) continue;
      const s = block * k;
      g.fillStyle = b.col;
      g.fillRect(b.x * block + (block - s) / 2, b.y * block + (block - s) / 2, Math.ceil(s), Math.ceil(s));
    }
  }, { from: t - half - 0.01, to: t + half + 0.01, parent: cs.fx });
}

/** Pixel particle burst from a point (confetti in squares). */
export function burst(cs, t, x, y, { count = 36, colors = ['#FF783E', '#F6F3EE', '#347FC5', '#269681'], speed = 900, gravity = 1800, life = 1.1, size = [8, 18], seed = 3, parent, sound = 'pop' } = {}) {
  const c = canvasLayer(cs, parent || cs.front);
  const g = c.getContext('2d');
  const ps = Array.from({ length: count }, (_, i) => {
    const a = M.rand(seed, i) * Math.PI * 2, v = speed * (0.35 + M.rand(seed + 1, i) * 0.65);
    return { vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.35, s: size[0] + M.rand(seed + 2, i) * (size[1] - size[0]), c: colors[i % colors.length], spin: (M.rand(seed + 3, i) - 0.5) * 12 };
  });
  if (sound) cs.sfx(sound, t);
  cs.add(c, (tt) => {
    g.clearRect(0, 0, cs.W, cs.H);
    const dt = tt - t; if (dt < 0) return;
    for (const p of ps) {
      const drag = Math.exp(-dt * 2.2);
      const px = x + p.vx * (1 - drag) / 2.2, py = y + p.vy * (1 - drag) / 2.2 + 0.5 * gravity * dt * dt * 0.35;
      const a = M.clamp(1 - dt / life);
      if (a <= 0) continue;
      g.globalAlpha = M.step(a, 4); g.fillStyle = p.c;
      g.save(); g.translate(px, py); g.rotate(M.step(p.spin * dt, 4)); g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); g.restore();
    }
    g.globalAlpha = 1;
  }, { from: t, to: t + life, parent: parent || cs.front });
}

/** Expanding shockwave ring(s). */
export function ring(cs, t, x, y, { r0 = 20, r1 = 420, dur = 0.6, color = '#FF783E', width = 10, count = 2, gap = 0.08, parent } = {}) {
  const c = canvasLayer(cs, parent || cs.front);
  const g = c.getContext('2d');
  cs.add(c, (tt) => {
    g.clearRect(0, 0, cs.W, cs.H);
    for (let i = 0; i < count; i++) {
      const k = M.clamp((tt - t - i * gap) / dur); if (k <= 0 || k >= 1) continue;
      const e = M.ease.outExpo(k);
      g.strokeStyle = color; g.globalAlpha = (1 - k) * 0.9; g.lineWidth = width * (1 - k) + 1;
      g.beginPath(); g.arc(x, y, M.lerp(r0, r1, e), 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
  }, { from: t, to: t + dur + count * gap, parent: parent || cs.front });
}

/** Full-frame flash. */
export function flash(cs, t, { color = '#F6F3EE', peak = 0.5, dur = 0.22 } = {}) {
  const d = document.createElement('div'); d.className = 'cs-abs'; d.style.cssText = `inset:0;background:${color};opacity:0`;
  cs.add(d, (tt) => { d.style.opacity = (peak * (1 - M.ease.outCubic(M.clamp((tt - t) / dur)))).toFixed(3); }, { from: t, to: t + dur, parent: cs.fx });
}

/** Film grain + vignette + scanline sheen over everything. */
export function finish(cs, { grain = 0.07, vignette = 0.55, scan = 0.04 } = {}) {
  if (vignette) {
    const v = document.createElement('div'); v.className = 'cs-abs';
    v.style.cssText = `inset:0;background:radial-gradient(ellipse 120% 90% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,${vignette}) 100%)`;
    cs.fx.appendChild(v);
  }
  if (scan) {
    const s = document.createElement('div'); s.className = 'cs-abs';
    s.style.cssText = `inset:0;opacity:${scan};background:repeating-linear-gradient(0deg, rgba(0,0,0,.9) 0 2px, rgba(0,0,0,0) 2px 5px)`;
    cs.fx.appendChild(s);
  }
  if (grain) {
    const c = document.createElement('canvas'); c.width = Math.ceil(cs.W / 3); c.height = Math.ceil(cs.H / 3);
    c.className = 'cs-abs'; c.style.cssText = `left:0;top:0;width:${cs.W}px;height:${cs.H}px;opacity:${grain};mix-blend-mode:overlay;image-rendering:pixelated`;
    const g = c.getContext('2d'); const img = g.createImageData(c.width, c.height);
    cs.add(c, (t) => {
      const f = Math.floor(t * 24);
      for (let i = 0; i < img.data.length; i += 4) { const v = M.hash(f * 7919 + i) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      g.putImageData(img, 0, 0);
    }, { parent: cs.fx });
  }
}
