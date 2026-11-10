// Audio: voice measured to -16 LUFS, synthesized sound design under it, optional music ducked under the voice,
// final mix to -14 LUFS with a -1 dBTP ceiling (social platforms), then muxed with the picture.
import path from 'node:path';
import { run } from './render.mjs';
import { renderCues, writeWav } from './sfx.mjs';

export async function loudness(file, filter = '') {
  const out = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', (filter ? filter + ',' : '') + 'ebur128=peak=true', '-f', 'null', '-']);
  const i = out.match(/I:\s+(-?[\d.]+) LUFS/g); const tp = out.match(/Peak:\s+(-?[\d.]+) dBFS/g);
  return { I: i ? parseFloat(i[i.length - 1].split(/\s+/)[1]) : null, TP: tp ? parseFloat(tp[tp.length - 1].split(/\s+/)[1]) : null };
}

/**
 * film: film.json; filmDir; cues: sound cues from the film; picture: video path. Returns { mix, final, loud }.
 */
export async function mixAndMux({ film, filmDir, cues, picture, out, sfxGain = 0.5, format = 'mp4' }) {
  const dur = film.duration;
  const work = path.join(filmDir, 'renders');
  const sfx = path.join(work, 'sfx.wav');
  writeWav(sfx, renderCues(cues, dur, { master: sfxGain }));
  const vo = film.audio?.vo ? path.join(filmDir, film.audio.vo) : null;
  const music = film.audio?.music ? path.join(filmDir, film.audio.music) : null;
  const inputs = [], parts = [];
  let idx = 0;
  if (vo) {
    const m = await loudness(vo);
    const g = (-16 - m.I).toFixed(2);
    inputs.push('-i', vo);
    parts.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${g}dB,adelay=${Math.round((film.audio.offset || 0) * 1000)}:all=1[vo0]`);
    idx++;
  }
  inputs.push('-i', sfx); parts.push(`[${idx}:a]aresample=48000[sfx]`); idx++;
  let bus = vo ? '[vo][sfx]amix=inputs=2:normalize=0[pre]' : '[sfx]anull[pre]';
  if (music) {
    inputs.push('-i', music);
    parts.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${film.audio.musicGain ?? -20}dB,afade=t=out:st=${dur - 2}:d=2[mus]`);
    if (vo) parts.push('[vo0]asplit[vo][key]', '[mus][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=300[duck]');
    bus = vo ? '[vo][sfx][duck]amix=inputs=3:normalize=0[pre]' : '[sfx][mus]amix=inputs=2:normalize=0[pre]';
    idx++;
  }
  if (vo && !music) parts.push('[vo0]anull[vo]');
  parts.push(bus);
  const pre = path.join(work, 'mix-pre.wav');
  await run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', '[pre]', '-t', String(dur), '-c:a', 'pcm_f32le', pre]);
  const m = await loudness(pre);
  const mix = path.join(work, 'mix.wav');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', pre, '-af', `volume=${(-14 - m.I).toFixed(2)}dB,alimiter=limit=0.891:level=false:attack=3:release=60`, '-c:a', 'pcm_s16le', mix]);
  const loud = await loudness(mix);
  const final = out || path.join(work, `${film.slug || 'film'}.${format}`);
  // mp4: H.264 + AAC. Transparent: webm = VP9 with alpha + Opus (the same kind of file the web app exports),
  // mov = ProRes 4444 with alpha + AAC (largest, but every pro editor reads it).
  const enc = {
    mp4: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart'],
    webm: ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '160k'],
    mov: ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k'],
  }[format];
  if (!enc) throw new Error(`unknown output format "${format}" (mp4, webm or mov)`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', picture, '-i', mix, '-map', '0:v', '-map', '1:a', ...enc, '-shortest', final]);
  return { mix, final, loud };
}
