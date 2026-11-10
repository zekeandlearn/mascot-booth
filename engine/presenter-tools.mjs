// Presenter tooling: cut pose sheets into same-scale sprites, and draw calibration review sheets.
// Works on transparent sheets, flat chroma-green sheets and flat white sheets. Node + sharp only.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

// ---------- keying ----------
async function loadKeyed(file) {
  const img = sharp(file).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  // Already transparent? Use the alpha as is.
  let clear = 0;
  for (let i = 3; i < data.length; i += 4 * 97) if (data[i] < 10) clear++;
  if (clear / (data.length / 4 / 97) > 0.15) return { data, w, h, keyed: 'alpha' };
  // Flat background: sample the four corners.
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const cs = [px(2, 2), px(w - 3, 2), px(2, h - 3), px(w - 3, h - 3)];
  const bg = [0, 1, 2].map(k => Math.round(cs.reduce((s, c) => s + c[k], 0) / 4));
  const green = bg[1] > bg[0] + 60 && bg[1] > bg[2] + 40;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
    let a;
    if (green) {
      // green dominance key, soft edge
      const dom = g - Math.max(r, b);
      a = dom > 70 ? 0 : dom < 25 ? 255 : Math.round(255 * (70 - dom) / 45);
      if (a > 0 && g > Math.max(r, b)) data[i + 1] = Math.max(r, b); // despill
    } else {
      a = d < 18 ? 0 : d > 48 ? 255 : Math.round(255 * (d - 18) / 30);
    }
    data[i + 3] = Math.min(data[i + 3], a);
  }
  return { data, w, h, keyed: green ? 'green' : 'flat' };
}

// ---------- connected components on alpha ----------
function components(data, w, h, thr = 40) {
  const lab = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (lab[p] !== -1 || data[p * 4 + 3] < thr) continue;
    const id = comps.length; let sp = 0; stack[sp++] = p; lab[p] = id;
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (sp) {
      const q = stack[--sp]; n++;
      const x = q % w, y = (q / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const r = ny * w + nx;
        if (lab[r] === -1 && data[r * 4 + 3] >= thr) { lab[r] = id; stack[sp++] = r; }
      }
    }
    comps.push({ id, n, x0, y0, x1, y1 });
  }
  return { lab, comps };
}

/**
 * Cut one sheet into figures, left to right. Small detached marks (sparkles, "!" lines) are dropped.
 * Returns [{ buf (RGBA raw), w, h, footX, footY }]
 */
export async function cutSheet(file, { minShare = 0.12 } = {}) {
  const { data, w, h, keyed } = await loadKeyed(file);
  const { lab, comps } = components(data, w, h);
  const big = Math.max(...comps.map(c => c.n));
  const figs = comps.filter(c => c.n >= big * minShare).sort((a, b) => a.x0 - b.x0);
  const out = [];
  for (const c of figs) {
    const fw = c.x1 - c.x0 + 1, fh = c.y1 - c.y0 + 1;
    const buf = Buffer.alloc(fw * fh * 4);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const s = (c.y0 + y) * w + (c.x0 + x);
      if (lab[s] !== c.id) continue; // only this figure, no neighbours or stray marks
      data.copy(buf, (y * fw + x) * 4, s * 4, s * 4 + 4);
    }
    // foot anchor: horizontal centre of the opaque pixels in the bottom 8% of rows
    let sx = 0, sn = 0;
    for (let y = Math.floor(fh * 0.92); y < fh; y++) for (let x = 0; x < fw; x++) if (buf[(y * fw + x) * 4 + 3] > 128) { sx += x; sn++; }
    out.push({ buf, w: fw, h: fh, footX: sn ? sx / sn : fw / 2, footY: fh, keyed });
  }
  return out;
}

/**
 * Cut sheets into a presenter folder: <out>/poses/<name>.png plus presenter.json.
 * Every pose is scaled to the same body height and shares one canvas, feet on one baseline,
 * so pose swaps never pop in size or position.
 * spec: [{ sheet, names: [...] }]
 */
