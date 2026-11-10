// Kinetic type. Words land on the moment the voice says them.
import * as M from './motion.js';

const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9&%$#+]/g, '');
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+<>/=?';

/**
 * Find when each on-screen word is spoken, in order, starting at `from`. On-screen words that are not in the voice
 * get the previous word's time + gap, so a title can paraphrase the line.
 */
export function syncTimes(cs, text, from, { gap = 0.12, lead = 0.04 } = {}) {
  const words = text.split(/\s+/).filter(Boolean);
  let cursor = from - 0.05, last = from;
  return words.map(w => {
    const n = norm(w);
    const hit = n && cs.words.find(v => v.s >= cursor && v.n === n && v.s < cursor + 4);
    if (hit) { cursor = hit.s + 0.01; last = Math.max(from, hit.s - lead); return last; }
    last += gap; return last;
  });
}

/**
 * A headline. opts: { text, x, y, size, width, align, from, at (times per word, or omit to sync to the voice),
 *   style: 'rise' | 'slam' | 'scramble' | 'type' | 'pop', hl: [words to colour], hl2: [...], mark: [words to sweep],
 *   out (time words leave), outStyle: 'fall' | 'blur' | 'up', color, weight, font, lineHeight, tracking, shadow, sound }
 */
export function title(s, o) {
  const cs = s.cs;
  const el = document.createElement('div');
  el.className = 'cs-title';
  const size = o.size || 120;
  el.style.cssText += `left:${o.x ?? 80}px;top:${o.y ?? 300}px;width:${o.width ?? (cs.W - 160)}px;font-size:${size}px;text-align:${o.align || 'left'};` +
    (o.font ? `font-family:${o.font};` : '') + (o.weight ? `font-weight:${o.weight};` : '') + (o.color ? `color:${o.color};` : '') +
    (o.lineHeight ? `line-height:${o.lineHeight};` : '') + (o.tracking != null ? `letter-spacing:${o.tracking};` : '') +
    (o.shadow !== false ? 'text-shadow:0 10px 40px rgba(0,0,0,.45);' : '');
  const raw = o.text.split(/(\s+|\n)/).filter(x => x && x !== ' ');
  const tokens = [];
  for (const r of raw) { if (r.includes('\n')) { el.appendChild(document.createElement('br')); continue; } if (/^\s+$/.test(r)) continue; tokens.push(r); }
  const times = o.at || syncTimes(cs, tokens.join(' '), o.from ?? s.from, o.sync);
  const hl = new Set((o.hl || []).map(norm)), hl2 = new Set((o.hl2 || []).map(norm)), mk = new Set((o.mark || []).map(norm));
  // rebuild with spans (br positions kept by walking raw again)
  el.innerHTML = '';
  let ti = 0;
  const spans = [];
  for (const r of raw) {
    if (r.includes('\n')) { el.appendChild(document.createElement('br')); continue; }
    if (/^\s+$/.test(r)) continue;
    const sp = document.createElement('span');
    sp.className = 'cs-word' + (hl.has(norm(r)) ? ' hl' : '') + (hl2.has(norm(r)) ? ' hl2' : '');
    const inner = document.createElement('span'); inner.textContent = r; inner.style.position = 'relative'; inner.style.zIndex = '1';
    sp.appendChild(inner);
    let mark = null;
    if (mk.has(norm(r))) { mark = document.createElement('span'); mark.className = 'mark'; sp.appendChild(mark); }
    el.appendChild(sp); el.appendChild(document.createTextNode(' '));
    spans.push({ sp, inner, mark, text: r, t: times[ti++] });
  }
  const style = o.style || 'rise';
  if (o.sound !== false) spans.forEach((w, i) => { if (style === 'slam') cs.sfx('impact', w.t, { gain: 0.55 }); else if (style === 'pop' || (style === 'rise' && i === 0)) cs.sfx('pop', w.t, { gain: 0.25 }); else if (style === 'scramble') cs.sfx('blip', w.t, { gain: 0.3 }); });
  if (style === 'slam' && o.shake !== false) spans.forEach(w => cs.shake(w.t + 0.03, { amp: o.shakeAmp ?? 16, dur: 0.3 }));
  s.add(el, (t) => {
    spans.forEach((w, i) => {
      const dt = t - w.t;
      let op = 1, ty = 0, sc = 1, bl = 0, rot = 0;
      if (dt < 0) { op = 0; }
      else if (style === 'rise') { const k = M.spring(t, w.t, M.springs.snap); ty = (1 - k) * size * 0.55; op = M.clamp(dt / 0.12); bl = Math.max(0, (1 - M.clamp(dt / 0.22)) * 14); }
      else if (style === 'slam') { const k = M.spring(t, w.t, M.springs.pop); sc = M.lerp(2.1, 1, k); op = M.clamp(dt / 0.05); bl = (1 - M.clamp(dt / 0.12)) * 10; }
      else if (style === 'pop') { const k = M.spring(t, w.t, M.springs.bounce); sc = k; op = M.clamp(dt / 0.06); }
      else if (style === 'scramble' || style === 'type') {
        const n = w.text.length, per = style === 'type' ? 0.035 : 0.05;
        const shown = Math.floor(dt / per);
        let str = '';
        for (let c = 0; c < n; c++) {
          if (c < shown - (style === 'scramble' ? 3 : 0)) str += w.text[c];
          else if (c < shown && style === 'scramble') str += GLYPHS[Math.floor(M.hash(c * 31 + Math.floor(t * 30)) * GLYPHS.length)];
          else str += style === 'type' ? '' : ' ';
        }
        w.inner.textContent = dt * 30 > n * 1.5 * 30 * per + 30 * 0.2 ? w.text : str;
        op = dt >= 0 ? 1 : 0;
      }
      // exit
      if (o.out != null && t > o.out) {
        const k = M.ease.inCubic(M.clamp((t - o.out - i * 0.03) / 0.3));
        if ((o.outStyle || 'blur') === 'fall') { ty += k * size * 1.2; rot += k * (i % 2 ? 8 : -8); op *= 1 - k; }
        else if (o.outStyle === 'up') { ty -= k * size * 0.8; op *= 1 - k; bl += k * 12; }
        else { op *= 1 - k; bl += k * 16; sc *= 1 + k * 0.08; }
      }
      w.sp.style.opacity = op.toFixed(3);
      w.sp.style.transform = `translate3d(0,${ty.toFixed(1)}px,0) scale(${sc.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
      w.sp.style.filter = bl > 0.3 ? `blur(${bl.toFixed(1)}px)` : '';
      if (w.mark) { const k = M.ease.outExpo(M.clamp((t - w.t - 0.08) / 0.35)); w.mark.style.transform = `scaleX(${k.toFixed(3)})`; }
    });
  });
  return { el, spans, times };
}

/** Small pixel-font label that types itself, with a blinking block cursor. */
export function kicker(s, { text, x, y, at, color, size = 34, cursor = true, out, align = 'left', width } = {}) {
  const cs = s.cs;
  const el = document.createElement('div');
  el.className = 'cs-kicker';
  el.style.cssText += `left:${x}px;top:${y}px;font-size:${size}px;` + (color ? `color:${color};` : '') + (width ? `width:${width}px;text-align:${align};` : '');
  const tx = document.createElement('span'); const cur = document.createElement('span');
  cur.textContent = '█'; cur.style.marginLeft = '4px';
  el.append(tx, cur);
  cs.sfx('type', at, { dur: Math.min(1.2, text.length * 0.03), gain: 0.35 });
  s.add(el, (t) => {
    const n = Math.max(0, Math.floor((t - at) / 0.03));
    tx.textContent = text.slice(0, n);
    cur.style.opacity = cursor && t >= at && Math.floor(t * 2.5) % 2 === 0 ? '1' : '0';
    let op = t >= at ? 1 : 0;
    if (out != null) op *= 1 - M.clamp((t - out) / 0.2);
    el.style.opacity = op;
  });
  return el;
}

/** Karaoke captions: the spoken line in short chunks, the current word lit. */
export function captions(cs, { from = 0, to = Infinity, y = 1500, size = 54, maxWords = 4, maxGap = 0.3, pill = true, parent } = {}) {
  const words = cs.words.filter(w => w.s >= from && w.s < to);
  const chunks = [];
  let cur = [];
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (cur.length && (cur.length >= maxWords || w.s - prev.e > maxGap || /[.?!,]$/.test(prev.w))) { chunks.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) chunks.push(cur);
  const el = document.createElement('div');
  el.className = 'cs-caption';
  el.style.top = y + 'px'; el.style.fontSize = size + 'px';
  const box = document.createElement('div');
  box.style.cssText = `display:inline-block;padding:14px 28px;border-radius:22px;${pill ? 'background:rgba(13,14,18,.72);border:2px solid rgba(255,255,255,.08);' : ''}`;
  el.appendChild(box);
  let shown = -1;
  const spans = [];
  cs.add(el, (t) => {
    const ci = chunks.findIndex((c, i) => t >= c[0].s - 0.05 && t < (chunks[i + 1] ? chunks[i + 1][0].s - 0.05 : c[c.length - 1].e + 0.6));
    if (ci !== shown) {
      shown = ci; box.innerHTML = ''; spans.length = 0;
      if (ci >= 0) for (const w of chunks[ci]) { const sp = document.createElement('span'); sp.className = 'cs-word'; sp.textContent = w.w; box.appendChild(sp); spans.push({ sp, w }); }
    }
    el.style.opacity = ci >= 0 ? 1 : 0;
    if (ci >= 0) {
      const k = M.spring(t, chunks[ci][0].s - 0.05, M.springs.snap);
      box.style.transform = `translateY(${((1 - k) * 30).toFixed(1)}px) scale(${(0.94 + 0.06 * k).toFixed(3)})`;
    }
    for (const { sp, w } of spans) {
      const on = t >= w.s - 0.02 && t < w.e + 0.08;
      sp.classList.toggle('on', on);
      const p = on ? M.spring(t, w.s - 0.02, M.springs.pop) : 1;
      sp.style.transform = on ? `scale(${(1 + (1 - p) * 0.25 + 0.04).toFixed(3)})` : '';
      sp.style.opacity = t >= w.s - 0.02 ? 1 : 0.55;
    }
  }, { from, to: to + 1, parent: parent || cs.hud });
  return el;
}

/** A number that counts up on a curve, with a punch when it lands. */
export function counter(s, { x, y, from: v0 = 0, to: v1, at, dur = 1.2, size = 160, prefix = '', suffix = '', color, align = 'left', width = 600, decimals = 0, font } = {}) {
  const el = document.createElement('div');
  el.className = 'cs-title';
  el.style.cssText += `left:${x}px;top:${y}px;width:${width}px;font-size:${size}px;text-align:${align};font-variant-numeric:tabular-nums;` + (color ? `color:${color};` : '') + (font ? `font-family:${font};` : '');
  s.cs.sfx('riser', at, { dur, gain: 0.25 });
  s.cs.sfx('impact', at + dur, { gain: 0.45 });
  s.add(el, (t) => {
    const k = M.ease.inOutQuart(M.clamp((t - at) / dur));
    const v = M.lerp(v0, v1, k);
    el.textContent = prefix + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    const p = t > at + dur ? 1 - M.spring(t, at + dur, M.springs.pop) : 0;
    el.style.transform = `scale(${(1 + p * 0.12).toFixed(3)})`;
    el.style.opacity = t >= at - 0.1 ? 1 : 0;
  });
  return el;
}
