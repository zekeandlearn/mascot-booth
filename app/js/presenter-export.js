// "Export for Claude Code": the mascot as a Mascot Booth presenter folder, zipped, so the CLI engine (and an agent
// directing a film with it) uses exactly the poses and face boxes set up here. Built in the browser, nothing uploaded.
import { boxAABB, ringColor } from './mascot.js';

// ---------------- a tiny store-only zip (PNGs are already compressed) ----------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** files: [{ name, data: Uint8Array }] -> Blob (application/zip) */
export function zip(files, when = new Date()) {
  const enc = new TextEncoder(), parts = [], central = [];
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, n, true); lh.setUint32(22, n, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, n, true); ch.setUint32(24, n, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + n;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// ---------------- the presenter ----------------
export const slugify = s => (s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'my-mascot';
const round = b => b.map((v, i) => (i < 4 ? Math.round(v) : +v.toFixed(4)));
const rgb = c => `rgb(${c.join(',')})`;
const pngBytes = canvas => new Promise((ok, err) => canvas.toBlob(b => (b ? b.arrayBuffer().then(a => ok(new Uint8Array(a))) : err(new Error('Could not save a pose as PNG.'))), 'image/png'));

/**
 * presenter.json in the engine's format. Face boxes keep the app's tilt ([x, y, w, h, angle]); skin colours are the
 * ones this app measured, so any colour of character lip-syncs and blinks the same in the engine.
 */
export function manifest({ mascot, names, faces, sheet }, name) {
  const donor = names.find(n => faces[n]?.open) || null;
  const poses = {};
  for (const n of names) {
    const f = faces[n], img = mascot.imgs[n];
    const g = img.getContext('2d', { willReadFrequently: true });
    const blinks = f.blinks !== false;
    const eyes = blinks ? f.eyes.map(round) : null;
    poses[n] = {
      file: `poses/${n}.png`,
      mouth: round(f.mouth),
      eyes,
      talks: true,
      blinks,
      mouthArt: f.open || !donor ? 'own' : donor,
      skin: {
        mouth: mascot.cache[n]?.skin || rgb(ringColor(g, boxAABB(f.mouth), mascot.W, mascot.H)),
        eyes: eyes ? eyes.map(e => rgb(ringColor(g, boxAABB(e), mascot.W, mascot.H, 6))) : [],
      },
    };
  }
  return {
    name, width: sheet.width, height: sheet.height, foot: sheet.foot, pixel: 'smooth',
    donor: donor || names[0], blinkFallback: true, source: 'mascot-booth-app', poses,
  };
}

const readme = (name, names) => `# ${name}: a Mascot Booth presenter

Made with the Mascot Booth web app: ${names.length} poses (${names.join(', ')}) on one canvas, feet on one baseline,
with the mouth and eye boxes you set up. Keep this folder somewhere safe, then tell Claude Code:

> use Mascot Booth to make a talking explainer about <topic>, my mascot is in <path to this folder>

By hand (from the mascot-booth repo):

    node bin/mascot-booth.mjs new films/<slug> --presenter <path to this folder>

Check the lip sync and blinks before a film uses it (each pose, each mouth shape):

    MASCOT_BOOTH_PRESENTER=<path to this folder> node bin/mascot-booth.mjs stills tests/presenter-review --at 0.5 --query mouth=open --sheet
    MASCOT_BOOTH_PRESENTER=<path to this folder> node bin/mascot-booth.mjs stills tests/presenter-review --at 0.5 --query blink=1 --sheet

Face boxes are [x, y, w, h, angle?] in pixels on the pose canvas (angle in radians, turned around the box centre).
`;

/** Build the zip: <slug>/presenter.json, <slug>/poses/<name>.png, <slug>/README.md */
export async function exportPresenter(state, label) {
  const slug = slugify(label);
  const enc = new TextEncoder();
  const man = manifest(state, slug);
  const files = [];
  for (const n of state.names) files.push({ name: `${slug}/poses/${n}.png`, data: await pngBytes(state.mascot.imgs[n]) });
  files.push({ name: `${slug}/presenter.json`, data: enc.encode(JSON.stringify(man, null, 2) + '\n') });
  files.push({ name: `${slug}/README.md`, data: enc.encode(readme(slug, state.names)) });
  return { blob: zip(files), slug, manifest: man };
}
