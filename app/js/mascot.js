// The talking mascot, canvas only. Lip sync reuses the character's own drawn mouth (squashed and stretched into
// each mouth shape); blinks paint the inside of the eye (or glasses lens) in skin colour, then a lash line.
import * as M from './motion.js';

export const MOUTHS = {
  closed: [0.78, 0.13], small: [0.82, 0.36], mid: [0.92, 0.6], open: [1, 0.92],
  wide: [1.06, 0.62], round: [0.58, 0.8], fv: [0.86, 0.24],
};

/**
 * Optional drawn mouth set (MOUTH_PROMPT order): 0 M·B·P, 1 S·T·K·EE, 2 EH, 3 AH, 4 OH, 5 OO·W, 6 F·V, 7 L, 8 rest smile.
 * Lip-sync shape -> which drawn mouth to show.
 */
export const DRAWN = { closed: 0, small: 1, mid: 2, wide: 2, open: 3, round: 4, oo: 5, fv: 6, l: 7 };

/** A face box is [x, y, w, h, angle?]: the rect as drawn, then turned by angle (radians) around its centre. */
export const boxAngle = b => b[4] || 0;
/** Axis-aligned bounds of a (possibly turned) box, rounded out to whole pixels. */
export function boxAABB([x, y, w, h, a = 0]) {
  const cx = x + w / 2, cy = y + h / 2, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const hw = (w * c + h * s) / 2, hh = (w * s + h * c) / 2;
  const x0 = Math.floor(cx - hw), y0 = Math.floor(cy - hh);
  return [x0, y0, Math.ceil(cx + hw) - x0, Math.ceil(cy + hh) - y0];
}
/** Run fn with the context turned so the box's own axes are x and y (the box keeps its drawn x, y, w, h). */
function inBox(c, [x, y, w, h, a = 0], fn) {
  c.save();
  if (a) { const cx = x + w / 2, cy = y + h / 2; c.translate(cx, cy); c.rotate(a); c.translate(-cx, -cy); }
  fn(); c.restore();
}

/** Most common colour in a ring just outside a box: the "skin" around the mouth or eye, for any character. */
export function ringColor(g, box, W, H, pad = 10) {
  const [x, y, w, h] = box;
  const bx = Math.max(0, x - pad), by = Math.max(0, y - pad), bw = Math.min(W - bx, w + pad * 2), bh = Math.min(H - by, h + pad * 2);
  if (bw <= 0 || bh <= 0) return [240, 180, 140];
  const d = g.getImageData(bx, by, bw, bh).data;
  const buckets = new Map();
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const X = bx + i, Y = by + j;
    if (X >= x && X < x + w && Y >= y && Y < y + h) continue; // ring only
    const q = (j * bw + i) * 4, r = d[q], gg = d[q + 1], b = d[q + 2], a = d[q + 3];
    if (a < 240 || r + gg + b < 150) continue; // skip outlines and transparency
    const k = (r >> 4) << 8 | (gg >> 4) << 4 | (b >> 4);
    const e = buckets.get(k) || [0, 0, 0, 0]; e[0]++; e[1] += r; e[2] += gg; e[3] += b; buckets.set(k, e);
  }
  let best = null;
  for (const e of buckets.values()) if (!best || e[0] > best[0]) best = e;
  return best ? [best[1] / best[0], best[2] / best[0], best[3] / best[0]].map(Math.round) : [240, 180, 140];
}

/** Inside of an eye or lens: what the outside cannot reach without crossing a dark outline. */
function enclosedMask(d, w, h, cx, cy) {
  const n = w * h, dark = new Uint8Array(n), outside = new Uint8Array(n), stack = new Int32Array(n);
  for (let i = 0; i < n; i++) { const q = i * 4; dark[i] = d[q + 3] < 128 || d[q] + d[q + 1] + d[q + 2] < 200 ? 1 : 0; if (d[q + 3] < 128) outside[i] = 1; }
  let sp = 0;
  const seed = i => { if (!outside[i] && !dark[i]) { outside[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (sp) { const i = stack[--sp], x = i % w, y = (i / w) | 0; if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w); }
  const comp = new Int32Array(n).fill(-1), inside = [];
  for (let p = 0; p < n; p++) {
    if (!dark[p] || comp[p] !== -1) continue;
    const id = inside.length; let ok = true; sp = 0; stack[sp++] = p; comp[p] = id;
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) ok = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (outside[j]) ok = false; else if (dark[j] && comp[j] === -1) { comp[j] = id; stack[sp++] = j; }
      }
    }
    inside.push(ok);
  }
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = !outside[i] && (!dark[i] || inside[comp[i]]) ? 1 : 0;
  const keep = new Uint8Array(n);
  let start = Math.round(cy) * w + Math.round(cx);
  if (!m[start]) { let best = -1, bd = 1e9; for (let i = 0; i < n; i++) if (m[i]) { const dd = (i % w - cx) ** 2 + (((i / w) | 0) - cy) ** 2; if (dd < bd) { bd = dd; best = i; } } start = best; }
  if (start < 0) return { mask: keep, area: 0 };
  sp = 0; keep[start] = 1; stack[sp++] = start; let area = 1;
  while (sp) {
    const i = stack[--sp], x = i % w, y = (i / w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && m[j] && !keep[j]) { keep[j] = 1; stack[sp++] = j; area++; }
  }
  return { mask: keep, area };
}

