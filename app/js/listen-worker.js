// Sharper lip sync, off the main thread: times every letter of your recording on your own computer.
// The audio never leaves the browser. The speech models download once from Hugging Face and the browser keeps them.
import { pipeline, AutoProcessor, AutoModelForCTC, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
import { MODELS, WHISPER_OPTIONS, spokenText, alignLetters, letterScores } from './align.js';

env.allowLocalModels = false;
const say = (type, extra = {}) => self.postMessage({ type, ...extra });

// download progress, summed over all files of a model
function progress(stage) {
  const files = {};
  return p => {
    if (p.status !== 'progress' || !p.total) return;
    files[p.file] = [p.loaded, p.total];
    const v = Object.values(files), got = v.reduce((a, x) => a + x[0], 0), all = v.reduce((a, x) => a + x[1], 0);
    say('progress', { stage, done: got / all, mb: Math.round(all / 1e6) });
  };
}

let aligner = null;
async function getAligner() {
  if (!aligner) {
    const processor = await AutoProcessor.from_pretrained(MODELS.aligner.id, { progress_callback: progress('download_aligner') });
    const model = await AutoModelForCTC.from_pretrained(MODELS.aligner.id, { dtype: MODELS.aligner.dtype, progress_callback: progress('download_aligner') });
    aligner = { processor, model };
  }
  return aligner;
}

self.onmessage = async ({ data: { samples, text, lang } }) => {
  try {
    let words = spokenText(text || ''), heard = false;
    if (!words) {
      say('stage', { stage: 'download_whisper' });
      const asr = await pipeline('automatic-speech-recognition', MODELS.whisper.id, { dtype: MODELS.whisper.dtype, progress_callback: progress('download_whisper') });
      say('stage', { stage: 'whisper' });
      const out = await asr(samples, { ...WHISPER_OPTIONS, language: lang || 'en' });
      await asr.dispose?.();
      words = spokenText(out.text); heard = true;
      if (!words) throw new Error('no_speech');
    }
    say('stage', { stage: 'download_aligner' });
    const { processor, model } = await getAligner();
    say('stage', { stage: 'align' });
    const { logp, V, frame } = await letterScores(samples, processor, model, done => say('progress', { stage: 'align', done }));
    const { letters, score } = alignLetters(logp, V, frame, words);
    say('done', { letters, score, text: words, heard });
  } catch (e) {
    say('error', { message: e.message || String(e) });
  }
};
