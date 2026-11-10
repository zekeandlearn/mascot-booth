// Scene blocks: panels, terminal, chips, pixel icons, a live voice waveform, code, filmstrip, cards.
import * as M from './motion.js';
import { iconEl } from './icons.js';

const div = (cls, css = '') => { const d = document.createElement('div'); d.className = cls; d.style.cssText += css; return d; };

/** Entrance helper: spring scale + rise + fade, with optional exit. Returns a 0..1 presence. */
export function appear(node, t, at, { out, from = 'rise', dist = 80, spring = M.springs.pop, origin = '50% 50%', rot = 0 } = {}) {
  const k = M.spring(t, at, spring);
  let op = M.clamp((t - at) / 0.12), ty = 0, sc = 1, r = 0;
  if (from === 'rise') { ty = (1 - k) * dist; sc = 0.92 + 0.08 * k; }
  else if (from === 'pop') { sc = Math.max(0, k); }
  else if (from === 'left') { ty = 0; node.style.translate = `${((1 - k) * -dist).toFixed(1)}px 0`; }
  else if (from === 'right') { node.style.translate = `${((1 - k) * dist).toFixed(1)}px 0`; }
  else if (from === 'drop') { ty = -(1 - k) * dist; }
  r = (1 - k) * rot;
  if (out != null && t > out) { const e = M.ease.inCubic(M.clamp((t - out) / 0.28)); op *= 1 - e; sc *= 1 - e * 0.1; ty -= e * 40; }
  node.style.transformOrigin = origin;
  node.style.transform = `translate3d(0,${ty.toFixed(1)}px,0) scale(${sc.toFixed(4)}) rotate(${r.toFixed(2)}deg)`;
  node.style.opacity = op.toFixed(3);
  return op;
}

/** A pixel icon that pops in, optional red strike-through slash (for "no X"). */
export function icon(s, { name, x, y, size = 160, at, out, strike, strikeAt, color, from = 'pop', glow = true } = {}) {
  const wrap = div('cs-abs', `left:${x}px;top:${y}px;`);
  const ic = iconEl(name, size, { color });
  if (glow) ic.style.filter = 'drop-shadow(0 12px 30px rgba(0,0,0,.5))';
  wrap.appendChild(ic);
  let bar;
  if (strike) {
    bar = div('cs-abs', `left:${-size * 0.12}px;top:${size * 0.42}px;width:${size * 1.24}px;height:${Math.max(10, size * 0.09)}px;background:var(--bad);border-radius:4px;transform-origin:left center;box-shadow:0 0 0 6px var(--bg)`);
    wrap.appendChild(bar);
    s.cs.sfx('glitch', strikeAt ?? at + 0.35, { gain: 0.35 });
  }
  s.cs.sfx('pop', at, { gain: 0.3 });
  s.add(wrap, (t) => {
    appear(wrap, t, at, { out, from });
    if (bar) { const k = M.ease.outExpo(M.clamp((t - (strikeAt ?? at + 0.35)) / 0.18)); bar.style.transform = `rotate(-28deg) scaleX(${k.toFixed(3)})`; }
  });
  return wrap;
}

/** A rounded chip with an icon and label. */
export function chip(s, { x, y, text, icon: ic, at, out, color, size = 38, from = 'pop', mono = false } = {}) {
  const el = div('cs-chip', `left:${x}px;top:${y}px;font-size:${size}px;` + (color ? `border-color:${color};` : '') + (mono ? 'font-family:var(--mono);font-weight:500;' : ''));
  if (ic) el.appendChild(iconEl(ic, size * 1.25));
  const tx = document.createElement('span'); tx.textContent = text; el.appendChild(tx);
  s.cs.sfx('pop', at, { gain: 0.22 });
  s.add(el, (t) => appear(el, t, at, { out, from, origin: '0% 50%' }));
  return el;
}

