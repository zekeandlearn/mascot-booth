// Export in the browser with WebCodecs: transparent WebM (VP9 + alpha, Opus) or MP4 (H.264, AAC or Opus).
import * as MP4 from '../vendor/mp4-muxer.mjs';
import * as WEBM from '../vendor/webm-muxer.mjs';

export const canExport = () => typeof window.VideoEncoder === 'function' && typeof window.AudioEncoder === 'function';

async function resample(audio, sr = 48000) {
  if (!audio) return null;
  const oc = new OfflineAudioContext(2, Math.ceil(audio.duration * sr), sr);
  const src = oc.createBufferSource(); src.buffer = audio; src.connect(oc.destination); src.start();
  return await oc.startRendering();
}

async function pickVideo(kind, W, H, fps) {
  // WebM transparency is two VP9 streams (colour + alpha as grayscale), so both are plain no-alpha encoders
  const tries = kind === 'webm'
    ? [{ codec: 'vp09.00.10.08' }, { codec: 'vp8' }]
    : [{ codec: 'avc1.640028' }, { codec: 'avc1.4d0028' }, { codec: 'avc1.42003e' }];
  for (const t of tries) {
    const cfg = { ...t, width: W, height: H, bitrate: Math.round(W * H * fps * 0.1), framerate: fps, latencyMode: 'quality' };
    if (kind === 'mp4') cfg.avc = { format: 'avc' };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch {}
  }
  return null;
}

async function pickAudio(kind) {
  const tries = kind === 'webm' ? ['opus'] : ['mp4a.40.2', 'opus'];
  for (const codec of tries) {
    const cfg = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 };
    try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) return cfg; } catch {}
  }
  return null;
}

/**
 * kind: 'webm' (transparent) | 'mp4'. draw(ctx, t) paints frame t. Returns a Blob.
 * onProgress(0..1)
 */
export async function exportVideo({ kind, W, H, fps = 30, duration, audio, draw, onProgress }) {
  const vcfg = await pickVideo(kind, W, H, fps);
  if (!vcfg) throw new Error('This browser cannot encode ' + (kind === 'webm' ? 'transparent WebM' : 'MP4') + '.');
  const acfg = audio ? await pickAudio(kind) : null;
  const a48 = acfg ? await resample(audio) : null;

  const target = kind === 'webm' ? new WEBM.ArrayBufferTarget() : new MP4.ArrayBufferTarget();
  const muxer = kind === 'webm'
    ? new WEBM.Muxer({ target, video: { codec: vcfg.codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8', width: W, height: H, frameRate: fps, alpha: true },
        audio: acfg ? { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: 48000 } : undefined, firstTimestampBehavior: 'offset' })
    : new MP4.Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: fps },
        audio: acfg ? { codec: acfg.codec === 'opus' ? 'opus' : 'aac', numberOfChannels: 2, sampleRate: 48000 } : undefined, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });

  let err = null;
  const alpha = kind === 'webm';
  const color = [], mask = [];
  const venc = new VideoEncoder({ output: (c, m) => (alpha ? color.push([c, m]) : muxer.addVideoChunk(c, m)), error: e => (err = e) });
  venc.configure(vcfg);
  let aenc2 = null;
  if (alpha) { aenc2 = new VideoEncoder({ output: c => mask.push(c), error: e => (err = e) }); aenc2.configure(vcfg); }
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext('2d', { alpha: true, willReadFrequently: alpha });
  // alpha plane as raw I420: Y = alpha (full 0..255, no limited-range squeeze), U = V = 128
  const W2 = Math.ceil(W / 2), H2 = Math.ceil(H / 2);
  const yuv = alpha ? new Uint8Array(W * H + W2 * H2 * 2) : null;
  if (alpha) yuv.fill(128, W * H);
  const frames = Math.ceil(duration * fps);
  for (let f = 0; f < frames; f++) {
    if (err) throw err;
    const t = f / fps, ts = Math.round(t * 1e6), dur = Math.round(1e6 / fps), key = f % (fps * 2) === 0;
    g.clearRect(0, 0, W, H);
    draw(g, t);
    if (alpha) {
      // colour without alpha, and the alpha plane as a grayscale picture
      const d = g.getImageData(0, 0, W, H).data;
      for (let i = 0, j = 3; i < W * H; i++, j += 4) yuv[i] = d[j];
      const mf = new VideoFrame(yuv, { format: 'I420', codedWidth: W, codedHeight: H, timestamp: ts, duration: dur });
      aenc2.encode(mf, { keyFrame: key }); mf.close();
    }
    const vf = new VideoFrame(canvas, { timestamp: ts, duration: dur, alpha: 'discard' });
    venc.encode(vf, { keyFrame: key });
    vf.close();
    if (venc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 0));
    if (f % 10 === 0) { onProgress?.(f / frames * 0.92); await new Promise(r => setTimeout(r, 0)); }
  }
  await venc.flush();
  if (alpha) {
    await aenc2.flush();
    if (color.length !== mask.length) throw new Error('Alpha and colour streams do not line up.');
    color.forEach(([c, m], i) => {
      const a = new Uint8Array(mask[i].byteLength); mask[i].copyTo(a);
      muxer.addVideoChunk(c, { ...(m || {}), alphaData: a });
    });
  }

  if (acfg && a48) {
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => (err = e) });
    aenc.configure(acfg);
    const L = a48.getChannelData(0), R = a48.numberOfChannels > 1 ? a48.getChannelData(1) : L;
    const total = Math.min(L.length, Math.ceil(duration * 48000)), N = 1024;
    for (let i = 0; i < total; i += N) {
      const n = Math.min(N, total - i), data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data });
      aenc.encode(ad); ad.close();
    }
    await aenc.flush();
  }
  if (err) throw err;
  muxer.finalize();
  onProgress?.(1);
  return new Blob([target.buffer], { type: kind === 'webm' ? 'video/webm' : 'video/mp4' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
