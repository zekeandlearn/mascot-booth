// Voice in, mouth shapes out. Uploaded or recorded audio: shapes from loudness + brightness (works in any language).
// ElevenLabs: shapes from the exact time of every letter (sharper), using the same rules as the Mascot Booth engine.

let actx;
const ctx = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());

export async function decode(blob) {
  const buf = await blob.arrayBuffer();
  return await ctx().decodeAudioData(buf);
}

/** Per-frame loudness (0..1, normalized) and brightness (zero-crossing rate) at `fps`. */
export function analyze(audio, fps = 30) {
  const sr = audio.sampleRate, n = Math.ceil(audio.duration * fps), hop = sr / fps;
  const ch = [...Array(audio.numberOfChannels)].map((_, i) => audio.getChannelData(i));
  const rms = new Float32Array(n), zcr = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const a = Math.floor(f * hop), b = Math.min(ch[0].length, Math.floor((f + 1) * hop));
    let s = 0, z = 0, prev = 0;
    for (let i = a; i < b; i++) {
      let v = 0; for (const c of ch) v += c[i]; v /= ch.length;
      s += v * v; if ((v >= 0) !== (prev >= 0)) z++; prev = v;
    }
    rms[f] = Math.sqrt(s / Math.max(1, b - a)); zcr[f] = z / Math.max(1, b - a);
  }
  const sorted = [...rms].sort((x, y) => x - y);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1, floor = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const norm = rms.map(v => Math.max(0, Math.min(1, (v - floor) / (p95 - floor || 1))));
  return { fps, n, level: norm, zcr };
}

/** Speaking or not, per frame, with small gaps bridged. */
export function speech(an, { thr = 0.12, bridge = 0.18 } = {}) {
  const on = Array.from(an.level, v => v > thr);
  const gap = Math.round(bridge * an.fps);
  for (let i = 0; i < on.length; i++) if (!on[i]) { let j = i; while (j < on.length && !on[j]) j++; if (i > 0 && j < on.length && j - i <= gap) for (let k = i; k < j; k++) on[k] = true; i = j; }
  const segs = []; let s = -1;
  on.forEach((v, i) => { if (v && s < 0) s = i; if (!v && s >= 0) { segs.push([s / an.fps, i / an.fps]); s = -1; } });
  if (s >= 0) segs.push([s / an.fps, on.length / an.fps]);
  return segs;
}

/** Mouth track from loudness: louder = wider open; bright (hissy) sounds read as wide, dark ones as round. */
export function mouthFromLevel(an, segs, { rest = 0.35 } = {}) {
  const track = [];
  const step = 2; // on twos: 15 shapes a second reads as cartoon, not jitter
  const inSeg = t => segs.some(([a, b]) => t >= a - 0.02 && t <= b + 0.02);
  const zs = [...an.zcr].sort((a, b) => a - b), zHi = zs[Math.floor(zs.length * 0.8)] || 0.2, zLo = zs[Math.floor(zs.length * 0.35)] || 0.05;
  for (let f = 0; f < an.n; f += step) {
    const t = f / an.fps, v = an.level[f], z = an.zcr[f];
    let shape;
    if (!inSeg(t)) {
      const prevEnd = Math.max(-1, ...segs.filter(s => s[1] <= t).map(s => s[1]));
      const next = segs.find(s => s[0] > t);
      const gap = (next ? next[0] : Infinity) - prevEnd;
      shape = gap > rest && t - prevEnd > 0.08 ? 'rest' : 'closed';
    } else if (v < 0.14) shape = 'closed';
    else if (v < 0.3) shape = z > zHi ? 'fv' : 'small';
    else if (v < 0.55) shape = z > zHi ? 'wide' : z < zLo ? 'round' : 'mid';
    else shape = z > zHi ? 'wide' : z < zLo ? 'round' : 'open';
    track.push([+t.toFixed(4), shape]);
  }
  const out = [];
  for (const k of track) if (!out.length || out[out.length - 1][1] !== k[1]) out.push(k);
  return out;
}

// ---------------- letter-timed lip sync (ElevenLabs) ----------------
const SHAPE = { a: 'open', e: 'wide', i: 'wide', y: 'wide', o: 'round', u: 'round', w: 'round', m: 'closed', b: 'closed', p: 'closed', f: 'fv', v: 'fv', l: 'mid', r: 'mid', h: 'mid', j: 'mid' };
const PRIORITY = { closed: 5, open: 4, wide: 4, round: 4, fv: 3, mid: 2, small: 1 };
const shapeOf = (c, next = '') => { c = c.toLowerCase(); if (c === 'o' && next === 'o') return 'round'; if (/[a-zà-ÿ]/.test(c)) return SHAPE[c.normalize('NFKD')[0]] || 'small'; if (/[0-9]/.test(c)) return 'mid'; return null; };

export function lettersFromAlignment(al) {
  const out = []; let depth = 0;
  al.characters.forEach((c, i) => {
    if (c === '[') return void depth++;
    if (c === ']') return void (depth = Math.max(0, depth - 1));
    if (depth) return;
    out.push({ c, s: al.character_start_times_seconds[i], e: al.character_end_times_seconds[i] });
  });
  return out;
}