/** Window panel. Returns { el, body }. */
export function panel(s, { x, y, w, h, at, out, title, from = 'rise', dots = true } = {}) {
  const el = div('cs-panel', `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`);
  if (title != null) {
    const bar = div('cs-term-bar');
    if (dots) ['#e5484d', '#f5a524', '#269681'].forEach(c => { const i = document.createElement('i'); i.style.background = c; bar.appendChild(i); });
    const b = document.createElement('b'); b.textContent = title; bar.appendChild(b);
    el.appendChild(bar);
  }
  const body = div('cs-term-body');
  el.appendChild(body);
  s.cs.sfx('whoosh', at - 0.05, { gain: 0.35, dur: 0.35 });
  s.add(el, (t) => appear(el, t, at, { out, from, dist: 160 }));
  return { el, body };
}

/**
 * Terminal: lines = [{ text, at, kind: 'cmd' | 'out' | 'ok' | 'dim', speed (chars/s for cmd) }].
 * Commands type themselves (with key sounds), output lines appear whole.
 */
export function terminal(s, { x, y, w, h, at, out, title = 'zsh', prompt = '❯ ', lines = [], size = 30 } = {}) {
  const { el, body } = panel(s, { x, y, w, h, at, out, title });
  body.style.fontSize = size + 'px';
  const rows = lines.map(l => {
    const r = div('', 'min-height:1.5em');
    body.appendChild(r);
    const speed = l.speed || 34;
    if (l.kind === 'cmd' || l.kind === 'cont' || !l.kind) s.cs.sfx('type', l.at, { dur: l.text.length / speed, gain: 0.4 });
    return { r, l, speed };
  });
  const caret = div('cs-caret');
  s.add(body, (t) => {
    let caretRow = null;
    for (const { r, l, speed } of rows) {
      if (t < l.at) { r.innerHTML = ''; continue; }
      const cmd = l.kind === 'cmd' || l.kind === 'cont' || !l.kind; // 'cont' = a typed continuation line, no prompt
      const n = cmd ? Math.min(l.text.length, Math.floor((t - l.at) * speed)) : l.text.length;
      const cls = { out: '', ok: 'g', dim: 'c', info: 'b' }[l.kind] ?? '';
      r.innerHTML = (cmd && l.kind !== 'cont' ? `<span class="p">${prompt}</span>` : l.kind === 'cont' ? '<span class="p">  </span>' : '') + `<span class="${cls}">${escapeHtml(l.text.slice(0, n))}</span>`;
      if (cmd) caretRow = r;
    }
    if (caretRow) { caretRow.appendChild(caret); caret.style.opacity = Math.floor(t * 2.6) % 2 ? 0.25 : 1; }
  });
  return { el, body };
}

const escapeHtml = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Code panel: lines of [text, cls] tokens that reveal line by line from `at` (per = seconds per line). */
export function code(s, { x, y, w, h, at, out, title = 'film.js', lines, per = 0.09, size = 28, highlight } = {}) {
  const { el, body } = panel(s, { x, y, w, h, at, out, title });
  body.style.fontSize = size + 'px';
  body.style.lineHeight = '1.55';
  const rows = lines.map((toks, i) => {
    const r = div('', 'white-space:pre;');
    r.innerHTML = `<span class="c">${String(i + 1).padStart(2, ' ')}  </span>` + toks.map(([tx, c]) => `<span class="${c || ''}">${escapeHtml(tx)}</span>`).join('');
    body.appendChild(r);
    return r;
  });
  s.cs.sfx('type', at + 0.1, { dur: lines.length * per, gain: 0.3 });
  s.add(body, (t) => {
    rows.forEach((r, i) => {
      const ta = at + 0.15 + i * per;
      const k = M.ease.outCubic(M.clamp((t - ta) / 0.2));
      r.style.opacity = k.toFixed(3);
      r.style.transform = `translateX(${((1 - k) * 30).toFixed(1)}px)`;
      if (highlight && highlight.lines.includes(i)) {
        const hk = M.clamp((t - highlight.at) / 0.25);
        r.style.background = `rgba(255,120,62,${(0.18 * hk).toFixed(3)})`;
        r.style.boxShadow = hk > 0 ? `inset 6px 0 0 rgba(255,120,62,${hk.toFixed(2)})` : '';
      }
    });
  });
  return { el, body };
}

