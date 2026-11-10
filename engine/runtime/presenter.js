// The talking presenter. Composites a pose sprite with lip sync (the character's OWN mouth art, squashed and
// stretched into each mouth shape), blinks, pose pops, breathing, moves and a pixel materialize in and out.
import * as M from './motion.js';

const loadImg = src => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => err(new Error('image failed: ' + src)); i.src = src; });

// mouth shape -> [scaleX, scaleY] of the open-mouth art. 'rest' = the pose's own drawn expression.
export const MOUTHS = {
  closed: [0.78, 0.13], small: [0.82, 0.36], mid: [0.92, 0.6], open: [1, 0.92],
  wide: [1.06, 0.62], round: [0.58, 0.8], fv: [0.86, 0.24],
};

// A face box is [x, y, w, h, angle?]: the rect as drawn, then turned by angle (radians) around its centre.
// Same format as the Mascot Booth web app, so a mascot set up there renders the same here.
/** Axis-aligned bounds of a (possibly turned) box, rounded out to whole pixels. */
function boxAABB([x, y, w, h, a = 0]) {
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

function sampleSkin(ctx, box, W, H) {
  // median of skin-like pixels in a ring around the box
  const [x, y, w, h] = boxAABB(box), pad = 8;
  const d = ctx.getImageData(Math.max(0, x - pad), Math.max(0, y - pad), Math.min(W, w + pad * 2), Math.min(H, h + pad * 2)).data;
  const rs = [], gs = [], bs = [];
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a > 240 && r > 190 && g > 120 && g < 215 && b > 70 && b < 175 && r - b > 60) { rs.push(r); gs.push(g); bs.push(b); }
  }
  const med = a => a.sort((p, q) => p - q)[a.length >> 1] ?? 0;
  return rs.length ? `rgb(${med(rs)},${med(gs)},${med(bs)})` : '#f2b183';
}


