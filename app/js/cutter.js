// Cut a pose sheet into same-scale sprites, in the browser. Handles green, white and transparent backgrounds.

export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, err) => { img.onload = ok; img.onerror = () => err(new Error('Could not open that image.')); img.src = url; });
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function key(data, w, h) {
  let clear = 0;
  for (let i = 3; i < data.length; i += 4 * 97) if (data[i] < 10) clear++;
  if (clear / (data.length / 4 / 97) > 0.15) return 'alpha';
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const cs = [px(2, 2), px(w - 3, 2), px(2, h - 3), px(w - 3, h - 3)];
  const bg = [0, 1, 2].map(k => Math.round(cs.reduce((s, c) => s + c[k], 0) / 4));
  const green = bg[1] > bg[0] + 50 && bg[1] > bg[2] + 30;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let a;
    if (green) {
      const dom = g - Math.max(r, b);
      a = dom > 70 ? 0 : dom < 25 ? 255 : Math.round(255 * (70 - dom) / 45);
      if (a > 0 && g > Math.max(r, b)) data[i + 1] = Math.max(r, b); // remove green spill on edges
    } else {
      const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
      a = d < 18 ? 0 : d > 48 ? 255 : Math.round(255 * (d - 18) / 30);
    }
    data[i + 3] = Math.min(data[i + 3], a);
  }
  return green ? 'green' : 'flat';
}

function components(data, w, h, thr = 40) {
  const lab = new Int32Array(w * h).fill(-1), comps = [], stack = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (lab[p] !== -1 || data[p * 4 + 3] < thr) continue;
    const id = comps.length; let sp = 0; stack[sp++] = p; lab[p] = id;
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (sp) {
      const q = stack[--sp]; n++;
      const x = q % w, y = (q / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && lab[q - 1] === -1 && data[(q - 1) * 4 + 3] >= thr) { lab[q - 1] = id; stack[sp++] = q - 1; }
      if (x < w - 1 && lab[q + 1] === -1 && data[(q + 1) * 4 + 3] >= thr) { lab[q + 1] = id; stack[sp++] = q + 1; }
      if (y > 0 && lab[q - w] === -1 && data[(q - w) * 4 + 3] >= thr) { lab[q - w] = id; stack[sp++] = q - w; }
      if (y < h - 1 && lab[q + w] === -1 && data[(q + w) * 4 + 3] >= thr) { lab[q + w] = id; stack[sp++] = q + w; }
    }
    comps.push({ id, n, x0, y0, x1, y1 });
  }
  return { lab, comps };
}

/**
 * Returns { poses: [{ canvas, w, h }], width, height, foot: [x, y] } with every pose on one shared canvas size,
 * the same body height, feet on one baseline. Poses come in reading order (row by row, left to right).
 */
export async function cutSheet(img, { height = 1000, maxSide = 2400 } = {}) {
  const k0 = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k0), h = Math.round(img.naturalHeight * k0);
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const id = g.getImageData(0, 0, w, h);
  const data = id.data;
  key(data, w, h);
  const { lab, comps } = components(data, w, h);
  if (!comps.length) return { poses: [], width: 0, height: 0, foot: [0, 0] };
  const big = Math.max(...comps.map(c => c.n));
  let figs = comps.filter(c => c.n >= big * 0.12);
  // reading order: group into rows by vertical overlap, then left to right
  figs.sort((a, b) => a.y0 - b.y0);
  const rows = [];
  for (const f of figs) {
    const cy = (f.y0 + f.y1) / 2;
    const row = rows.find(r => cy > r.y0 && cy < r.y1);
    if (row) { row.items.push(f); row.y0 = Math.min(row.y0, f.y0); row.y1 = Math.max(row.y1, f.y1); }
    else rows.push({ y0: f.y0, y1: f.y1, items: [f] });
  }
  figs = rows.flatMap(r => r.items.sort((a, b) => a.x0 - b.x0));

  const cut = figs.map(f => {
    const fw = f.x1 - f.x0 + 1, fh = f.y1 - f.y0 + 1;
    const out = new ImageData(fw, fh);
    let sx = 0, sn = 0;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const s = (f.y0 + y) * w + (f.x0 + x);
      if (lab[s] !== f.id) continue;
      const d = (y * fw + x) * 4;
      out.data[d] = data[s * 4]; out.data[d + 1] = data[s * 4 + 1]; out.data[d + 2] = data[s * 4 + 2]; out.data[d + 3] = data[s * 4 + 3];
      if (y > fh * 0.92 && data[s * 4 + 3] > 128) { sx += x; sn++; }
    }
    return { img: out, w: fw, h: fh, footX: sn ? sx / sn : fw / 2, k: height / fh };
  });
  let left = 0, right = 0;
  for (const f of cut) { left = Math.max(left, f.footX * f.k); right = Math.max(right, (f.w - f.footX) * f.k); }
  const pad = 8, cw = Math.ceil(left + right) + pad * 2, ch = height + pad * 2;
  const foot = [Math.round(left) + pad, height + pad];
  const poses = [];
  for (const f of cut) {
    const src = new OffscreenCanvas(f.w, f.h); src.getContext('2d').putImageData(f.img, 0, 0);
    const pc = document.createElement('canvas'); pc.width = cw; pc.height = ch;
    const pg = pc.getContext('2d', { willReadFrequently: true });
    pg.imageSmoothingQuality = 'high';
    pg.drawImage(src, Math.round(foot[0] - f.footX * f.k), foot[1] - height, Math.round(f.w * f.k), height);
    poses.push({ canvas: pc });
  }
  return { poses, width: cw, height: ch, foot };
}