/** Document card whose text lines draw in as bars (a script being written). */
export function docLines(s, { x, y, w, h, at, out, title = 'SCRIPT.md', lines = 9, dur = 1.0, seed = 4 } = {}) {
  const { el, body } = panel(s, { x, y, w, h, at, out, title });
  const bars = Array.from({ length: lines }, (_, i) => {
    const b = div('', `height:22px;border-radius:6px;margin:0 0 22px;background:${i % 4 === 0 ? 'var(--accent)' : '#3a3f4b'};transform-origin:left center;`);
    b.dataset.w = (0.45 + M.rand(seed, i) * 0.5) * (i % 4 === 0 ? 0.6 : 1);
    body.appendChild(b); return b;
  });
  s.cs.sfx('type', at + 0.15, { dur, gain: 0.35 });
  s.add(body, (t) => {
    bars.forEach((b, i) => {
      const ta = at + 0.15 + (i / lines) * dur;
      const k = M.ease.outCubic(M.clamp((t - ta) / 0.18));
      b.style.width = (b.dataset.w * 100).toFixed(1) + '%';
      b.style.transform = `scaleX(${k.toFixed(3)})`;
    });
  });
  return { el, body };
}

/** Voice waveform that dances while the voice is speaking (driven by word timing) and rests in pauses. */
export function waveform(s, { x, y, w, h, at, out, bars = 36, color = 'var(--accent)', seed = 2, gap = 8 } = {}) {
  const el = div('cs-abs', `left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:flex;align-items:center;gap:${gap}px;`);
  const bw = (w - gap * (bars - 1)) / bars;
  const bs = Array.from({ length: bars }, () => { const b = div('', `width:${bw}px;border-radius:${bw / 2}px;background:${color};height:10px;`); el.appendChild(b); return b; });
  const words = s.cs.words;
  s.add(el, (t) => {
    appear(el, t, at, { out });
    const speaking = words.some(wd => t >= wd.s - 0.03 && t <= wd.e + 0.05);
    const tq = M.onTwos(t, 20);
    bs.forEach((b, i) => {
      const env = Math.sin(Math.PI * (i + 0.5) / bars) ** 0.6;
      const n = 0.5 + 0.5 * M.noise(tq * 9 + i * 1.7, seed);
      const v = speaking ? 0.15 + 0.85 * n * env : 0.06 + 0.04 * env;
      b.style.height = Math.max(bw, v * h).toFixed(1) + 'px';
    });
  });
  return el;
}

/** Word chips that fly in on their spoken word and show their REAL timestamp from the voice track. */
export function timestampChips(s, { words, x, y, size = 40, colGap = 18, rowGap = 20, maxW = 920, out } = {}) {
  const host = div('cs-abs', `left:${x}px;top:${y}px;width:${maxW}px;display:flex;flex-wrap:wrap;gap:${rowGap}px ${colGap}px;`);
  const items = words.map(wd => {
    const c = div('cs-chip', `position:relative;font-size:${size}px;padding:14px 22px;gap:12px;`);
    c.innerHTML = `<span>${wd.w}</span><span style="font:500 ${size * 0.62}px var(--mono);color:var(--accent)">${wd.s.toFixed(2)}s</span>`;
    host.appendChild(c);
    s.cs.sfx('tick', wd.s, { gain: 0.5 });
    return { c, wd };
  });
  s.add(host, (t) => items.forEach(({ c, wd }) => appear(c, t, wd.s - 0.02, { from: 'pop', out })));
  return host;
}

