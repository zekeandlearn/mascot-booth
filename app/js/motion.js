// Motion primitives. Every function is a pure function of time, so any frame can be rendered on its own
// (seekable, deterministic, parallel-render safe). Times are in seconds.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const inv = (a, b, v) => clamp((v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, inv(a, b, v));

// ---- easings (k in 0..1) ----
export const ease = {
  linear: k => k,
  inQuad: k => k * k,
  outQuad: k => 1 - (1 - k) * (1 - k),
  inOutQuad: k => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  inCubic: k => k ** 3,
  outCubic: k => 1 - (1 - k) ** 3,
  inOutCubic: k => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  outQuart: k => 1 - (1 - k) ** 4,
  inOutQuart: k => (k < 0.5 ? 8 * k ** 4 : 1 - (-2 * k + 2) ** 4 / 2),
  outExpo: k => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)),
  inExpo: k => (k <= 0 ? 0 : 2 ** (10 * k - 10)),
  inOutExpo: k => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 2 ** (20 * k - 10) / 2 : (2 - 2 ** (-20 * k + 10)) / 2),
  outBack: (k, s = 1.4) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2,
  // a hand-tuned "snap": fast attack, long soft settle. The house curve.
  snap: k => (k >= 1 ? 1 : 1 - (1 - k) ** 5),
};

/** Tween v from a to b between t0 and t1. */
export function tween(t, t0, t1, a = 0, b = 1, e = ease.outCubic) {
  if (t <= t0) return a;
  if (t >= t1) return b;
  return lerp(a, b, e((t - t0) / (t1 - t0)));
}

/**
 * Analytic damped spring released at t0, going 0 -> 1. freq = oscillations per second, damp = damping ratio
 * (1 = critically damped, <1 overshoots). Closed form, so it is exact at any t.
 */
export function spring(t, t0 = 0, { freq = 2.2, damp = 0.62 } = {}) {
  const x = t - t0;
  if (x <= 0) return 0;
  const w = 2 * Math.PI * freq;
  if (damp >= 1) return 1 - Math.exp(-w * x) * (1 + w * x);
  const wd = w * Math.sqrt(1 - damp * damp);
  return 1 - Math.exp(-damp * w * x) * (Math.cos(wd * x) + (damp * w / wd) * Math.sin(wd * x));
}
// presets: the house feel. "pop" overshoots a touch, "glide" never overshoots, "bounce" is playful.
export const springs = {
  pop: { freq: 2.4, damp: 0.55 },
  snap: { freq: 3.2, damp: 0.75 },
  glide: { freq: 1.6, damp: 1 },
  bounce: { freq: 2.0, damp: 0.38 },
  soft: { freq: 1.2, damp: 0.85 },
};

/** Keyframes: [[time, value, easeIntoThisKey?], ...] sorted by time. Values may be numbers or arrays. */
export function keys(t, list) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t1, v1, e = ease.inOutCubic] = list[i];
    const [t0, v0] = list[i - 1];
    if (t <= t1) {
      const k = e((t - t0) / (t1 - t0 || 1));
      return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return list[list.length - 1][1];
}

/** Envelope: 0 before t0, rises over `in`, holds, falls over `out` ending at t1. */
export function envelope(t, t0, t1, fin = 0.3, fout = 0.3, e = ease.outCubic) {
  if (t <= t0 || t >= t1) return 0;
  const a = fin > 0 ? e(clamp((t - t0) / fin)) : 1;
  const b = fout > 0 ? e(clamp((t1 - t) / fout)) : 1;
  return Math.min(a, b);
}

// ---- deterministic randomness ----
export function hash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const rand = (seed, i = 0) => hash(seed * 7919 + i * 104729);
/** Smooth 1-D value noise in -1..1. */
export function noise(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = rand(seed, i) * 2 - 1, b = rand(seed, i + 1) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return lerp(a, b, u);
}
/** Fractal noise, nicer camera drift. */
export const fbm = (x, seed = 0) => noise(x, seed) * 0.6 + noise(x * 2.1, seed + 11) * 0.3 + noise(x * 4.3, seed + 23) * 0.1;

/** Stagger helper: start time of item i. */
export const stagger = (t0, i, gap = 0.06) => t0 + i * gap;

/** Quantize a value to steps (stepped, on-twos animation for the pixel look). */
export const step = (v, n) => Math.round(v * n) / n;
/** Hold time on "twos": the animation updates 12 times a second. */
export const onTwos = (t, fps = 12) => Math.floor(t * fps) / fps;