export class Mascot {
  /** sheet: { poses: [{ canvas }], width, height, foot }, names: pose names, faces: { name: { mouth, eyes, open, blinks } } */
  constructor(sheet, names, faces, mouths = null) {
    this.W = sheet.width; this.H = sheet.height; this.foot = sheet.foot;
    this.imgs = {}; names.forEach((n, i) => { this.imgs[n] = sheet.poses[i].canvas; });
    this.names = names;
    this.faces = faces;
    this.setMouths(mouths);
    this.ink = '#1a0f0a';
    this.comp = new OffscreenCanvas(this.W, this.H); this.cctx = this.comp.getContext('2d');
    this.tiny = new OffscreenCanvas(this.W, this.H); this.tctx = this.tiny.getContext('2d');
    this.cache = {};
    names.forEach(n => this.prepare(n));
  }

  /** Use a drawn mouth set (9 canvases from cutMouthSheet), or null to go back to the squashed own mouth. */
  setMouths(mouths) {
    this.mouths = mouths && mouths.length === 9 && mouths.every(Boolean) ? mouths : null;
    // the rest smile (#9) sets the scale: it is drawn as wide as the mouth box
    this.mouthRefW = this.mouths ? this.mouths[8].width : 1;
  }

  /** Recompute skin, mouth patch and eyelids for one pose (call after its boxes change). */
  prepare(name) {
    const f = this.faces[name]; if (!f) return;
    const img = this.imgs[name], W = this.W, H = this.H;
    const g = img.getContext('2d', { willReadFrequently: true });
    const skin = ringColor(g, boxAABB(f.mouth), W, H);
    // donor: closed-mouth poses borrow the first open-mouth pose's mouth
    const donor = f.open ? name : (this.names.find(n => this.faces[n]?.open) || name);
    const df = this.faces[donor];
    const [dx, dy, dw, dh, da = 0] = df.mouth, w = Math.round(dw), h = Math.round(dh);
    let patch = null;
    if (w > 4 && h > 4) {
      // cut the donor mouth straight (undo its tilt), so it can be laid into any box at that box's tilt
      patch = new OffscreenCanvas(w, h); const px = patch.getContext('2d');
      px.save(); px.translate(w / 2, h / 2); px.rotate(-da); px.translate(-(dx + dw / 2), -(dy + dh / 2));
      px.drawImage(this.imgs[donor], 0, 0); px.restore();
      px.globalCompositeOperation = 'destination-in';
      const gr = px.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
      gr.addColorStop(0, '#000'); gr.addColorStop(0.82, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      px.fillStyle = gr; px.save(); px.translate(w / 2, h / 2); px.scale(1, h / w); px.translate(-w / 2, -h / 2); px.fillRect(-w, -w, w * 3, w * 3); px.restore();
    }
    const lids = f.blinks === false ? null : f.eyes.map(eye => {
      const [, , ew, eh, ea = 0] = eye, [ex, ey, aw, ah] = boxAABB(eye);
      const eskin = ringColor(g, [ex, ey, aw, ah], W, H, 6);
      const pad = Math.round(Math.max(ew, eh) * 0.9);
      const bx = Math.max(0, Math.round(ex - pad)), by = Math.max(0, Math.round(ey - pad));
      const bw = Math.min(W - bx, Math.round(aw + pad * 2)), bh = Math.min(H - by, Math.round(ah + pad * 2));
      const src = g.getImageData(bx, by, bw, bh).data;
      let { mask, area } = enclosedMask(src, bw, bh, eye[0] + ew / 2 - bx, eye[1] + eh / 2 - by);
      // sensible size? (between ~half the box and ~4x it). Otherwise a soft lid that fills the user's box.
      if (area < ew * eh * 0.45 || area > ew * eh * 4.5) {
        mask = new Uint8Array(bw * bh);
        const cx = eye[0] + ew / 2 - bx, cy = eye[1] + eh / 2 - by, co = Math.cos(ea), si = Math.sin(ea);
        for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
          const u = (i - cx) * co + (j - cy) * si, v = -(i - cx) * si + (j - cy) * co;
          if ((u / (ew / 2)) ** 2 + (v / (eh / 2)) ** 2 <= 1) mask[j * bw + i] = 1;
        }
      }
      const c = new OffscreenCanvas(bw, bh), cx2 = c.getContext('2d'), out = cx2.createImageData(bw, bh);
      for (let i = 0; i < bw * bh; i++) if (mask[i]) { out.data[i * 4] = eskin[0]; out.data[i * 4 + 1] = eskin[1]; out.data[i * 4 + 2] = eskin[2]; out.data[i * 4 + 3] = 255; }
      cx2.putImageData(out, 0, 0);
      return { c, bx, by };
    });
    this.cache[name] = { skin: `rgb(${skin.join(',')})`, patch, lids };
  }

