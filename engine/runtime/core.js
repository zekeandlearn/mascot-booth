// Mascot Booth core: layers, scenes, camera, cue lookup, sound cues and the seek loop.
// A film is a function (cs, lib) => void that adds elements. Every element is updated from the clock alone.
import * as M from './motion.js';

const norm = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9&%$#+]/g, '');

export class Film {
  constructor(root, film, data = {}) {
    this.root = root;
    this.film = film;
    this.W = film.width; this.H = film.height; this.fps = film.fps || 60;
    this.words = (data.words || []).map((w, i) => ({ ...w, i, n: norm(w.w) }));
    this.data = data;
    this.els = [];
    this.sfxList = [];
    this.shakes = [];
    this.duration = film.duration || 10;
    this.portrait = this.H > this.W;
    root.style.width = this.W + 'px';
    root.style.height = this.H + 'px';
    root.classList.add('cs-root', this.portrait ? 'is-portrait' : 'is-landscape');
    const layer = (cls) => { const d = document.createElement('div'); d.className = 'cs-layer ' + cls; root.appendChild(d); return d; };
    this.bg = layer('cs-bg');
    this.world = layer('cs-world');
    this.stageLayer = layer('cs-stage');
    this.front = layer('cs-front');
    this.hud = layer('cs-hud');
    this.fx = layer('cs-fx');
    this.seed = film.seed ?? 7;
  }

  // ---------- cues ----------
  /** Start time of a spoken phrase. at('made this'), at('made', { after: 3 }), at('the', { n: 2 }). Throws if missing. */
  at(phrase, { after = -1, n = 1, end = false } = {}) {
    const parts = phrase.split(/\s+/).map(norm).filter(Boolean);
    let hit = 0;
    for (let i = 0; i + parts.length <= this.words.length; i++) {
      if (this.words[i].s < after) continue;
      if (parts.every((p, j) => this.words[i + j].n === p)) {
        if (++hit === n) return end ? this.words[i + parts.length - 1].e : this.words[i].s;
      }
    }
    throw new Error(`cue not found in the voice track: "${phrase}"` + (after >= 0 ? ` after ${after}s` : ''));
  }
  end(phrase, o = {}) { return this.at(phrase, { ...o, end: true }); }
  /** Words spoken between two times (for captions and karaoke). */
  wordsIn(t0, t1) { return this.words.filter(w => w.s >= t0 - 1e-3 && w.s < t1); }

  // ---------- elements ----------
  /** Add an element. update(t) runs only while from <= t < to; outside it the node is hidden. */
  add(node, update = null, { from = -Infinity, to = Infinity, parent = this.world } = {}) {
    if (node && !node.parentNode) parent.appendChild(node);
    const el = { node, update, from, to, shown: true };
    this.els.push(el);
    return el;
  }
  /** Sound cue, synthesized at render time. type: whoosh | pop | tick | impact | riser | coin | blip | shimmer | glitch | type */
  sfx(type, t, opts = {}) { this.sfxList.push({ type, t: +t.toFixed(4), ...opts }); }
  /** Global camera shake (whole world + background). */
  shake(t, { amp = 14, dur = 0.35, freq = 26 } = {}) { this.shakes.push({ t, amp, dur, freq }); }

