// Your own recording -> a time for every letter, so the lip sync works as sharply as with an ElevenLabs take.
// How (the same method WhisperX uses): a small speech model (wav2vec2) scores every letter every 20 ms, and the
// best path through those scores places each letter of the words that were said. The words come from your script,
// or from speech-to-text (Whisper) when there is no script.
// Pure JavaScript, no imports: the web app and the Node engine (engine/listen.mjs) both use this one file.
// Measured on an 85 s Taglish ElevenLabs take against its own letter times: word starts land 27 ms off at the
// median (90th percentile 0.10 s); Whisper's own word times were 0.10 s off at the median.

/** Models and settings shared by the app and the engine. */
export const MODELS = {
  aligner: { id: 'Xenova/wav2vec2-base-960h', dtype: 'q8', mb: 95 },
  whisper: { id: 'onnx-community/whisper-base', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, mb: 136 },
};
export const WHISPER_OPTIONS = { chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' };
export const SAMPLE_RATE = 16000;
/** The aligner fires about one frame (20 ms) after the sound starts. */
const LEAD = 0.02;

/** The spoken words of a script: audio tags like [excited] are dropped. Returns one string, words joined by spaces. */
export function spokenText(script) {
  return script.replace(/\[[^\]]*\]/g, ' ').split(/[\s…—]+/)
    .map(w => w.replace(/^[^\p{L}\p{N}'’]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(w => /[\p{L}\p{N}]/u.test(w)).join(' ');
}

/** The aligner's letters: index of each in its output. Index 0 is "no new letter". */
const VOCAB = { "'": 27, A: 7, B: 24, C: 19, D: 14, E: 5, F: 20, G: 21, H: 11, I: 10, J: 29, K: 26, L: 15, M: 17, N: 9, O: 8, P: 23, Q: 30, R: 13, S: 12, T: 6, U: 16, V: 25, W: 18, X: 28, Y: 22, Z: 31 };
const BLANK = 0, SPACE = 4;
const idOf = c => VOCAB[c === '’' ? "'" : c.normalize('NFKD')[0].toUpperCase()];

/** Log-softmax each frame of raw model output (flat frames x V), in place. */
export function logSoftmax(logits, V) {
  for (let o = 0; o < logits.length; o += V) {
    let mx = -Infinity; for (let k = 0; k < V; k++) mx = Math.max(mx, logits[o + k]);
    let s = 0; for (let k = 0; k < V; k++) s += Math.exp(logits[o + k] - mx);
    const z = mx + Math.log(s); for (let k = 0; k < V; k++) logits[o + k] -= z;
  }
  return logits;
}

/**
 * logp: log-probabilities, flat Float32Array of frames x V. frame: seconds per frame (0.02). text: the words said.
 * Returns { letters: [{ c, s, e }] for every character of the text (spaces included), score } where score is the
 * average log-probability per letter: near 0 is a confident match, below about -3 means the text and the
 * recording do not agree (wrong script, or lots of ad-libs).
 */
export function alignLetters(logp, V, frame, text) {
  const chars = [...text.replace(/\s+/g, ' ').trim()];
  const tok = [], at = [];
  chars.forEach((c, i) => {
    if (c === ' ') { if (tok.length && tok[tok.length - 1] !== SPACE) { tok.push(SPACE); at.push(i); } return; }
    const id = idOf(c);
    if (id != null) { tok.push(id); at.push(i); }
  });
  const T = Math.floor(logp.length / V), N = tok.length, W = N + 1;
  if (!N || !T) return { letters: [], score: -Infinity };
  if (N > T) throw new Error('The recording is too short for that much text.');
  // tr[t][j]: best score with the first j letters said after t frames. Each frame either says nothing new
  // (blank), keeps saying the current letter, or starts the next letter.
  const tr = new Float32Array((T + 1) * W).fill(-Infinity);
  tr[0] = 0;
  const step = (t, j) => {
    const row = t * V, cur = tr[t * W + j];
    if (cur === -Infinity) return;
    const next = (t + 1) * W;
    const keep = cur + Math.max(logp[row + BLANK], j > 0 ? logp[row + tok[j - 1]] : -Infinity);
    if (keep > tr[next + j]) tr[next + j] = keep;
    if (j < N) { const go = cur + logp[row + tok[j]]; if (go > tr[next + j + 1]) tr[next + j + 1] = go; }
  };
  for (let t = 0; t < T; t++) for (let j = Math.max(0, N - (T - t)); j <= Math.min(N, t); j++) step(t, j);
  // walk back: the frame each letter starts on, and the last frame it is heard on
  const first = new Int32Array(N).fill(-1), last = new Int32Array(N).fill(-1);
  for (let t = T, j = N; t > 0 && j > 0; t--) {
    const row = (t - 1) * V, here = tr[t * W + j];
    const go = tr[(t - 1) * W + j - 1] + logp[row + tok[j - 1]];
    const said = tr[(t - 1) * W + j] + logp[row + tok[j - 1]];
    if (Math.abs(here - go) < 1e-4) { first[j - 1] = t - 1; if (last[j - 1] < 0) last[j - 1] = t - 1; j--; }
    else if (Math.abs(here - said) < 1e-4) { if (last[j - 1] < 0) last[j - 1] = t - 1; }
  }
  const score = tr[T * W + N] / N;
  const s = new Array(chars.length).fill(null), e = new Array(chars.length).fill(null);
  for (let k = 0; k < N; k++) if (tok[k] !== SPACE && first[k] >= 0) { s[at[k]] = Math.max(0, first[k] * frame - LEAD); e[at[k]] = Math.max(0, (last[k] + 1) * frame - LEAD); }
  // characters the aligner has no letter for (digits, symbols) share the time between their neighbours
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === ' ' || s[i] != null) continue;
    let a = i - 1; while (a >= 0 && e[a] == null) a--;
    let b = i + 1; while (b < chars.length && s[b] == null) b++;
    const t0 = a >= 0 ? e[a] : 0, t1 = b < chars.length ? s[b] : t0 + 0.1;
    s[i] = t0; e[i] = Math.max(t0, t1);
  }
  // the aligner marks where a letter starts; inside a word the sound lasts until the next letter starts
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === ' ') continue;
    const n = i + 1 < chars.length && chars[i + 1] !== ' ' ? s[i + 1] : null;
    e[i] = n != null ? Math.max(e[i], Math.min(n, s[i] + 0.25)) : Math.max(e[i], s[i] + 0.06);
  }
  const letters = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== ' ') { letters.push({ c: chars[i], s: +s[i].toFixed(3), e: +e[i].toFixed(3) }); continue; }
    const ps = letters.length ? letters[letters.length - 1].e : 0, nx = s.slice(i + 1).find(v => v != null) ?? ps;
    letters.push({ c: ' ', s: ps, e: +Math.max(ps, nx).toFixed(3) });
  }
  return { letters, score: +score.toFixed(2) };
}

/** Letters -> the same character alignment ElevenLabs returns, so words.json and mouth.json come out unchanged. */
export function toAlignment(letters) {
  return {
    characters: letters.map(l => l.c),
    character_start_times_seconds: letters.map(l => l.s),
    character_end_times_seconds: letters.map(l => l.e),
  };
}

/** Run the aligner model over mono 16 kHz samples in 20 s windows. model/processor: transformers.js objects. */
export async function letterScores(samples, processor, model, onProgress = () => {}) {
  const win = SAMPLE_RATE * 20, parts = [];
  let V = 0;
  for (let o = 0; o < samples.length; o += win) {
    const seg = samples.subarray(o, Math.min(samples.length, o + win));
    if (seg.length < 800) break;
    const { logits } = await model(await processor(seg));
    V = logits.dims[2];
    parts.push(Float32Array.from(logits.data));
    onProgress(Math.min(1, (o + win) / samples.length));
  }
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0; for (const p of parts) { all.set(p, off); off += p.length; }
  return { logp: logSoftmax(all, V), V, frame: samples.length / SAMPLE_RATE / (all.length / V) };
}
