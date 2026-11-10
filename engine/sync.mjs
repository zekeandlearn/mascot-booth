// Sync proof: listen to the FINISHED video and check the voice is still where the film was timed.
// The film's visuals are keyed to words.json. This re-times every word in the render's own audio (same letter
// aligner as `listen`) and compares the two. If the mix, trims or encoding shifted the voice, it shows up here
// as a steady offset, before anyone sees the video.
import { decode, timeText } from './listen.mjs';
import { toAlignment } from '../app/js/align.js';
import { wordsFromAlignment } from './voice.mjs';

const norm = w => w.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * q))]; };

/** Time every word of words.json in an audio or video file, with the letter aligner. */
async function heardWords(file, text) {
  const { letters, score } = await timeText(decode(file), text);
  return { words: wordsFromAlignment(toAlignment(letters)), score };
}

/**
 * media: the rendered video. words: words.json. vo: the voice file the film was built on (film.audio.vo), measured
 * with the same aligner so only real shifts count (the aligner's own small bias cancels out). offset: seconds the
 * voice starts into the film. Returns { n, matched, median, p90, score, inSync, worst: [{ w, planned, heard, off }] }.
 * median: the typical shift (render - plan, + = voice late). inSync: |median| <= 0.03 s and p90 <= 0.08 s
 * (without vo: 0.04 s and 0.15 s against words.json).
 */
export async function syncCheck({ media, words, vo = null, offset = 0 }) {
  const text = words.map(w => w.w).join(' ');
  const out = await heardWords(media, text);
  const ref = vo ? (await heardWords(vo, text)).words : words;
  // pair the words in order (same text both sides; LCS keeps it safe if tokenising differs)
  const A = ref.map(w => norm(w.w)), B = out.words.map(w => norm(w.w)), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (A[i] === B[j]) { pairs.push({ w: ref[i].w, planned: ref[i].s + offset, heard: out.words[j].s }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const d = pairs.map(p => p.heard - p.planned), ad = d.map(Math.abs);
  const median = +pct(d, 0.5).toFixed(3), p90 = +pct(ad, 0.9).toFixed(3);
  const [mLim, pLim] = vo ? [0.03, 0.08] : [0.04, 0.15];
  const worst = pairs.map((p, k) => ({ ...p, off: d[k] })).sort((x, y) => Math.abs(y.off) - Math.abs(x.off)).slice(0, 3);
  return { n, matched: pairs.length, median, p90, score: out.score, inSync: Math.abs(median) <= mLim && p90 <= pLim && out.score > -3, worst };
}

/** One readable line (plus detail when it fails). */
export function report(r) {
  const ms = v => `${v >= 0 ? '+' : ''}${Math.round(v * 1000)} ms`;
  const head = `sync proof: ${r.matched}/${r.n} words found, typical shift ${ms(r.median)}, 90% of words within ${Math.round(r.p90 * 1000)} ms`;
  if (r.inSync) return `IN SYNC  ${head}`;
  const why = r.score <= -3 ? 'the voice in the render does not match words.json (wrong take, or the voice is buried under music/sfx)'
    : Math.abs(r.median) > 0.04 ? `the whole voice is ${r.median > 0 ? 'late' : 'early'} by about ${Math.round(Math.abs(r.median) * 1000)} ms: visuals will land ${r.median > 0 ? 'before' : 'after'} their words`
    : 'some words drifted';
  return `OFF      ${head}\n         ${why}\n         furthest: ${r.worst.map(x => `"${x.w}" planned ${x.planned.toFixed(2)}s, heard ${x.heard.toFixed(2)}s`).join('; ')}`;
}
