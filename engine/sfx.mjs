// Procedural sound design. Every cue a film declares (cs.sfx) is synthesized here, sample-accurate to its frame.
// No samples, no licences: whooshes, pops, key ticks, impacts, risers and 8-bit blips are made from math.
import fs from 'node:fs';

export const SR = 48000;

// deterministic noise
let seedState = 1;
const rnd = () => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };
const noise = () => rnd() * 2 - 1;

// RBJ biquad, coefficients updated in blocks for sweeps
function biquad(type) {
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    set(freq, q = 0.8) {
      const w = 2 * Math.PI * Math.min(freq, SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
      let n0, n1, n2; const d0 = 1 + al, d1 = -2 * c, d2 = 1 - al;
      if (type === 'bp') { n0 = al; n1 = 0; n2 = -al; }
      else if (type === 'lp') { n0 = (1 - c) / 2; n1 = 1 - c; n2 = (1 - c) / 2; }
      else { n0 = (1 + c) / 2; n1 = -(1 + c); n2 = (1 + c) / 2; }
      b0 = n0 / d0; b1 = n1 / d0; b2 = n2 / d0; a1 = d1 / d0; a2 = d2 / d0;
    },
    run(x) { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; },
  };
}

const sq = ph => (Math.sin(ph) >= 0 ? 1 : -1);