export async function buildPresenter(spec, outDir, { height = 1100, name = 'presenter', pixel = 'smooth' } = {}) {
  fs.mkdirSync(path.join(outDir, 'poses'), { recursive: true });
  const figs = [];
  for (const s of spec) {
    const cut = await cutSheet(s.sheet, s);
    if (cut.length !== s.names.length) throw new Error(`${s.sheet}: found ${cut.length} figures, expected ${s.names.length} (${s.names.join(', ')})`);
    cut.forEach((f, i) => figs.push({ ...f, pose: s.names[i] }));
  }
  // scale each to the target height, then lay all on a shared canvas: width covers the widest reach either side
  const scaled = figs.map(f => ({ ...f, k: height / f.h }));
  let left = 0, right = 0;
  for (const f of scaled) { left = Math.max(left, f.footX * f.k); right = Math.max(right, (f.w - f.footX) * f.k); }
  const pad = 8;
  const cw = Math.ceil(left + right) + pad * 2, ch = height + pad * 2;
  const footX = Math.round(left) + pad, footY = height + pad;
  const poses = {};
  for (const f of scaled) {
    const tw = Math.round(f.w * f.k), th = height;
    const piece = await sharp(f.buf, { raw: { width: f.w, height: f.h, channels: 4 } })
      .resize(tw, th, { kernel: 'lanczos3' }).png().toBuffer();
    const x = Math.round(footX - f.footX * f.k), y = footY - th;
    await sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: piece, left: x, top: y }]).png({ compressionLevel: 9 })
      .toFile(path.join(outDir, 'poses', `${f.pose}.png`));
    poses[f.pose] = { file: `poses/${f.pose}.png`, mouth: null, eyes: null, talks: true, blinks: true };
  }
  const manifestPath = path.join(outDir, 'presenter.json');
  const prev = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  const manifest = {
    name, width: cw, height: ch, foot: [footX, footY], pixel,
    ...prev,
    poses: Object.fromEntries(Object.entries(poses).map(([k, v]) => [k, { ...v, ...(prev.poses?.[k] || {}) }])),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

/** Contact sheet of every pose with a 50px grid and coordinates, for calibrating mouth and eye boxes by eye. */
export async function reviewSheet(dir, out, { crop } = {}) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'presenter.json'), 'utf8'));
  const names = Object.keys(m.poses);
  const [cx, cy, cw, ch] = crop || [0, 0, m.width, m.height];
  const cols = Math.min(4, names.length), rows = Math.ceil(names.length / cols);
  const cellW = cw, cellH = ch + 40;
  const tiles = [];
  for (let i = 0; i < names.length; i++) {
    const p = m.poses[names[i]];
    const img = await sharp(path.join(dir, p.file)).extract({ left: cx, top: cy, width: cw, height: ch }).png().toBuffer();
    // grid + boxes as SVG overlay
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${cellH}"><rect width="100%" height="100%" fill="#2a2d35"/>`;
    svg += `<text x="8" y="28" font-family="Menlo" font-size="24" fill="#FF783E">${names[i]}</text>`;
    for (let x = Math.ceil(cx / 50) * 50; x < cx + cw; x += 50) svg += `<line x1="${x - cx}" y1="40" x2="${x - cx}" y2="${cellH}" stroke="#ffffff22"/><text x="${x - cx + 2}" y="52" font-size="10" fill="#fff8" font-family="Menlo">${x}</text>`;
    for (let y = Math.ceil(cy / 50) * 50; y < cy + ch; y += 50) svg += `<line x1="0" y1="${y - cy + 40}" x2="${cellW}" y2="${y - cy + 40}" stroke="#ffffff22"/><text x="2" y="${y - cy + 38}" font-size="10" fill="#fff8" font-family="Menlo">${y}</text>`;
    const box = (b, c) => b && (svg += `<rect x="${b[0] - cx}" y="${b[1] - cy + 40}" width="${b[2]}" height="${b[3]}" fill="none" stroke="${c}" stroke-width="2"/>`);
    box(p.mouth, '#00ff88'); (p.eyes || []).forEach(e => box(e, '#38bdf8'));
    svg += '</svg>';
    tiles.push({ input: Buffer.from(svg), left: (i % cols) * cellW, top: Math.floor(i / cols) * cellH });
    tiles.push({ input: img, left: (i % cols) * cellW, top: Math.floor(i / cols) * cellH + 40 });
    // redraw lines on top of the sprite
    tiles.push({ input: Buffer.from(svg.replace(/<rect width="100%" height="100%" fill="#2a2d35"\/>/, '')), left: (i % cols) * cellW, top: Math.floor(i / cols) * cellH });
  }
  await sharp({ create: { width: cols * cellW, height: rows * cellH, channels: 4, background: '#2a2d35' } })
    .composite(tiles).png().toFile(out);
  return out;
}