/**
 * Cut a mouth sheet: 9 drawn mouths in a 3x3 grid, in reading order (the order of MOUTH_PROMPT).
 * Every piece that lands in a grid cell belongs to that mouth (teeth or tongue can be separate pieces).
 * Returns { mouths: [canvas x9], found } where found = how many cells had a mouth.
 */
export async function cutMouthSheet(img, { maxSide = 1800 } = {}) {
  const k0 = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k0), h = Math.round(img.naturalHeight * k0);
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h).data;
  key(data, w, h);
  const { lab, comps } = components(data, w, h);
  const keep = comps.filter(p => p.n >= 40);
  if (!keep.length) return { mouths: [], found: 0 };
  // the grid: split the area the pieces cover into thirds
  const X0 = Math.min(...keep.map(p => p.x0)), X1 = Math.max(...keep.map(p => p.x1));
  const Y0 = Math.min(...keep.map(p => p.y0)), Y1 = Math.max(...keep.map(p => p.y1));
  const cells = Array.from({ length: 9 }, () => []);
  for (const p of keep) {
    const col = Math.min(2, Math.floor(((p.x0 + p.x1) / 2 - X0) / ((X1 - X0 + 1) / 3)));
    const row = Math.min(2, Math.floor(((p.y0 + p.y1) / 2 - Y0) / ((Y1 - Y0 + 1) / 3)));
    cells[row * 3 + col].push(p);
  }
  const pad = 4, mouths = [];
  for (const ps of cells) {
    if (!ps.length) { mouths.push(null); continue; }
    const x0 = Math.min(...ps.map(p => p.x0)) - pad, y0 = Math.min(...ps.map(p => p.y0)) - pad;
    const x1 = Math.max(...ps.map(p => p.x1)) + pad, y1 = Math.max(...ps.map(p => p.y1)) + pad;
    const mw = x1 - x0 + 1, mh = y1 - y0 + 1, ids = new Set(ps.map(p => p.id));
    const out = new ImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const sx = x0 + x, sy = y0 + y; if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const s = sy * w + sx; if (!ids.has(lab[s]) && data[s * 4 + 3] >= 40) continue;
      const d = (y * mw + x) * 4;
      out.data[d] = data[s * 4]; out.data[d + 1] = data[s * 4 + 1]; out.data[d + 2] = data[s * 4 + 2]; out.data[d + 3] = data[s * 4 + 3];
    }
    const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
    mc.getContext('2d').putImageData(out, 0, 0);
    mouths.push(mc);
  }
  return { mouths, found: mouths.filter(Boolean).length };
}

/**
 * Best guess for the mouth and eyes of a pose, so most people only nudge the boxes.
 * Eyes: the two biggest clusters of white in the head. Mouth: red/pink (tongue) below the eyes, padded for the lips.
 */