// each generator returns [left Float32Array, right Float32Array]
const GEN = {
  whoosh({ dur = 0.45, pan = 0.6 }) {
    const n = Math.round(dur * SR), L = new Float32Array(n), R = new Float32Array(n), f = biquad('bp');
    for (let i = 0; i < n; i++) {
      const k = i / n;
      if (i % 32 === 0) f.set(300 + 2600 * Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 2, 1.1);
      const env = Math.sin(Math.PI * k) ** 2 * (k < 0.6 ? k / 0.6 : 1);
      const v = f.run(noise()) * env * 1.6;
      const p = -pan + 2 * pan * k; L[i] = v * (1 - Math.max(0, p)); R[i] = v * (1 + Math.min(0, p));
    }
    return [L, R];
  },
  pop({ pitch = 1 }) {
    const n = Math.round(0.11 * SR), L = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, fr = (300 + 900 * Math.exp(-t * 60)) * pitch;
      ph += 2 * Math.PI * fr / SR;
      L[i] = Math.sin(ph) * Math.exp(-t * 32) * 0.8 + (i < 60 ? noise() * 0.25 * (1 - i / 60) : 0);
    }
    return [L, L];
  },
  tick({ pitch = 1 }) {
    const n = Math.round(0.03 * SR), L = new Float32Array(n), f = biquad('bp'); f.set(3200 * pitch, 1.4);
    for (let i = 0; i < n; i++) L[i] = f.run(noise()) * Math.exp(-i / SR * 260) * 2.2;
    return [L, L];
  },
  type({ dur = 0.6 }) {
    const n = Math.round((dur + 0.05) * SR), L = new Float32Array(n), R = new Float32Array(n);
    let t = 0;
    while (t < dur) {
      const [a] = GEN.tick({ pitch: 0.75 + rnd() * 0.6 });
      const g = 0.45 + rnd() * 0.55, at = Math.round(t * SR), pan = (rnd() - 0.5) * 0.5;
      for (let i = 0; i < a.length && at + i < n; i++) { L[at + i] += a[i] * g * (1 - pan); R[at + i] += a[i] * g * (1 + pan); }
      t += 0.045 + rnd() * 0.05;
    }
    return [L, R];
  },
  impact({ dur = 0.7 }) {
    const n = Math.round(dur * SR), L = new Float32Array(n), lp = biquad('lp'); lp.set(900, 0.7);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR; ph += 2 * Math.PI * (42 + 70 * Math.exp(-t * 18)) / SR;
      const body = Math.sin(ph) * Math.exp(-t * 6);
      const crack = lp.run(noise()) * Math.exp(-t * 28) * 0.9;
      L[i] = Math.tanh((body * 1.2 + crack) * 1.4) * 0.9;
    }
    return [L, L];
  },
  riser({ dur = 1 }) {
    const n = Math.round(dur * SR), L = new Float32Array(n), R = new Float32Array(n), f = biquad('bp');
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n; if (i % 32 === 0) f.set(400 + 5200 * k * k, 2);
      ph += 2 * Math.PI * (180 + 700 * k * k) / SR;
      const env = k ** 1.6 * (k > 0.97 ? (1 - k) / 0.03 : 1);
      const v = (f.run(noise()) * 1.4 + Math.sin(ph) * 0.18) * env;
      L[i] = v; R[i] = f.run(noise()) * 1.4 * env * 0.7 + Math.sin(ph) * 0.18 * env;
    }
    return [L, R];
  },
  coin() {
    const n = Math.round(0.42 * SR), L = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR, fr = t < 0.07 ? 988 : 1319; ph += 2 * Math.PI * fr / SR; L[i] = sq(ph) * 0.22 * (t < 0.07 ? 1 : Math.exp(-(t - 0.07) * 9)); }
    return [L, L];
  },
  blip({ pitch = 1 }) {
    const n = Math.round(0.09 * SR), L = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += 2 * Math.PI * (660 + 4000 * t) * pitch / SR; L[i] = sq(ph) * 0.2 * Math.exp(-t * 22); }
    return [L, L];
  },
  shimmer({ dur = 1.0 }) {
    const n = Math.round(dur * SR), L = new Float32Array(n), R = new Float32Array(n);
    const fs = Array.from({ length: 7 }, () => 2200 + rnd() * 4200), ps = fs.map(() => rnd() * 6);
    for (let i = 0; i < n; i++) {
      const t = i / SR; let l = 0, r = 0;
      fs.forEach((f, j) => { const v = Math.sin(2 * Math.PI * f * t + ps[j]) * Math.exp(-t * (3 + j)) * (0.5 + 0.5 * Math.sin(t * 40 + j)); if (j % 2) l += v; else r += v; });
      L[i] = l * 0.12; R[i] = r * 0.12;
    }
    return [L, R];
  },
  glitch({ dur = 0.2 }) {
    const n = Math.round(dur * SR), L = new Float32Array(n), R = new Float32Array(n);
    let hold = 0, v = 0, ph = 0;
    for (let i = 0; i < n; i++) {
      if (hold-- <= 0) { hold = 20 + Math.floor(rnd() * 300); v = noise(); }
      ph += 2 * Math.PI * (120 + 900 * rnd()) / SR;
      const chop = Math.floor(i / 900) % 2 ? 1 : 0.2;
      const env = Math.exp(-i / n * 2.5);
      L[i] = (Math.round(v * 4) / 4 * 0.5 + sq(ph) * 0.1) * chop * env; R[i] = L[i] * (i % 1200 < 600 ? 1 : 0.4);
    }
    return [L, R];
  },
};

/** Render all cues into one stereo bed of `duration` seconds. cues: [{ type, t, gain, ...opts }] */
export function renderCues(cues, duration, { master = 0.5 } = {}) {
  const n = Math.ceil((duration + 1) * SR), L = new Float32Array(n), R = new Float32Array(n);
  cues.forEach((c, idx) => {
    const g = GEN[c.type];
    if (!g) throw new Error('unknown sound: ' + c.type);
    seedState = 1000 + idx * 7919 + Math.round(c.t * 1000);
    const [a, b] = g(c);
    const at = Math.round(Math.max(0, c.t) * SR), gain = (c.gain ?? 0.6) * master;
    for (let i = 0; i < a.length && at + i < n; i++) { L[at + i] += a[i] * gain; R[at + i] += b[i] * gain; }
  });
  return [L, R];
}

export function writeWav(file, [L, R], sr = SR) {
  const n = L.length, buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(L[i], 44 + i * 8); buf.writeFloatLE(R[i], 48 + i * 8); }
  fs.writeFileSync(file, buf);
}
