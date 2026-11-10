#!/usr/bin/env node
// mascot-booth: turn a topic into a cinematic, word-synced explainer starring your own talking character.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...rest] = process.argv.slice(2);
const args = { _: [] };
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; args[k] = v; }
  else args._.push(a);
}
const filmDir = () => path.resolve(args._[0] || '.');
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');
const log = (...a) => console.log(...a);

const HELP = `mascot-booth <command>

  doctor                              check node, ffmpeg, Chrome, fonts, ElevenLabs key
  new <dir> [--presenter <dir>] [--landscape|--square] [--fps 60] [--brand <brand.json>] [--mascot]
                                      scaffold a film folder (film.json + film.js). --mascot: a mascot-only
                                      clip directed by direction.json, rendered transparent (30fps default)
  voice <dir> --script <file> --voice <id> [--name take-a] [--stability 0.3] [--model eleven_v4]
                                      one whole-script ElevenLabs take with timestamps -> <dir>/takes/
                                      (needs ELEVENLABS_API_KEY in the environment; prints credits used)
  listen <dir> --audio <file> [--script <file>] [--name take-a] [--lang en|tl]
                                      your own recording -> a take with a time for every letter (no ElevenLabs).
                                      With --script the script's words are timed; without, Whisper writes them
                                      down first (--lang tl for Tagalog/Taglish). Runs offline after a one-time
                                      model download (~95 MB, +136 MB without a script)
  prepare <dir> --take <takes/name>   pick a take: copies vo.mp3, writes words.json + mouth.json, sets duration
  prepare <dir> --audio <file> [--script <file>]
                                      listen + prepare in one step
  cues <dir>                          print the word cue sheet (word @ seconds), grouped at pauses
  direction <dir>                     mascot films: check direction.json and print the resolved timeline
  preview <dir> [--port 4777]         serve the live player with a scrubber
  stills <dir> --at 1,4.5,9 [--out <dir>] [--sheet] [--query k=v] [--alpha]
                                      exact frames as PNG (and a contact sheet); --alpha keeps transparency
  render <dir> [--blur 1|2|4] [--workers N] [--from s --to s] [--alpha webm|mov] [--no-check]
                                      frame-exact render + synthesized sound design + mix -> renders/<slug>.mp4,
                                      then the sync proof (skip with --no-check)
                                      --alpha (or film.json "alpha"): transparent -> renders/<slug>.webm or .mov
  check <dir> [--file <video>]        sync proof: re-time every word in the finished video's audio and confirm the
                                      voice still lands where words.json says (default: renders/<slug>.mp4)
  presenter cut --sheet <img> --names a,b,c [--sheet <img> --names ...] --out <dir> [--height 1100]
  presenter review <dir> --out <png> [--crop x,y,w,h]
`;

async function main() {
  switch (cmd) {
    case 'doctor': return doctor();
    case 'new': return newFilm();
    case 'voice': return voice();
    case 'listen': return listenCmd();
    case 'prepare': return prepare();
    case 'cues': return cues();
    case 'direction': return direction();
    case 'preview': return preview();
    case 'stills': return stills();
    case 'render': return render();
    case 'check': return check();
    case 'presenter': return presenter();
    default: log(HELP);
  }
}

async function doctor() {
  const check = (name, fn) => { try { const v = fn(); log(`OK       ${name}${v ? '  ' + v : ''}`); return true; } catch (e) { log(`MISSING  ${name}  ${e.message}`); return false; } };
  let ok = true;
  ok &= check('node >= 20', () => { const v = +process.versions.node.split('.')[0]; if (v < 20) throw new Error('install Node 20+'); return process.version; });
  ok &= check('ffmpeg', () => execSync('ffmpeg -version', { stdio: 'pipe' }).toString().split('\n')[0].split(' ')[2]);
  let chrome = null;
  try { chrome = await (await import('puppeteer')).default.executablePath(); } catch {}
  ok &= check('headless Chrome (puppeteer)', () => { if (!chrome || !fs.existsSync(chrome)) throw new Error('run: npx puppeteer browsers install chrome'); return 'found'; });
  ok &= check('fonts', () => { for (const f of ['space-grotesk', 'jetbrains-mono', 'pixelify-sans']) if (!fs.existsSync(path.join(ROOT, 'node_modules/@fontsource', f))) throw new Error('run npm install in ' + ROOT); });
  ok &= check('speech models (own recordings)', () => { if (!fs.existsSync(path.join(ROOT, 'node_modules/@huggingface/transformers/package.json'))) throw new Error('run npm install in ' + ROOT); return 'installed'; });
  log(process.env.ELEVENLABS_API_KEY ? 'OK       ElevenLabs key  set' : 'SKIP     ElevenLabs key (optional)  load it in the same command as `mascot-booth voice`');
  process.exitCode = ok ? 0 : 1;
}