export function guessFace(canvas, foot) {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, W, H).data;
  // figure bounds
  let top = H, l = W, r = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 128) { if (y < top) top = y; if (x < l) l = x; if (x > r) r = x; }
  const body = foot[1] - top;
  const hy0 = top, hy1 = top + body * 0.4;
  const blobs = (test, y0, y1) => {
    const seen = new Uint8Array(W * H), out = [];
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, y1); y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (seen[p] || !test(p)) continue;
      const st = [p]; seen[p] = 1; let n = 0, x0 = W, ya = H, x1 = 0, yb = 0;
      while (st.length) {
        const q = st.pop(), qx = q % W, qy = (q / W) | 0; n++;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < ya) ya = qy; if (qy > yb) yb = qy;
        for (const nq of [q - 1, q + 1, q - W, q + W]) {
          const nx = nq % W, ny = (nq / W) | 0;
          if (nq < 0 || nq >= W * H || ny < y0 || ny >= y1 || Math.abs(nx - qx) > 1 || seen[nq] || !test(nq)) continue;
          seen[nq] = 1; st.push(nq);
        }
      }
      out.push({ n, x0, y0: ya, x1, y1: yb });
    }
    return out.sort((a, b) => b.n - a.n);
  };
  const white = p => { const i = p * 4; return d[i + 3] > 200 && d[i] > 215 && d[i + 1] > 215 && d[i + 2] > 215; };
  // tongue/mouth-inside: strong red-pink where green and blue are close (skin shadows have green well above blue)
  const red = p => { const i = p * 4; return d[i + 3] > 200 && d[i] > 180 && d[i] - d[i + 1] > 80 && Math.abs(d[i + 1] - d[i + 2]) < 32; };
  // eyes: the best matched PAIR of white blobs (same height, similar size, sensible gap), highest on the head
  const whites = blobs(white, hy0, hy1).filter(b => b.n > 20 && (b.x1 - b.x0) < body * 0.14).slice(0, 12);
  let pair = null, best = -Infinity;
  for (let i = 0; i < whites.length; i++) for (let j = 0; j < whites.length; j++) {
    const a = whites[i], c = whites[j]; if (a === c || a.x0 >= c.x0) continue;
    const ha = a.y1 - a.y0 + 1, hc = c.y1 - c.y0 + 1, wa = a.x1 - a.x0 + 1, wc = c.x1 - c.x0 + 1;
    const cya = (a.y0 + a.y1) / 2, cyc = (c.y0 + c.y1) / 2, dx = (c.x0 + c.x1) / 2 - (a.x0 + a.x1) / 2;
    if (Math.abs(cya - cyc) > Math.max(ha, hc) * 0.9 + 4) continue;
    if (dx < (wa + wc) * 0.55 || dx > (wa + wc) * 3.5) continue;
    if (Math.max(a.n, c.n) / Math.min(a.n, c.n) > 3.5) continue;
    const score = (a.n + c.n) * 0.02 - (cya + cyc) / 2 * 0.15 - Math.abs(cya - cyc);
    if (score > best) { best = score; pair = [a, c]; }
  }
  const headW = Math.max(60, (r - l) * 0.45);
  let eyeY, eyeGap, midX, eyeBoxes, found = !!pair;
  if (pair) {
    const [a, c] = pair;
    eyeY = (a.y0 + a.y1 + c.y0 + c.y1) / 4; midX = ((a.x0 + a.x1) / 2 + (c.x0 + c.x1) / 2) / 2;
    eyeGap = (c.x0 + c.x1) / 2 - (a.x0 + a.x1) / 2;
    const es = Math.max(22, eyeGap * 0.55);
    eyeBoxes = pair.map(e => { const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2; return [Math.round(cx - es / 2), Math.round(cy - es * 0.45), Math.round(es), Math.round(es * 0.9)]; });
  } else {
    eyeY = top + body * 0.2; midX = foot[0]; eyeGap = headW * 0.45;
    const es = Math.max(22, eyeGap * 0.55);
    eyeBoxes = [-1, 1].map(sd => [Math.round(midX + sd * eyeGap / 2 - es / 2), Math.round(eyeY - es * 0.45), Math.round(es), Math.round(es * 0.9)]);
  }
  // mouth: red/pink (tongue) below the eyes and between them, padded for lips and teeth
  const mx0 = midX - eyeGap * 0.9, mx1 = midX + eyeGap * 0.9;
  const mouthBlob = blobs(red, eyeY + eyeGap * 0.3, eyeY + eyeGap * 1.5)
    .filter(b => b.n > 30 && (b.x0 + b.x1) / 2 > mx0 && (b.x0 + b.x1) / 2 < mx1)
    .sort((a, b) => (a.y0 - b.y0) - (b.n - a.n) * 0.002)[0]; // nearest under the eyes, size as tie-break
  let mouth, open = false;
  if (mouthBlob) {
    const mw = mouthBlob.x1 - mouthBlob.x0, mh = mouthBlob.y1 - mouthBlob.y0;
    const px = Math.max(6, mw * 0.28), pyTop = Math.max(8, mh * 0.9), pyBot = Math.max(5, mh * 0.25);
    mouth = [Math.round(mouthBlob.x0 - px), Math.round(mouthBlob.y0 - pyTop), Math.round(mw + px * 2), Math.round(mh + pyTop + pyBot)];
    open = true;
  } else {
    const mw = eyeGap * 0.8, mh = eyeGap * 0.28;
    mouth = [Math.round(midX - mw / 2), Math.round(eyeY + eyeGap * 0.85), Math.round(mw), Math.round(mh)];
  }
  const eyes = found ? pair : [];
  return { mouth, eyes: eyeBoxes, open, blinks: eyes.length === 2 };
}