export function mouthFromLetters(letters, { fps = 30, restGap = 0.35 } = {}) {
  const segs = [];
  letters.forEach((l, i) => { const sh = shapeOf(l.c, letters[i + 1]?.c || ''); if (sh && l.e > l.s) segs.push({ s: l.s, e: l.e, sh }); });
  if (!segs.length) return [[0, 'rest']];
  const end = segs[segs.length - 1].e + 0.5, track = []; let j = 0;
  for (let f = 0; f / fps < end; f++) {
    const a = f / fps, b = a + 1 / fps;
    while (j < segs.length && segs[j].e < a - 0.2) j++;
    let best = null, score0 = 0;
    for (let k = j; k < segs.length && segs[k].s < b; k++) {
      const ov = Math.min(b, segs[k].e) - Math.max(a, segs[k].s); if (ov <= 0) continue;
      const sc = ov * PRIORITY[segs[k].sh] * (segs[k].sh === 'closed' && ov < 0.35 / fps ? 0.3 : 1);
      if (sc > score0) { score0 = sc; best = segs[k].sh; }
    }
    if (!best) { const prev = segs.filter(s => s.e <= a).pop(), next = segs.find(s => s.s >= b); const gap = (next ? next.s : Infinity) - (prev ? prev.e : -Infinity); best = gap > restGap && a - (prev ? prev.e : -1) > 0.06 ? 'rest' : 'closed'; }
    track.push([+a.toFixed(4), best]);
  }
  const out = []; for (const k of track) if (!out.length || out[out.length - 1][1] !== k[1]) out.push(k);
  return out;
}

export function segsFromLetters(letters, bridge = 0.25) {
  const segs = [];
  for (const l of letters) {
    if (!/[\p{L}\p{N}]/u.test(l.c)) continue;
    const last = segs[segs.length - 1];
    if (last && l.s - last[1] <= bridge) last[1] = l.e; else segs.push([l.s, l.e]);
  }
  return segs;
}

export async function elevenVoices(key) {
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(r.status === 401 ? 'That API key did not work.' : `ElevenLabs error ${r.status}`);
  return (await r.json()).voices.map(v => ({ id: v.voice_id, name: v.name }));
}

export async function elevenSpeak(key, voiceId, text, { model = 'eleven_v3', stability = 0.5 } = {}) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability, similarity_boost: 0.75 } }),
  });
  if (!r.ok) throw new Error(`ElevenLabs error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const bytes = Uint8Array.from(atob(j.audio_base64), c => c.charCodeAt(0));
  return { blob: new Blob([bytes], { type: 'audio/mpeg' }), alignment: j.alignment || j.normalized_alignment };
}

// ---------------- sharper lip sync: time every letter of your own recording ----------------
/** Any decoded audio -> mono 16 kHz samples, the rate the speech models expect. */
export async function toMono16k(audio) {
  const sr = 16000, oc = new OfflineAudioContext(1, Math.ceil(audio.duration * sr), sr);
  const src = oc.createBufferSource(); src.buffer = audio; src.connect(oc.destination); src.start();
  return (await oc.startRendering()).getChannelData(0);
}

let worker = null;
/**
 * Letter timings for a recording, computed in a worker (js/listen-worker.js). text: what was said (optional).
 * onUpdate({ type: 'stage'|'progress', stage, done }). Resolves { letters, score, text, heard }.
 */
export async function sharpen(audio, text, lang, onUpdate = () => {}) {
  const samples = await toMono16k(audio);
  worker ||= new Worker(new URL('./listen-worker.js', import.meta.url), { type: 'module' });
  return new Promise((ok, fail) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'done') ok(data);
      else if (data.type === 'error') fail(new Error(data.message));
      else onUpdate(data);
    };
    worker.onerror = e => fail(new Error(e.message || 'The speech model could not start.'));
    worker.postMessage({ samples, text, lang }, [samples.buffer]);
  });
}

// ---------------- microphone ----------------
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.start();
  return { stop: () => new Promise(ok => { rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); ok(new Blob(chunks, { type: rec.mimeType })); }; rec.stop(); }) };
}

/**
 * Automatic poses: wave hello at the start, explain while talking (with idle and a thumbs up for variety on
 * new sentences), think in long pauses, cheer to finish.
 */
export function autoPoses(segs, duration) {
  if (!segs.length) return [[0, 'idle']];
  const poses = [[0, 'wave']];
  const firstEnd = Math.min(segs[0][0] + 1.4, segs[0][1]);
  let last = 'wave', lastT = 0;
  const put = (t, p) => { if (p !== last && t - lastT >= 1.6) { poses.push([+t.toFixed(3), p]); last = p; lastT = t; } };
  put(firstEnd, 'explain');
  const talk = ['explain', 'idle', 'explain', 'thumbs'];
  let k = 0;
  segs.forEach(([a, b], i) => {
    if (i === 0) return;
    const gap = a - segs[i - 1][1];
    if (gap > 1.0) put(segs[i - 1][1] + 0.1, 'think');
    put(a - 0.08, talk[k++ % talk.length]);
  });
  const end = segs[segs.length - 1][1];
  // always finish on a cheer, even if the last change was recent
  const tEnd = Math.min(duration - 0.5, end - 0.25);
  if (last !== 'cheer') poses.push([+Math.max(tEnd, lastT + 0.5).toFixed(3), 'cheer']);
  return poses;
}