function newFilm() {
  const dir = filmDir();
  if (fs.existsSync(path.join(dir, 'film.json'))) throw new Error('film.json already exists in ' + dir);
  fs.mkdirSync(dir, { recursive: true });
  const landscape = !!args.landscape, square = !!args.square, mascot = !!args.mascot;
  if (mascot && !args.presenter) throw new Error('--mascot needs --presenter <dir> (a folder with presenter.json)');
  const brand = args.brand ? readJSON(path.resolve(args.brand)) : readJSON(path.join(ROOT, 'templates/brand.default.json'));
  const film = {
    title: path.basename(dir), slug: path.basename(dir),
    width: landscape ? 1920 : 1080, height: square ? 1080 : landscape ? 1080 : 1920, fps: +(args.fps || (mascot ? 30 : 60)), duration: 10, seed: 7,
    presenter: args.presenter ? path.relative(dir, path.resolve(args.presenter)) : null,
    audio: { vo: null, offset: 0 }, brand,
  };
  if (mascot) { film.kind = 'mascot'; film.alpha = 'webm'; }
  writeJSON(path.join(dir, 'film.json'), film);
  fs.copyFileSync(path.join(ROOT, mascot ? 'templates/mascot.js' : 'templates/film.js'), path.join(dir, 'film.js'));
  if (mascot) {
    const dirn = readJSON(path.join(ROOT, 'templates/direction.json'));
    const man = readJSON(path.join(path.resolve(args.presenter), 'presenter.json'));
    const names = Object.keys(man.poses);
    dirn.pose = names.includes('idle') ? 'idle' : names[0];
    writeJSON(path.join(dir, 'direction.json'), dirn);
    log(`poses: ${names.join(', ')}`);
  }
  log('created', dir);
}

async function voice() {
  const { speak, credits, wordsFromAlignment } = await import('../engine/voice.mjs');
  const dir = filmDir();
  if (!args.script || !args.voice) throw new Error('--script <file> and --voice <id> are required');
  let script = fs.readFileSync(path.resolve(args.script), 'utf8');
  const fence = script.split('```');
  if (fence.length >= 3) script = fence[1].replace(/^\w*\n/, '');
  script = script.trim();
  const before = await credits();
  log(`credits left: ${before.left} (${before.tier})`);
  const r = await speak({ script, voiceId: args.voice, model: args.model || 'eleven_v4', stability: +(args.stability || 0.3), similarity: +(args.similarity || 0.75), outDir: path.join(dir, 'takes'), name: args.name || 'take-a' });
  const w = wordsFromAlignment(r.alignment);
  log(`saved ${path.relative(dir, r.mp3)}  ${w.length} words, ${w.at(-1)?.e.toFixed(2)}s, cost ${r.cost} characters`);
}

async function listenCmd() {
  const { recordTake } = await import('../engine/listen.mjs');
  const dir = filmDir();
  if (!args.audio || args.audio === true) throw new Error('listen needs --audio <your recording>');
  const audio = path.resolve(args.audio);
  if (!fs.existsSync(audio)) throw new Error('no such file: ' + audio);
  const script = args.script && args.script !== true ? fs.readFileSync(path.resolve(args.script), 'utf8') : '';
  const name = args.name && args.name !== true ? args.name : 'take-a';
  const t0 = Date.now();
  const r = await recordTake({ audio, script, lang: args.lang || 'en', outDir: path.join(dir, 'takes'), name, log });
  const words = r.text.split(' ').length;
  log(`listened: ${words} words timed in ${((Date.now() - t0) / 1000).toFixed(0)}s, match score ${r.score} -> takes/${name}.mp3 + .alignment.json`);
  if (r.score < -3) log('WARNING  the recording and the words do not match well (score below -3). Check that --script is the text you read, or drop it to let Whisper write it down.');
  if (r.heard) log(`heard: "${r.text.slice(0, 160)}${r.text.length > 160 ? '…' : ''}"`);
  return `takes/${name}`;
}