  /** Draw a pose with a mouth shape ('rest' = as drawn) and optional blink into the internal canvas; returns it. */
  compose(name, mouth = 'rest', blink = false) {
    const c = this.cctx, f = this.faces[name], k = this.cache[name];
    c.clearRect(0, 0, this.W, this.H);
    c.drawImage(this.imgs[name], 0, 0);
    if (f && k && mouth !== 'rest' && MOUTHS[mouth]) inBox(c, f.mouth, () => {
      const [x, y, w, h] = f.mouth;
      c.save(); c.filter = 'blur(1.4px)'; c.fillStyle = k.skin;
      c.beginPath(); c.roundRect(x - 4, y - 3, w + 8, h + 6, Math.min(h, w) * 0.45); c.fill(); c.restore();
      if (this.mouths) {
        // drawn mouth: scaled so the rest smile spans the box; thin shapes sit on the middle of the box,
        // open ones hang from near its top (the jaw drops, the top lip stays)
        const im = this.mouths[DRAWN[mouth] ?? 2], s = (w * 0.95) / this.mouthRefW;
        const dw = im.width * s, dh = im.height * s;
        const dy = dh < h * 0.7 ? y + (h - dh) / 2 : y + h * 0.1;
        c.imageSmoothingQuality = 'high';
        c.drawImage(im, x + (w - dw) / 2, dy, dw, dh);
      } else if (mouth === 'closed' || mouth === 'fv' || !k.patch) {
        const lw = Math.max(3, w * 0.065), y0 = y + Math.min(h * 0.35, 14);
        c.save(); c.strokeStyle = this.ink; c.lineWidth = lw; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x + w * 0.2, y0); c.quadraticCurveTo(x + w / 2, y0 + lw * 1.6, x + w * 0.8, y0); c.stroke();
        if (mouth === 'fv') { c.fillStyle = '#fff'; c.beginPath(); c.roundRect(x + w * 0.36, y0 + lw * 0.2, w * 0.28, lw * 1.3, 2); c.fill(); }
        c.restore();
      } else {
        const [sx, sy] = MOUTHS[mouth], pw = w * sx, ph = h * sy;
        c.drawImage(k.patch, x + (w - pw) / 2, y + 1, pw, ph);
      }
    });
    if (blink && f && k && k.lids) {
      f.eyes.forEach((eye, i) => {
        const lid = k.lids[i]; if (!lid) return;
        const [x, y, w, h] = eye;
        c.drawImage(lid.c, lid.bx, lid.by);
        inBox(c, eye, () => {
          c.strokeStyle = this.ink; c.lineWidth = Math.max(3, h * 0.11); c.lineCap = 'round';
          c.beginPath(); c.moveTo(x + w * 0.14, y + h * 0.52); c.quadraticCurveTo(x + w / 2, y + h * 0.7, x + w * 0.86, y + h * 0.52); c.stroke();
        });
      });
    }
    return this.comp;
  }
}

// ---------------- the scene: background + animated mascot ----------------

export const BACKGROUNDS = { clear: null, green: '#00B140', dark: '#15171C', light: '#F6F3EE' };

function drawBackground(g, W, H, bg, custom, t) {
  if (bg === 'clear') { g.clearRect(0, 0, W, H); return; }
  if (bg === 'custom') { g.fillStyle = custom; g.fillRect(0, 0, W, H); return; }
  if (bg === 'glow') {
    g.fillStyle = '#15171C'; g.fillRect(0, 0, W, H);
    const blob = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
    blob(W * 0.25 + M.fbm(t * 0.2, 1) * 40, H * 0.3, Math.max(W, H) * 0.5, 'rgba(255,120,62,0.30)');
    blob(W * 0.8 + M.fbm(t * 0.2, 5) * 40, H * 0.65, Math.max(W, H) * 0.55, 'rgba(52,127,197,0.26)');
    const tq = M.onTwos(t, 12);
    for (let i = 0; i < 90; i++) {
      const x = M.rand(3, i) * W, y = M.rand(4, i) * H, s = [3, 4, 6][i % 3];
      g.globalAlpha = 0.3 + 0.7 * M.step(0.5 + 0.5 * Math.sin(tq * (0.6 + M.rand(5, i) * 1.8) + i), 4);
      g.fillStyle = i % 7 === 0 ? '#FF783E' : '#F6F3EE'; g.fillRect(Math.round(x), Math.round(y), s, s);
    }
    g.globalAlpha = 1; return;
  }
  g.fillStyle = BACKGROUNDS[bg] || '#15171C'; g.fillRect(0, 0, W, H);
}

