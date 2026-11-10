// Voice: one whole-script ElevenLabs take with character timestamps, saved as vo.mp3 + alignment.json.
// The key comes from ELEVENLABS_API_KEY in the environment only. It is never printed or written anywhere.
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.elevenlabs.io';

export async function credits() {
  const r = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': key() } });
  if (!r.ok) throw new Error(`subscription check failed: ${r.status}`);
  const j = await r.json();
  return { used: j.character_count, limit: j.character_limit, left: j.character_limit - j.character_count, tier: j.tier };
}

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error('ELEVENLABS_API_KEY is not set. Load it in the same command: set -a; . <your .env>; set +a; mascot-booth voice ...');
  return k;
}

/**
 * Generate one take. script = the performance script with [tags]. Returns { mp3, alignment, requestId, cost }.
 */
export async function speak({ script, voiceId, model = 'eleven_v4', stability = 0.3, similarity = 0.75, outDir, name = 'vo', language }) {
  const body = { text: script, model_id: model, voice_settings: { stability, similarity_boost: similarity } };
  if (language) body.language_code = language;
  const r = await fetch(`${API}/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key(), 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const requestId = r.headers.get('request-id'), cost = r.headers.get('character-cost');
  const j = await r.json();
  fs.mkdirSync(outDir, { recursive: true });
  const mp3 = path.join(outDir, `${name}.mp3`);
  fs.writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
  const alignment = j.alignment || j.normalized_alignment;
  fs.writeFileSync(path.join(outDir, `${name}.alignment.json`), JSON.stringify({ model, voiceId, requestId, script, alignment }, null, 1));
  return { mp3, alignment, requestId, cost };
}

/**
 * Character alignment -> spoken words [{ w, s, e }]. Bracketed audio tags are dropped (they are direction, not speech).
 */
export function wordsFromAlignment(al) {
  const ch = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds;
  const words = [];
  let cur = null, depth = 0;
  const flush = () => { if (cur && /[\p{L}\p{N}]/u.test(cur.w)) words.push({ w: cur.w.replace(/^[^\p{L}\p{N}'’]+|[^\p{L}\p{N}]+$/gu, ''), s: +cur.s.toFixed(3), e: +cur.e.toFixed(3) }); cur = null; };
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (c === '[') { depth++; flush(); continue; }
    if (c === ']') { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    if (/\s/.test(c) || c === '…' || c === '—') { flush(); continue; }
    if (!cur) cur = { w: '', s: st[i], e: en[i] };
    cur.w += c;
    if (/[\p{L}\p{N}]/u.test(c)) { if (!/[\p{L}\p{N}]/u.test(cur.w.slice(0, -1))) cur.s = st[i]; cur.e = en[i]; }
  }
  flush();
  return words;
}

/** Spoken letters only (tags dropped), for lip sync: [{ c, s, e }]. */
export function lettersFromAlignment(al) {
  const out = [];
  let depth = 0;
  al.characters.forEach((c, i) => {
    if (c === '[') return void depth++;
    if (c === ']') return void (depth = Math.max(0, depth - 1));
    if (depth) return;
    out.push({ c, s: al.character_start_times_seconds[i], e: al.character_end_times_seconds[i] });
  });
  return out;
}