/** Lens-interior mask for a window of RGBA pixels. cx, cy: a point near the eye centre (window coords). */
function lensMask(d, w, h, cx, cy) {
  const n = w * h, dark = new Uint8Array(n), outside = new Uint8Array(n), stack = new Int32Array(n);
  for (let i = 0; i < n; i++) { const q = i * 4; dark[i] = d[q + 3] < 128 || d[q] + d[q + 1] + d[q + 2] < 200 ? 1 : 0; if (d[q + 3] < 128) outside[i] = 1; }
  // flood the outside over light pixels from the window edge
  let sp = 0;
  const seed = i => { if (!outside[i] && !dark[i]) { outside[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (sp) { const i = stack[--sp], x = i % w, y = (i / w) | 0;
    if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (y > 0) seed(i - w); if (y < h - 1) seed(i + w); }
  // dark components: inside only if no pixel touches the outside or the window edge
  const comp = new Int32Array(n).fill(-1), inside = [];
  for (let p = 0; p < n; p++) {
    if (!dark[p] || comp[p] !== -1) continue;
    const id = inside.length; let ok = true; sp = 0; stack[sp++] = p; comp[p] = id;
    while (sp) { const i = stack[--sp], x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) ok = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (outside[j]) ok = false;
        else if (dark[j] && comp[j] === -1) { comp[j] = id; stack[sp++] = j; }
      } }
    inside.push(ok);
  }
  const m = new Uint8Array(n);
  for (let i = 0; i < n; i++) m[i] = !outside[i] && (!dark[i] || inside[comp[i]]) ? 1 : 0;
  // keep only the region connected to the eye centre (the other lens may sit in the window too)
  const keep = new Uint8Array(n); sp = 0;
  let start = Math.round(cy) * w + Math.round(cx);
  if (!m[start]) { let best = -1, bd = 1e9; for (let i = 0; i < n; i++) if (m[i]) { const dd = (i % w - cx) ** 2 + (((i / w) | 0) - cy) ** 2; if (dd < bd) { bd = dd; best = i; } } start = best; }
  if (start < 0) return keep;
  keep[start] = 1; stack[sp++] = start;
  while (sp) { const i = stack[--sp], x = i % w, y = (i / w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && m[j] && !keep[j]) { keep[j] = 1; stack[sp++] = j; } }
  return keep;
}

/**
 * opts: { src: folder URL with presenter.json, x, y: where the feet stand on the stage, scale, poses: [[t, name]],
 *         moves: [[t, x, y]], flips: [[t, bool]], enter, exit, from, to, mouth: [[t, state]], hop: [names], layer }
 */
export function presenter(cs, opts) {
  const o = { scale: 1, res: 1, poses: [[0, 'idle']], moves: [], flips: [], zooms: [], enter: null, exit: null, hop: ['cheer', 'whoa', 'laugh', 'wave'], ...opts };
  const wrap = document.createElement('div');
  wrap.className = 'cs-presenter';
  const shadow = document.createElement('div');
  shadow.className = 'cs-presenter-shadow';
  const canvas = document.createElement('canvas');
  wrap.append(shadow, canvas);
  const state = { ready: false };
  const mouthTrack = o.mouth || cs.data.mouth?.track || [];
  const blinkTimes = [];
  { // deterministic blink schedule
    let t = 0.8;
    for (let i = 0; t < cs.duration + 5; i++) { blinkTimes.push(t); t += 2.2 + M.rand(cs.seed + 3, i) * 2.8; if (M.rand(cs.seed + 4, i) < 0.15) blinkTimes.push(t - 2.0 + 0.32); }
  }

  const load = (async () => {
    const man = await (await fetch(o.src + 'presenter.json')).json();
    state.man = man;
    const imgs = {};
    await Promise.all(Object.entries(man.poses).map(async ([k, p]) => { imgs[k] = await loadImg(o.src + p.file); }));
    state.imgs = imgs;
    const W = man.width, H = man.height;
    // per pose: skin colour near mouth and eyes, and the mouth art (own or donor) as a soft-edged patch
    const work = new OffscreenCanvas(W, H), wctx = work.getContext('2d', { willReadFrequently: true });
    state.skin = {};
    for (const [k, p] of Object.entries(man.poses)) {
      wctx.clearRect(0, 0, W, H); wctx.drawImage(imgs[k], 0, 0);
      // a mascot exported from the web app carries the skin colours the app measured (works for any colour of character)
      state.skin[k] = p.skin
        ? { mouth: p.skin.mouth || null, eyes: (p.eyes || []).map((_, i) => p.skin.eyes?.[i] || p.skin.mouth) }
        : { mouth: p.mouth ? sampleSkin(wctx, p.mouth, W, H) : null, eyes: (p.eyes || []).map(e => sampleSkin(wctx, e, W, H)) };
    }
    // eyelids: the lens interior, found by topology rather than by box. Flood the "outside" from the edge of a
    // generous window over light pixels: the glasses frame stops it, so whatever it cannot reach is inside the lens.
    // Dark blobs fully enclosed by the lens (pupil, iris rim) are inside too; dark shapes that touch the outside
    // (frame, brows, hair) are not. The lid paints exactly that region in cheek skin.
    state.lids = {};
    for (const [k, p] of Object.entries(man.poses)) {
      if (!p.eyes) continue;
      wctx.clearRect(0, 0, W, H); wctx.drawImage(imgs[k], 0, 0);
      state.lids[k] = p.eyes.map((eye, i) => {
        const skin = (p.skin ? state.skin[k].eyes[i] || '#f2b183' : state.skin[k].mouth || '#f2b183').match(/\d+/g).map(Number);
        const [ex, ey, ew, eh, ea = 0] = eye, [x, y, w, h] = boxAABB(eye);
        const pad = 48, bx = Math.max(0, x - pad), by = Math.max(0, y - pad);
        const bw = Math.min(W - bx, w + pad * 2), bh = Math.min(H - by, h + pad * 2);
        const src = wctx.getImageData(bx, by, bw, bh).data;
        const ecx = ex + ew / 2 - bx, ecy = ey + eh / 2 - by;
        let mask = lensMask(src, bw, bh, ecx, ecy);
        let area = 0; for (const v of mask) area += v;
        if (area < ew * eh * 0.6 || (man.blinkFallback && area > ew * eh * 4.5)) {
          // the flood leaked (or found nothing): without a fallback this pose won't blink
          if (!man.blinkFallback) return null;
          // web-app mascots: a soft lid that fills the box the user drew, at the box's tilt (same as the app)
          mask = new Uint8Array(bw * bh);
          const co = Math.cos(ea), si = Math.sin(ea);
          for (let j = 0; j < bh; j++) for (let i2 = 0; i2 < bw; i2++) {
            const u = (i2 - ecx) * co + (j - ecy) * si, v = -(i2 - ecx) * si + (j - ecy) * co;
            if ((u / (ew / 2)) ** 2 + (v / (eh / 2)) ** 2 <= 1) mask[j * bw + i2] = 1;
          }
        }
        const c = new OffscreenCanvas(bw, bh), cx = c.getContext('2d'), out = cx.createImageData(bw, bh);
        for (let i = 0; i < bw * bh; i++) if (mask[i]) { out.data[i * 4] = skin[0]; out.data[i * 4 + 1] = skin[1]; out.data[i * 4 + 2] = skin[2]; out.data[i * 4 + 3] = 255; }
        cx.putImageData(out, 0, 0);
        return { c, bx, by };
      });
      if (state.lids[k].some(l => !l)) { state.lids[k] = null; console.warn(`presenter: pose "${k}" lens not isolated, blinks off`); }
    }
    state.patch = {};
    for (const [k, p] of Object.entries(man.poses)) {
      if (!p.mouth) continue;
      const donorName = p.mouthArt === 'own' ? k : (p.mouthArt || man.donor || k);
      const dp = man.poses[donorName];
      const [dx, dy, dw, dh, da = 0] = dp.mouth, w = Math.max(1, Math.round(dw)), h = Math.max(1, Math.round(dh));
      const c = new OffscreenCanvas(w, h), cx = c.getContext('2d');
      // cut the donor mouth straight (undo its tilt), so it can be laid into any box at that box's own tilt
      cx.save(); cx.translate(w / 2, h / 2); cx.rotate(-da); cx.translate(-(dx + dw / 2), -(dy + dh / 2));
      cx.drawImage(imgs[donorName], 0, 0); cx.restore();
      // feather the patch edge so it sits into the skin
      cx.globalCompositeOperation = 'destination-in';
      const g = cx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
      g.addColorStop(0, '#000'); g.addColorStop(0.82, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g; cx.save(); cx.translate(w / 2, h / 2); cx.scale(1, h / w); cx.translate(-w / 2, -h / 2);
      cx.fillRect(-w, -w, w * 3, w * 3); cx.restore();
      state.patch[k] = c;
    }
    state.comp = new OffscreenCanvas(W, H);
    state.cctx = state.comp.getContext('2d');
    state.tiny = new OffscreenCanvas(W, H);
    state.tctx = state.tiny.getContext('2d');
    const s = o.scale;
    // draw at scale * res so camera zooms on the presenter stay sharp; CSS shows it at scale
    canvas.width = Math.round(W * s * o.res); canvas.height = Math.round(H * s * o.res);
    canvas.style.width = Math.round(W * s) + 'px'; canvas.style.height = Math.round(H * s) + 'px';
    wrap.style.width = Math.round(W * s) + 'px'; wrap.style.height = Math.round(H * s) + 'px';
    state.ready = true;
  })();
  (window.__csPending || (window.__csPending = [])).push(load);

  const at = (track, t, dflt) => { let v = dflt; for (const [tt, val] of track) { if (tt <= t) v = val; else break; } return v; };
  const poseAt = t => { let cur = o.poses[0], prev = null; for (const p of o.poses) { if (p[0] <= t) { prev = cur; cur = p; } else break; } return { name: cur[1], since: cur[0], prev: prev?.[1] }; };
  const mouthAt = t => {
    let lo = 0, hi = mouthTrack.length - 1, v = 'rest';
    while (lo <= hi) { const m = (lo + hi) >> 1; if (mouthTrack[m][0] <= t) { v = mouthTrack[m][1]; lo = m + 1; } else hi = m - 1; }
    return v;
  };

  function compose(t, name, mouth, blink) {
    const { man, imgs, cctx: c } = state; const p = man.poses[name];
    c.clearRect(0, 0, man.width, man.height);
    c.drawImage(imgs[name], 0, 0);
    // lip sync
    if (mouth !== 'rest' && p.mouth && p.talks !== false && MOUTHS[mouth]) inBox(c, p.mouth, () => {
      const [x, y, w, h] = p.mouth;
      // erase the drawn mouth: a rounded box (open grins are wide at the top, an ellipse misses the corners)
      c.save(); c.filter = 'blur(1.4px)'; c.fillStyle = state.skin[name].mouth;
      c.beginPath(); c.roundRect(x - 5, y - 4, w + 10, h + 8, Math.min(h, w) * 0.45); c.fill(); c.restore();
      if (mouth === 'closed' || mouth === 'fv') {
        // a closed mouth is a clean ink line with a slight smile; fv adds the top teeth
        const lw = Math.max(4, w * 0.065), y0 = y + Math.min(h * 0.32, 14);
        c.save(); c.strokeStyle = man.ink || '#1a0f0a'; c.lineWidth = lw; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x + w * 0.2, y0); c.quadraticCurveTo(x + w / 2, y0 + lw * 1.6, x + w * 0.8, y0); c.stroke();
        if (mouth === 'fv') { c.fillStyle = '#fff'; c.beginPath(); c.roundRect(x + w * 0.36, y0 + lw * 0.2, w * 0.28, lw * 1.3, 2); c.fill(); }
        c.restore();
      } else {
        const [sx, sy] = MOUTHS[mouth];
        const pw = w * sx, ph = h * sy;
        c.drawImage(state.patch[name], x + (w - pw) / 2, y + 1, pw, ph);
      }
    });
    // blink: lid in skin colour + a lash line, inside the lens
    if (blink && p.blinks !== false && p.eyes && state.lids[name]) {
      p.eyes.forEach((e, i) => {
        const [x, y, w, h] = e;
        const lid = state.lids[name][i];
        c.drawImage(lid.c, lid.bx, lid.by);
        inBox(c, e, () => {
          c.strokeStyle = man.ink || '#1a0f0a'; c.lineWidth = Math.max(3, h * 0.11); c.lineCap = 'round';
          c.beginPath(); c.moveTo(x + w * 0.14, y + h * 0.52); c.quadraticCurveTo(x + w / 2, y + h * 0.7, x + w * 0.86, y + h * 0.52); c.stroke();
        });
      });
    }
  }

  const el = cs.add(wrap, (t) => {
    if (!state.ready) return;
    const { man } = state;
    const s = o.scale;
    const pose = poseAt(t);
    if (!man.poses[pose.name]) pose.name = Object.keys(man.poses)[0]; // unknown pose name: fall back to the first pose
    const mouth = mouthAt(t);
    const blink = o.blinkAt === true || blinkTimes.some(b => t >= b && t < b + 0.1);
    compose(t, pose.name, mouth, blink);

    // pose pop: squash and stretch from the feet, plus a hop for big poses
    const since = t - pose.since;
    const pop = pose.since > 0 && since < 0.6 ? 1 - M.spring(t, pose.since, M.springs.bounce) : 0;
    const sqY = 1 - pop * 0.08, sqX = 1 + pop * 0.05;
    const hop = o.hop.includes(pose.name) && pose.since > 0 ? Math.sin(M.clamp(since / 0.32) * Math.PI) * 26 : 0;
    const breathe = 1 + Math.sin(t * Math.PI * 2 / 3.1) * 0.006;
    const sway = M.fbm(t * 0.35, 21) * 0.6;

    // enter / exit: pixel materialize
    let block = 1, alpha = 1;
    if (o.enter != null) { const k = M.clamp((t - o.enter) / 0.55); block = Math.max(block, Math.round(M.lerp(56, 1, M.ease.outCubic(k)))); alpha = Math.min(alpha, M.clamp(k * 3)); }
    if (o.exit != null && t > o.exit) { const k = M.clamp((t - o.exit) / 0.45); block = Math.max(block, Math.round(M.lerp(1, 56, M.ease.inCubic(k)))); alpha = Math.min(alpha, 1 - M.clamp((k - 0.6) / 0.4)); }
    block = block > 1 ? Math.max(2, Math.round(block / 4) * 4) : 1; // stepped, so it reads as pixels

    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (block > 1) {
      const tw = Math.max(1, Math.round(man.width / block)), th = Math.max(1, Math.round(man.height / block));
      state.tctx.clearRect(0, 0, tw, th);
      state.tctx.imageSmoothingEnabled = true;
      state.tctx.drawImage(state.comp, 0, 0, tw, th);
      g.imageSmoothingEnabled = false;
      g.drawImage(state.tiny, 0, 0, tw, th, 0, 0, canvas.width, canvas.height);
    } else {
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(state.comp, 0, 0, canvas.width, canvas.height);
    }

    const pos = o.moves.length ? M.keys(t, o.moves.map(([tt, x, y, e]) => [tt, [x, y], e || M.ease.inOutCubic])) : [o.x, o.y];
    const flip = at(o.flips, t, false) ? -1 : 1;
    const fx = man.foot[0] * s, fy = man.foot[1] * s;
    wrap.style.left = (pos[0] - fx).toFixed(1) + 'px';
    wrap.style.top = (pos[1] - fy).toFixed(1) + 'px';
    const zoom = o.zooms.length ? M.keys(t, o.zooms.map(([tt, z, e]) => [tt, z, e || M.ease.inOutCubic])) : 1;
    wrap.style.transformOrigin = `${fx}px ${fy}px`;
    wrap.style.transform = zoom !== 1 ? `scale(${zoom.toFixed(4)})` : '';
    canvas.style.transformOrigin = `${fx}px ${fy}px`;
    canvas.style.transform = `translateY(${(-hop).toFixed(1)}px) scale(${(flip * sqX).toFixed(4)}, ${(sqY * breathe).toFixed(4)}) rotate(${sway.toFixed(3)}deg)`;
    wrap.style.opacity = alpha.toFixed(3);
    shadow.style.left = (fx - 150 * s * 1.6 / 2).toFixed(0) + 'px';
    shadow.style.top = (fy - 18 * s).toFixed(0) + 'px';
    shadow.style.width = (150 * s * 1.6).toFixed(0) + 'px';
    shadow.style.transform = `scale(${(1 - hop / 90).toFixed(3)})`;
  }, { from: o.from ?? -Infinity, to: o.to ?? Infinity, parent: o.layer || cs.front });

  return { el, poseAt, mouthAt, load };
}