/** Track value at time t from [[t, v], ...]. */
export function at(track, t, dflt) { let v = dflt; let lo = 0, hi = track.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (track[m][0] <= t) { v = track[m][1]; lo = m + 1; } else hi = m - 1; } return v; }

export function blinkSchedule(duration, seed = 7) {
  const out = []; let t = 0.9;
  for (let i = 0; t < duration + 3; i++) { out.push(t); t += 2.2 + M.rand(seed, i) * 2.8; if (M.rand(seed + 1, i) < 0.15) out.push(t - 1.7); }
  return out.sort((a, b) => a - b);
}

/**
 * Draw one frame. p = { W, H, bg, bgColor, mascot, poses: [[t, name]], mouth: [[t, shape]], blinks: [t], size (0..1 of H),
 *   pos: 'left'|'center'|'right', enter: 'pop'|'pixel'|'slide'|'none' }
 */
export function drawFrame(g, t, p) {
  const { W, H, mascot: m } = p;
  drawBackground(g, W, H, p.bg, p.bgColor, t);
  // which pose, since when
  let pose = p.poses[0], since = 0;
  for (const q of p.poses) if (q[0] <= t) { pose = q; since = q[0]; } else break;
  const name = m.imgs[pose[1]] ? pose[1] : m.names[0];
  const mouth = at(p.mouth || [], t, 'rest');
  const blink = (p.blinks || []).some(b => t >= b && t < b + 0.1);
  const comp = m.compose(name, mouth, blink);

  // size and place: body height = size * H, feet near the bottom
  const k = (p.size * H) / (m.foot[1] - 0) * 0.98;
  const footX = { left: W * 0.27, center: W * 0.5, right: W * 0.73 }[p.pos || 'center'];
  const footY = H * 0.95;
  // motion: pose pop (squash), hop on big poses, breathing, sway
  const ds = t - since;
  const pop = since > 0 && ds < 0.6 ? 1 - M.spring(t, since, M.springs.bounce) : 0;
  const hop = since > 0 && ['wave', 'cheer'].includes(name) ? Math.sin(M.clamp(ds / 0.32) * Math.PI) * 0.022 * H : 0;
  const breathe = 1 + Math.sin(t * Math.PI * 2 / 3.1) * 0.006;
  const sway = M.fbm(t * 0.35, 21) * 0.01;
  let sx = 1 + pop * 0.05, sy = (1 - pop * 0.08) * breathe, alpha = 1, dy = -hop, block = 1;
  // entrance
  const e = p.enter || 'pop';
  if (e === 'pop') { const s = M.spring(t, 0.05, M.springs.bounce); sx *= s; sy *= s; alpha = M.clamp(t / 0.1); }
  else if (e === 'slide') { const s = M.spring(t, 0.05, M.springs.pop); dy += (1 - s) * H * 0.6; }
  else if (e === 'pixel') { const kk = M.clamp((t - 0.05) / 0.55); block = Math.round(M.lerp(48, 1, M.ease.outCubic(kk))); block = block > 1 ? Math.max(2, Math.round(block / 4) * 4) : 1; alpha = M.clamp(kk * 3); }

  // shadow
  if (p.bg !== 'clear' || p.shadowOnClear) {
    g.save(); g.globalAlpha = 0.45 * alpha * (1 - hop / (0.05 * H));
    const gr = g.createRadialGradient(footX, footY, 0, footX, footY, m.W * k * 0.42);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.scale(1, 0.12); g.beginPath(); g.arc(footX, footY / 0.12, m.W * k * 0.42, 0, Math.PI * 2); g.fill(); g.restore();
  }

  g.save();
  g.globalAlpha = alpha;
  g.translate(footX, footY + dy);
  g.rotate(sway);
  g.scale(sx * k, sy * k);
  if (block > 1) {
    const tw = Math.max(1, Math.round(m.W / block)), th = Math.max(1, Math.round(m.H / block));
    m.tctx.clearRect(0, 0, tw, th); m.tctx.drawImage(comp, 0, 0, tw, th);
    g.imageSmoothingEnabled = false;
    g.drawImage(m.tiny, 0, 0, tw, th, -m.foot[0], -m.foot[1], m.W, m.H);
  } else {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(comp, -m.foot[0], -m.foot[1]);
  }
  g.restore();
}