async function prepare() {
  const { wordsFromAlignment, lettersFromAlignment } = await import('../engine/voice.mjs');
  const { buildMouth } = await import('../engine/lipsync.mjs');
  const dir = filmDir();
  if (args.audio) args.take = await listenCmd();
  const take = path.resolve(dir, args.take || 'takes/take-a');
  const al = readJSON(take + '.alignment.json').alignment;
  fs.copyFileSync(take + '.mp3', path.join(dir, 'vo.mp3'));
  const words = wordsFromAlignment(al);
  writeJSON(path.join(dir, 'words.json'), words);
  writeJSON(path.join(dir, 'mouth.json'), buildMouth(lettersFromAlignment(al)));
  const film = readJSON(path.join(dir, 'film.json'));
  film.audio = { ...(film.audio || {}), vo: 'vo.mp3', take: path.relative(dir, take) };
  const tail = +(args.tail || 2.8);
  film.duration = +(words.at(-1).e + tail).toFixed(2);
  writeJSON(path.join(dir, 'film.json'), film);
  log(`prepared ${path.basename(take)}: ${words.length} words, voice ends ${words.at(-1).e}s, film ${film.duration}s`);
}

function cues() {
  const w = readJSON(path.join(filmDir(), 'words.json'));
  let line = '';
  w.forEach((x, i) => { const gap = i ? x.s - w[i - 1].e : 0; if (gap > 0.25) { log(line); line = `  · ${gap.toFixed(2)}s\n`; } line += `${x.w}@${x.s.toFixed(2)} `; });
  log(line);
}

async function direction() {
  const { readDirection } = await import('../engine/render.mjs');
  const d = await readDirection(filmDir());
  const f = t => t.toFixed(2).padStart(6) + 's';
  log(`poses available: ${d.poses.join(', ')}`);
  log(`${f(d.enter.t)}  enter (${d.enter.style})`);
  for (const b of d.beats) {
    const what = [b.pose && `pose ${b.pose}`, b.place && `${b.move === 'cut' ? 'cut' : 'glide'} to ${b.place}`, b.size && `size ${b.size}`, b.flip != null && `flip ${b.flip}`].filter(Boolean).join(', ');
    log(`${f(b.t)}  ${(b.word ? `"${b.word}"` : '').padEnd(18)} ${what}${b.note ? `   (${b.note})` : ''}`);
  }
  if (d.exit) log(`${f(d.exit.t)}  exit (${d.exit.style})`);
  log(`${f(d.duration)}  end`);
  if (d.warnings.length) { log('\nwarnings:'); d.warnings.forEach(w => log('  - ' + w)); }
}

async function preview() {
  const { serve } = await import('../engine/server.mjs');
  const { url } = await serve(filmDir(), +(args.port || 4777));
  log(`preview: ${url}/_cs/player.html`);
}

async function stills() {
  const { stills: grab } = await import('../engine/render.mjs');
  const dir = filmDir();
  const times = String(args.at || '0').split(',').map(Number);
  const out = path.resolve(args.out || path.join(dir, 'renders/stills'));
  const files = await grab(dir, times, out, { query: args.query || '', alpha: !!args.alpha });
  if (args.sheet) {
    const sharp = (await import('sharp')).default;
    const film = readJSON(path.join(dir, 'film.json'));
    const tw = 360, th = Math.round(tw * film.height / film.width), cols = Math.min(6, files.length), rows = Math.ceil(files.length / cols);
    const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(tw, th).png().toBuffer(), left: (i % cols) * (tw + 8), top: Math.floor(i / cols) * (th + 8) })));
    const sheet = path.join(out, 'sheet.png');
    await sharp({ create: { width: cols * (tw + 8), height: rows * (th + 8), channels: 3, background: '#000' } }).composite(tiles).png().toFile(sheet);
    log(sheet);
  } else files.forEach(f => log(f));
}