/** Filmstrip of frames sliding past with a frame counter. thumbs: CSS backgrounds for the frames. */
export function filmstrip(s, { y, at, out, h = 300, frames = 14, speed = 1600, colors = ['#FF783E', '#347FC5', '#269681', '#F6F3EE'] } = {}) {
  const cs = s.cs;
  const fw = h * 0.5625 * 1.0;
  const strip = div('cs-abs', `left:0;top:${y}px;height:${h + 60}px;width:${frames * (fw + 24) * 2}px;background:#0d0e12;border-top:4px solid #2a2e37;border-bottom:4px solid #2a2e37;display:flex;align-items:center;gap:24px;padding:0 12px;`);
  for (let i = 0; i < frames * 2; i++) {
    const f = div('', `flex:none;width:${fw}px;height:${h}px;border-radius:10px;background:linear-gradient(160deg, ${colors[i % colors.length]}22, #1d2027 60%);border:2px solid #343844;position:relative;overflow:hidden`);
    const bar = div('', `position:absolute;left:12%;right:${20 + (i * 13) % 40}%;top:${18 + (i * 7) % 30}%;height:12%;border-radius:4px;background:${colors[i % colors.length]};opacity:.8`);
    const bar2 = div('', `position:absolute;left:12%;right:${30 + (i * 11) % 30}%;top:${40 + (i * 5) % 20}%;height:7%;border-radius:4px;background:#F6F3EE;opacity:.35`);
    f.append(bar, bar2); strip.appendChild(f);
  }
  s.add(strip, (t) => {
    const op = appear(strip, t, at, { out, from: 'left', dist: 0 });
    const x = -((t - at) * speed) % (frames * (fw + 24));
    strip.style.translate = `${x.toFixed(1)}px 0`;
    strip.style.filter = `blur(${Math.min(6, speed / 600).toFixed(1)}px)`; // speed blur along the strip
    void op;
  });
  return strip;
}

/** Role card (e.g. DIRECTOR / Zeke). */
export function roleCard(s, { x, y, w = 440, role, name, icon: ic, at, out, accent = 'var(--accent)', from = 'rise', size = 58 } = {}) {
  const el = div('cs-panel', `left:${x}px;top:${y}px;width:${w}px;padding:30px 32px;display:flex;flex-direction:column;gap:16px;border-color:${accent};`);
  const top = div('', 'display:flex;align-items:center;gap:18px;');
  if (ic) top.appendChild(iconEl(ic, 80));
  const r = div('', `font:700 36px var(--pixel);letter-spacing:.1em;color:${accent};`); r.textContent = role;
  top.appendChild(r);
  const n = div('', `font-weight:700;font-size:${size}px;letter-spacing:-0.03em;line-height:1.02`); n.innerHTML = name;
  el.append(top, n);
  s.cs.sfx('pop', at, { gain: 0.35 });
  s.add(el, (t) => appear(el, t, at, { out, from, rot: from === 'rise' ? -4 : 0 }));
  return el;
}

/** Live readout of the presenter's current mouth shape (proof the lips follow the letters). */
export function mouthReadout(s, { x, y, at, out, presenter, size = 40, layer } = {}) {
  const el = div('cs-chip', `left:${x}px;top:${y}px;font-size:${size}px;font-family:var(--mono);font-weight:500;gap:18px;`);
  el.appendChild(iconEl('mouth', size * 1.3));
  const label = document.createElement('span'); label.style.color = 'var(--mute)'; label.textContent = 'mouth:';
  const val = document.createElement('span'); val.style.cssText = 'color:var(--accent);min-width:5.2ch;display:inline-block;font-weight:700';
  el.append(label, val);
  s.add(el, (t) => {
    appear(el, t, at, { out, from: 'pop', origin: '0% 50%' });
    const m = presenter.mouthAt(t);
    val.textContent = (m === 'rest' ? 'smile' : m).toUpperCase();
  }, layer ? { parent: layer } : {});
  return el;
}

export { iconEl };
