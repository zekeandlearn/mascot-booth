// Your own recording -> a take with letter timings (takes/<name>.mp3 + .alignment.json), like an ElevenLabs take.
// Runs on your computer with transformers.js (Windows, macOS, Linux; no Python). The models download once to
// ~/.mascot-booth/models: the aligner (~95 MB) always, Whisper (~136 MB) only when there is no script.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MODELS, WHISPER_OPTIONS, SAMPLE_RATE, spokenText, alignLetters, toAlignment, letterScores } from '../app/js/align.js';

async function transformers() {
  // transformers.js loads JSON as modules, which makes Node 20 print an "experimental" notice: hide just that one
  const warn = process.emitWarning;
  process.emitWarning = (w, ...a) => (String(w).includes('Importing JSON modules') ? undefined : warn.call(process, w, ...a));
  let T;
  try { T = await import('@huggingface/transformers'); }
  catch { throw new Error('speech models are not installed: run `npm install` in the mascot-booth folder'); }
  T.env.cacheDir = process.env.MASCOT_BOOTH_MODELS || path.join(os.homedir(), '.mascot-booth', 'models');
  return T;
}

/** Any audio file -> mono 16 kHz samples (ffmpeg). */
export function decode(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

/**
 * Time every letter of a recording. script: the text that was read (audio tags are ignored); without one, Whisper
 * writes down what was said first. lang: 'en' or 'tl' (Tagalog/Taglish), for Whisper only.
 * Returns { alignment, text, score, heard }.
 */
export async function listen({ audio, script = '', lang = 'en', log = () => {} }) {
  const T = await transformers();
  const samples = decode(audio), secs = samples.length / SAMPLE_RATE;
  let text = script ? spokenText(script) : '', heard = false;
  if (!text) {
    log(`writing down what you said (Whisper, ${lang}). First run downloads ~${MODELS.whisper.mb} MB.`);
    const asr = await T.pipeline('automatic-speech-recognition', MODELS.whisper.id, { dtype: MODELS.whisper.dtype });
    const out = await asr(samples, { ...WHISPER_OPTIONS, language: lang });
    text = spokenText(out.text); heard = true;
    await asr.dispose?.();
    if (!text) throw new Error('No speech was heard in ' + audio);
  }
  log(`timing every letter of ${secs.toFixed(1)}s of audio. First run downloads ~${MODELS.aligner.mb} MB.`);
  const { letters, score } = await timeText(samples, text, T);
  return { alignment: toAlignment(letters), text, score, heard };
}

/** Time every letter of `text` in mono 16 kHz samples. Returns { letters, score } (see alignLetters). */
export async function timeText(samples, text, T) {
  T ||= await transformers();
  const processor = await T.AutoProcessor.from_pretrained(MODELS.aligner.id);
  const model = await T.AutoModelForCTC.from_pretrained(MODELS.aligner.id, { dtype: MODELS.aligner.dtype });
  const { logp, V, frame } = await letterScores(samples, processor, model);
  await model.dispose?.();
  return alignLetters(logp, V, frame, text);
}

/** Save a recording as a take: <outDir>/<name>.mp3 + <name>.alignment.json. */
export async function recordTake({ audio, script = '', lang, outDir, name = 'take-a', log }) {
  const r = await listen({ audio, script, lang, log });
  fs.mkdirSync(outDir, { recursive: true });
  const mp3 = path.join(outDir, `${name}.mp3`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', audio, '-vn', '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '192k', mp3]);
  fs.writeFileSync(path.join(outDir, `${name}.alignment.json`), JSON.stringify({
    source: 'recording', recording: path.basename(audio), aligner: MODELS.aligner.id,
    whisper: r.heard ? MODELS.whisper.id : null, score: r.score, script: script || r.text, alignment: r.alignment,
  }, null, 1));
  return { mp3, ...r };
}