  /**
   * A scene: a full-frame group shown from..to with an entrance and exit.
   * opts.in / opts.out: 'cut' | 'rise' | 'zoom' | 'whip' | 'drop' | 'blur'
   * build(s) gets { node, from, to, add(node, update), push(t0, t1, s0, s1) }
   */
  scene(opts, build) {
    const { from, to, in: tin = 'rise', out: tout = 'blur', inDur = 0.45, outDur = 0.35, drift = true } = opts;
    const node = document.createElement('div');
    node.className = 'cs-scene ' + (opts.className || '');
    const inner = document.createElement('div');
    inner.className = 'cs-scene-inner';
    node.appendChild(inner);
    const pushes = [];
    const s = {
      node: inner, from, to, cs: this,
      add: (n, u, o = {}) => this.add(n, u, { from, to, ...o, parent: o.parent || inner }),
      /** Camera push inside the scene: scale s0 -> s1 between t0 and t1, around origin (0..1). */
      push: (t0, t1, s0 = 1, s1 = 1.08, origin = [0.5, 0.5], e = M.ease.inOutCubic) => pushes.push({ t0, t1, s0, s1, origin, e }),
    };
    const seed = Math.round(from * 100);
    this.add(node, (t) => {
      // entrance / exit
      const ki = inDur > 0 ? M.clamp((t - from) / inDur) : 1;
      const ko = outDur > 0 ? M.clamp((to - t) / outDur) : 1;
      let tx = 0, ty = 0, sc = 1, op = 1, blur = 0, rot = 0;
      const ei = M.ease.outExpo(ki), eo = M.ease.inCubic(1 - ko);
      const apply = (kind, k, dir) => { // k: 0 = fully off, 1 = fully on
        const o = 1 - k;
        switch (kind) {
          case 'rise': ty += o * 140 * dir; op *= k; blur += o * 18; break;
          case 'drop': ty -= o * 160 * dir; op *= k; break;
          case 'zoom': sc *= 1 + o * 0.35 * dir; op *= k; blur += o * 12; break;
          case 'whip': tx += o * this.W * 0.9 * dir; blur += o * 40; break;
          case 'blur': op *= k; blur += o * 24; sc *= 1 + o * 0.06; break;
          case 'cut': break;
        }
      };
      apply(tin, ei, 1);
      if (t > to - outDur) apply(tout, 1 - eo, tout === 'whip' ? -1 : -1);
      // camera pushes inside the scene + a slow drift
      let ps = 1, ox = 0.5, oy = 0.5;
      // pushes run in sequence: before the first one the scene sits at its s0, after that the latest one started wins
      if (pushes.length) { ps = pushes[0].s0; ox = pushes[0].origin[0]; oy = pushes[0].origin[1]; }
      for (const p of pushes) if (t >= p.t0) { ps = M.tween(t, p.t0, p.t1, p.s0, p.s1, p.e); ox = p.origin[0]; oy = p.origin[1]; }
      if (drift) { tx += M.fbm(t * 0.25, seed) * 10; ty += M.fbm(t * 0.21, seed + 5) * 10; rot += M.fbm(t * 0.17, seed + 9) * 0.35; }
      node.style.transform = `translate3d(${tx.toFixed(2)}px,${ty.toFixed(2)}px,0) scale(${sc.toFixed(4)}) rotate(${rot.toFixed(3)}deg)`;
      node.style.opacity = op.toFixed(3);
      node.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : '';
      inner.style.transformOrigin = `${ox * 100}% ${oy * 100}%`;
      inner.style.transform = ps !== 1 ? `scale(${ps.toFixed(4)})` : '';
    }, { from, to, parent: this.world });
    build(s);
    return s;
  }

  // ---------- the clock ----------
  seek(t) {
    this.t = t;
    // shake applies to world + bg
    let sx = 0, sy = 0;
    for (const s of this.shakes) {
      if (t < s.t || t > s.t + s.dur) continue;
      const k = 1 - (t - s.t) / s.dur;
      sx += M.noise((t - s.t) * s.freq, 3) * s.amp * k * k;
      sy += M.noise((t - s.t) * s.freq, 8) * s.amp * k * k;
    }
    const sh = `translate3d(${sx.toFixed(2)}px,${sy.toFixed(2)}px,0)`;
    this.world.style.transform = sh;
    this.bg.style.transform = `translate3d(${(sx * 0.4).toFixed(2)}px,${(sy * 0.4).toFixed(2)}px,0)`;
    for (const el of this.els) {
      const on = t >= el.from && t < el.to;
      if (on !== el.shown && el.node) { el.node.classList.toggle('cs-off', !on); el.shown = on; }
      if (on && el.update) el.update(t);
    }
  }
}

/** Load a film folder served at base (film.json, film.js, words.json, mouth.json) and build it. */
export async function boot(base, root, lib) {
  const j = async (f, fallback) => { const r = await fetch(base + f); return r.ok ? r.json() : fallback; };
  const film = await j('film.json');
  const data = { words: await j('words.json', []), mouth: await j('mouth.json', null) };
  // brand tokens -> CSS variables
  for (const [k, v] of Object.entries(film.brand?.colors || {})) document.documentElement.style.setProperty('--' + k, v);
  if (film.brand?.font) document.documentElement.style.setProperty('--font', film.brand.font);
  const cs = new Film(root, film, data);
  const mod = await import(base + (film.entry || 'film.js') + '?v=' + Date.now());
  await mod.default(cs, lib);
  await Promise.all(window.__csPending || []);
  await document.fonts.ready;
  cs.seek(0);
  return cs;
}
