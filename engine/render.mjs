// Frame-exact renderer: headless Chrome seeks the film to each frame time, screenshots it, and pipes the frames
// into ffmpeg. Several pages render interleaved chunks in parallel. Optional real motion blur: N sub-frames
// across a 180-degree shutter are averaged per output frame.
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { serve, readFilm } from './server.mjs';

async function openPage(browser, url, w, h) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const errors = [];
  // an uncaught error while the film builds means it will never be ready: fail at once, with the message only
  let failNow;
  const failed = new Promise((_, err) => (failNow = err));
  failed.catch(() => {});
  page.on('pageerror', e => { errors.push(String(e.message).split('\n')[0]); failNow(new Error(errors.at(-1))); });
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  try {
    await Promise.race([page.waitForFunction('document.title === "ready"', { timeout: 120000 }), failed]);
  } catch (e) { await page.close().catch(() => {}); throw new Error('player never became ready: ' + (errors.join('\n') || e.message)); }
  if (errors.length) throw new Error('film errors:\n' + errors.join('\n'));
  return page;
}

export async function launch() {
  return puppeteer.launch({
    headless: true,
    args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--font-render-hinting=none', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio'],
  });
}

/** Screenshot single frames: times -> PNG paths. */
export async function stills(filmDir, times, outDir, { query = '', alpha = false } = {}) {
  const film = readFilm(filmDir);
  const { server, url } = await serve(filmDir);
  const browser = await launch();
  try {
    const page = await openPage(browser, `${url}/_cs/player.html?render=1${alpha ? '&alpha=1' : ''}&${query}`, film.width, film.height);
    fs.mkdirSync(outDir, { recursive: true });
    const out = [];
    for (const t of times) {
      await page.evaluate(t => window.__mascotBoothFilm.seek(t), t);
      const f = path.join(outDir, `still-${t.toFixed(2)}.png`);
      await page.screenshot({ path: f, type: 'png', omitBackground: alpha });
      out.push(f);
    }
    return out;
  } finally { await browser.close(); server.close(); }
}

/** Read the sound cues a film declares (cs.sfx calls). */
export async function readCues(filmDir) {
  const film = readFilm(filmDir);
  const { server, url } = await serve(filmDir);
  const browser = await launch();
  try {
    const page = await openPage(browser, `${url}/_cs/player.html?render=1`, film.width, film.height);
    return await page.evaluate(() => ({ sfx: window.__mascotBoothFilm.sfx, duration: window.__mascotBoothFilm.duration }));
  } finally { await browser.close(); server.close(); }
}

/** The resolved direction of a mascot film (templates/mascot.js): beats with times, plus warnings. */
export async function readDirection(filmDir) {
  const film = readFilm(filmDir);
  const { server, url } = await serve(filmDir);
  const browser = await launch();
  try {
    const page = await openPage(browser, `${url}/_cs/player.html?render=1`, film.width, film.height);
    const d = await page.evaluate(() => window.__direction || null);
    if (!d) throw new Error('this film has no direction (film.js is not the mascot template)');
    return d;
  } finally { await browser.close(); server.close(); }
}

/**
 * Render the picture to an intermediate video (no audio).
 * opts: { out, workers, blur (sub-frames, 1 = off), from, to, alpha, onProgress }
 * alpha: keep transparency. Frames are PNG screenshots with no page background, encoded to ProRes 4444 (.mov) segments.
 */
export async function renderVideo(filmDir, opts = {}) {
  const film = readFilm(filmDir);
  const fps = film.fps || 60, W = film.width, H = film.height;
  const t0 = opts.from ?? 0, t1 = opts.to ?? film.duration;
  const total = Math.round((t1 - t0) * fps);
  const alpha = !!opts.alpha;
  const blur = alpha ? 1 : Math.max(1, opts.blur || 1); // motion blur averages opaque frames: off for transparent renders
  const workers = Math.max(1, Math.min(opts.workers || Math.max(2, Math.floor(os.cpus().length / 2)), 8));
  const out = opts.out || path.join(filmDir, 'renders', 'picture.mp4');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mascot-booth-'));
  const { server, url } = await serve(filmDir);
  const browser = await launch();
  let done = 0;
  const started = Date.now();
  try {
    // contiguous chunks, one per worker, each encoded to its own lossless-ish segment
    const per = Math.ceil(total / workers);
    const segs = [];
    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      const a = w * per, b = Math.min(total, a + per);
      if (a >= b) return;
      const seg = path.join(tmp, `seg-${String(w).padStart(2, '0')}.${alpha ? 'mov' : 'mp4'}`);
      segs[w] = seg;
      const page = await openPage(browser, `${url}/_cs/player.html?render=1${alpha ? '&alpha=1' : ''}`, W, H);
      const input = alpha
        ? ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps), '-i', '-'] // PNGs keep the alpha channel
        : blur === 1
          ? ['-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-'] // JPEGs straight in, no decode in Node
          : ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-'];
      const codec = alpha
        ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0']
        : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p'];
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...input, ...codec, seg], { stdio: ['pipe', 'inherit', 'inherit'] });
      const ffDone = new Promise((ok, err) => ff.on('close', c => (c === 0 ? ok() : err(new Error('ffmpeg exited ' + c)))));
      const acc = blur > 1 ? new Float32Array(W * H * 3) : null;
      for (let f = a; f < b; f++) {
        let frame;
        if (blur === 1) {
          await page.evaluate(t => window.__mascotBoothFilm.seek(t), t0 + f / fps);
          frame = alpha
            ? await page.screenshot({ type: 'png', omitBackground: true, optimizeForSpeed: true })
            : await page.screenshot({ type: 'jpeg', quality: 95, optimizeForSpeed: true });
        } else {
          acc.fill(0);
          for (let s = 0; s < blur; s++) {
            // 180-degree shutter: sub-frames spread over half the frame interval, centred on the frame time
            const t = t0 + (f + (s / blur - 0.25) * 0.5) / fps;
            await page.evaluate(t => window.__mascotBoothFilm.seek(t), Math.max(0, t));
            const jpg = await page.screenshot({ type: 'jpeg', quality: 96, optimizeForSpeed: true });
            const raw = await sharp(jpg).removeAlpha().raw().toBuffer();
            for (let i = 0; i < raw.length; i++) acc[i] += raw[i];
          }
          frame = Buffer.alloc(W * H * 3);
          for (let i = 0; i < frame.length; i++) frame[i] = acc[i] / blur + 0.5;
        }
        if (!ff.stdin.write(frame)) await new Promise(r => ff.stdin.once('drain', r));
        done++;
        opts.onProgress?.(done, total, (Date.now() - started) / 1000);
      }
      ff.stdin.end();
      await ffDone;
      await page.close();
    }));
    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, segs.filter(Boolean).map(s => `file '${s}'`).join('\n'));
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
    return { out, frames: total, seconds: (Date.now() - started) / 1000 };
  } finally {
    await browser.close(); server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function run(cmd, args) {
  return new Promise((ok, err) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let e = '', o = '';
    p.stdout.on('data', d => (o += d)); p.stderr.on('data', d => (e += d));
    p.on('close', c => (c === 0 ? ok(o + e) : err(new Error(`${cmd} failed (${c}): ${e.slice(-2000)}`))));
  });
}