async function render() {
  const { renderVideo, readCues } = await import('../engine/render.mjs');
  const { mixAndMux } = await import('../engine/audio.mjs');
  const dir = filmDir();
  const film = readJSON(path.join(dir, 'film.json'));
  const slug = film.slug || path.basename(dir);
  const t0 = Date.now();
  const alpha = args.alpha ? (args.alpha === true ? 'webm' : args.alpha) : film.alpha || null;
  if (alpha && !['webm', 'mov'].includes(alpha)) throw new Error('--alpha takes webm or mov');
  const { sfx } = await readCues(dir);
  log(`sound cues: ${sfx.length}${alpha ? `  (transparent ${alpha})` : ''}`);
  const picture = path.join(dir, 'renders', `${slug}.picture.${alpha ? 'mov' : 'mp4'}`);
  let last = 0;
  const r = await renderVideo(dir, {
    out: picture, alpha: !!alpha, blur: +(args.blur || 1), workers: args.workers ? +args.workers : undefined,
    from: args.from ? +args.from : undefined, to: args.to ? +args.to : undefined,
    onProgress: (d, n, s) => { const p = Math.floor(d / n * 20); if (p !== last) { last = p; process.stdout.write(`\r  frames ${d}/${n}  ${(d / s).toFixed(1)} fps  `); } },
  });
  log(`\npicture: ${r.frames} frames in ${r.seconds.toFixed(0)}s`);
  const out = path.join(dir, 'renders', `${slug}.${alpha || 'mp4'}`);
  const m = await mixAndMux({ film, filmDir: dir, cues: sfx, picture, out, format: alpha || 'mp4' });
  log(`mix: ${m.loud.I} LUFS, true peak ${m.loud.TP} dBFS`);
  if (alpha) fs.rmSync(picture, { force: true }); // the ProRes intermediate is huge (~20 MB per second) and now inside the output
  log(`done: ${out}  (${((Date.now() - t0) / 1000).toFixed(0)}s total)`);
  if (!args['no-check'] && film.audio?.vo && args.from == null && args.to == null) await check(out);
}

async function check(file) {
  const { syncCheck, report } = await import('../engine/sync.mjs');
  const dir = filmDir();
  const film = readJSON(path.join(dir, 'film.json'));
  const slug = film.slug || path.basename(dir);
  const media = file || (args.file && args.file !== true ? path.resolve(args.file) : ['mp4', 'webm', 'mov'].map(x => path.join(dir, 'renders', `${slug}.${x}`)).find(f => fs.existsSync(f)));
  if (!media || !fs.existsSync(media)) throw new Error('no render to check: run `render` first, or pass --file <video>');
  const words = readJSON(path.join(dir, 'words.json'));
  log(`checking sync of ${path.basename(media)} against words.json…`);
  const vo = film.audio?.vo && fs.existsSync(path.join(dir, film.audio.vo)) ? path.join(dir, film.audio.vo) : null;
  const r = await syncCheck({ media, words, vo, offset: film.audio?.offset || 0 });
  log(report(r));
  if (!r.inSync) process.exitCode = 1;
  return r;
}

async function presenter() {
  const t = await import('../engine/presenter-tools.mjs');
  const sub = args._[0];
  if (sub === 'cut') {
    // --sheet/--names pairs: process.argv order
    const pairs = []; const av = process.argv.slice(3);
    for (let i = 0; i < av.length; i++) if (av[i] === '--sheet') pairs.push({ sheet: path.resolve(av[i + 1]) }); else if (av[i] === '--names') pairs[pairs.length - 1].names = av[i + 1].split(',');
    const m = await t.buildPresenter(pairs, path.resolve(args.out), { height: +(args.height || 1100), name: args.name || 'presenter' });
    log(`presenter: ${Object.keys(m.poses).length} poses on a ${m.width}x${m.height} canvas, feet at ${m.foot}`);
    log('next: calibrate each pose\'s mouth [x,y,w,h] and eyes in presenter.json, then `mascot-booth presenter review`');
  } else if (sub === 'review') {
    log(await t.reviewSheet(path.resolve(args._[1]), path.resolve(args.out), { crop: args.crop ? args.crop.split(',').map(Number) : undefined }));
  } else log(HELP);
}

main().catch(e => { console.error('error:', e.message); process.exit(1); });
