import { t, apply, setLang, getLang, POSES, CHATGPT_PROMPT, MOUTH_PROMPT } from './i18n.js';
import { loadImage, cutSheet, cutMouthSheet, guessFace } from './cutter.js';
import { Mascot, drawFrame, blinkSchedule, boxAABB } from './mascot.js';
import * as V from './voice.js';
import { exportVideo, download, canExport } from './export.js';
import { exportPresenter, slugify } from './presenter-export.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const S = {
  step: 1, sheet: null, names: [], faces: {}, mascot: null, mouths: null,
  audio: null, audioURL: null, mouth: [], segs: [], level: null, poses: [], blinks: [], duration: 0,
  faceIdx: 0, size: '9:16', bg: 'clear', bgColor: '#FF783E', scale: 0.62, pos: 'center', enter: 'pop',
  playing: false, t: 0, pickIdx: -1,
};
window.__mascotBooth = S; // handy for debugging in the console
const player = new Audio();

// ---------------- language + steps ----------------
$$('[data-lang]').forEach(b => b.onclick = () => setLang(b.dataset.lang));
$('#prompt').value = CHATGPT_PROMPT;
$('#mouthPrompt').value = MOUTH_PROMPT;
apply();
document.addEventListener('langchange', () => { renderPoseGrid(); renderFace(); renderTimeline(); });

const ready = n => n <= 2 || (n === 3 && !!S.mascot) || (n === 4 && !!S.mascot) || (n === 5 && !!S.mascot && !!S.audio);
function go(n) {
  if (!ready(n)) return;
  S.step = n;
  $$('section.step').forEach(s => s.classList.toggle('on', +s.dataset.step === n));
  $$('#steps button').forEach(b => { const k = +b.dataset.step; b.classList.toggle('on', k === n); b.classList.toggle('done', k < n && ready(k + 1)); b.disabled = !ready(k); });
  if (n === 3) renderFace();
  if (n === 5) { sizeStage(); renderTimeline(); drawStage(); }
  if (n !== 5) pause();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('[data-go]').forEach(b => b.onclick = () => go(+b.dataset.go));
$$('#steps button').forEach(b => b.onclick = () => go(+b.dataset.step));
go(1);

// ---------------- 1. prompt ----------------
$('#copyPrompt').onclick = async () => {
  try { await navigator.clipboard.writeText(CHATGPT_PROMPT); } catch { $('#prompt').select(); document.execCommand('copy'); }
  const b = $('#copyPrompt'); b.textContent = t('s1_copied'); setTimeout(() => (b.textContent = t('s1_copy')), 1600);
};
$('#copyMouthPrompt').onclick = async () => {
  try { await navigator.clipboard.writeText(MOUTH_PROMPT); } catch { $('#mouthPrompt').select(); document.execCommand('copy'); }
  const b = $('#copyMouthPrompt'); b.textContent = t('s1_copied'); setTimeout(() => (b.textContent = t('s1m_copy')), 1600);
};

// ---------------- 2. sheet ----------------
function dropzone(label, input, onFile) {
  label.addEventListener('dragover', e => { e.preventDefault(); label.classList.add('over'); });
  label.addEventListener('dragleave', () => label.classList.remove('over'));
  label.addEventListener('drop', e => { e.preventDefault(); label.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  input.addEventListener('change', () => input.files[0] && onFile(input.files[0]));
}
const status = (el, msg, kind = '') => { el.textContent = msg; el.className = 'status ' + kind; };

dropzone($('#sheetDrop'), $('#sheetFile'), async file => {
  const st = $('#sheetStatus');
  status(st, t('s2_working'));
  $('#poseGrid').innerHTML = '';
  await new Promise(r => setTimeout(r, 30));
  try {
    const img = await loadImage(file);
    const sheet = await cutSheet(img);
    const n = sheet.poses.length;
    if (n !== 6) { status(st, t('s2_expect', { n }), 'err'); S.sheet = null; S.mascot = null; $('#to3').disabled = true; go(2); return; }
    S.sheet = sheet; S.names = POSES.slice(); S.faces = {};
    S.names.forEach((name, i) => { S.faces[name] = guessFace(sheet.poses[i].canvas, sheet.foot); });
    buildMascot();
    status(st, t('s2_found', { n }) + ' · ' + t('s2_check'), 'ok');
    renderPoseGrid();
    $('#to3').disabled = false; go(2);
  } catch (e) { console.error(e); status(st, e.message, 'err'); }
});

// optional mouth sheet: 9 drawn mouths for lip sync
dropzone($('#mouthDrop'), $('#mouthFile'), async file => {
  const st = $('#mouthStatus'), grid = $('#mouthGrid');
  status(st, t('s2m_working')); grid.innerHTML = '';
  await new Promise(r => setTimeout(r, 30));
  try {
    const { mouths, found } = await cutMouthSheet(await loadImage(file));
    if (found !== 9 || mouths.length !== 9) { status(st, t('s2m_expect', { n: found }), 'err'); S.mouths = null; S.mascot?.setMouths(null); return; }
    S.mouths = mouths;
    S.mascot?.setMouths(mouths);
    mouths.forEach(m => grid.appendChild(thumb(m, 72, 44)));
    status(st, t('s2m_found'), 'ok');
  } catch (e) { console.error(e); status(st, e.message, 'err'); }
});

function buildMascot() {
  // faces are keyed by pose name; keep each face with its image when names are swapped
  S.mascot = new Mascot(S.sheet, S.names, S.faces, S.mouths);
  S.faceIdx = Math.min(S.faceIdx, S.names.length - 1);
}

function thumb(canvas, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const k = Math.min(w / canvas.width, h / canvas.height);
  g.drawImage(canvas, (w - canvas.width * k) / 2, (h - canvas.height * k) / 2, canvas.width * k, canvas.height * k);
  return c;
}

function renderPoseGrid() {
  const grid = $('#poseGrid'); grid.innerHTML = '';
  if (!S.sheet) return;
  S.sheet.poses.forEach((p, i) => {
    const card = document.createElement('div'); card.className = 'posecard'; card.style.animationDelay = i * 60 + 'ms';
    card.appendChild(thumb(p.canvas, 260, 340));
    const sel = document.createElement('select');
    POSES.forEach(name => { const o = document.createElement('option'); o.value = name; o.textContent = t('pose_' + name); sel.appendChild(o); });
    sel.value = S.names[i];
    sel.onchange = () => {
      // swap names so every pose name stays unique
      const j = S.names.indexOf(sel.value), old = S.names[i];
      const fi = S.faces[old], fj = S.faces[sel.value];
      S.names[j] = old; S.names[i] = sel.value;
      S.faces[sel.value] = fi; S.faces[old] = fj;
      buildMascot(); renderPoseGrid();
    };
    card.appendChild(sel); grid.appendChild(card);
  });
}

// ---------------- 3. face setup ----------------
const FC = $('#faceCanvas'), fg = FC.getContext('2d');
const PV = $('#facePreview'), pg = PV.getContext('2d');
let crop = null, drag = null;

// frame the whole head, found from the figure itself (not from the guessed boxes, which may be wrong)
const headCache = new Map();
function faceCrop(name) {
  const c = S.mascot.imgs[name];
  if (headCache.has(c)) return headCache.get(c);
  const W = c.width, H = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  let top = H;
  for (let y = 0; y < H && top === H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 128) { top = y; break; }
  const body = S.sheet.foot[1] - top, y1 = top + body * 0.36;
  let l = W, r = 0;
  for (let y = top; y < y1; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 128) { if (x < l) l = x; if (x > r) r = x; }
  const side = Math.max(r - l, y1 - top) * 1.08, cx = (l + r) / 2, cy = (top + y1) / 2;
  const out = { x: cx - side / 2, y: cy - side / 2, s: side };
  headCache.set(c, out);
  return out;
}

function renderFace() {
  if (!S.mascot || S.step !== 3) return;
  const name = S.names[S.faceIdx], f = S.faces[name];
  crop = faceCrop(name);
  $('#facePoseLabel').textContent = t('s3_pose', { i: S.faceIdx + 1, n: S.names.length }) + ' · ' + t('pose_' + name);
  $('#eyesClosed').checked = f.blinks === false;
  const k = FC.width / crop.s;
  fg.clearRect(0, 0, FC.width, FC.height);
  fg.imageSmoothingQuality = 'high';
  fg.drawImage(S.mascot.imgs[name], crop.x, crop.y, crop.s, crop.s, 0, 0, FC.width, FC.height);
  const box = (b, col, label) => {
    const { cx, cy, w, h, a } = boxView(b);
    fg.save(); fg.translate(cx, cy); fg.rotate(a);
    fg.fillStyle = col + '26'; fg.fillRect(-w / 2, -h / 2, w, h);
    fg.strokeStyle = col; fg.lineWidth = 3; fg.strokeRect(-w / 2, -h / 2, w, h);
    fg.fillStyle = col; fg.fillRect(w / 2 - 14, h / 2 - 14, 14, 14);
    // rotate handle: a stalk off the top edge with a round knob
    fg.lineWidth = 2; fg.beginPath(); fg.moveTo(0, -h / 2); fg.lineTo(0, -h / 2 - ROT_GAP); fg.stroke();
    fg.beginPath(); fg.arc(0, -h / 2 - ROT_GAP, 8, 0, Math.PI * 2); fg.fill();
    fg.strokeStyle = '#fff'; fg.lineWidth = 2; fg.stroke();
    fg.fillStyle = col; fg.font = '400 12px "Silkscreen"'; fg.fillText(label, -w / 2 + 2, -h / 2 - 6);
    fg.restore();
  };
  box(f.mouth, '#22c55e', t('s3_mouthbox'));
  if (f.blinks !== false) f.eyes.forEach((e, i) => box(e, '#38bdf8', t('s3_eyebox') + ' ' + (i + 1)));
  // thumbnails
  const th = $('#faceThumbs');
  if (th.children.length !== S.names.length) { th.innerHTML = ''; S.names.forEach((n, i) => { const b = document.createElement('button'); b.appendChild(thumb(S.mascot.imgs[n], 60, 52)); b.onclick = () => { S.faceIdx = i; crop = null; renderFace(); }; th.appendChild(b); }); }
  [...th.children].forEach((b, i) => b.classList.toggle('on', i === S.faceIdx));
}

let faceTool = 'mouth';
$$('#faceTool button').forEach(b => b.onclick = () => setTool(b.dataset.v));
function setTool(v) { faceTool = v; $$('#faceTool button').forEach(x => x.classList.toggle('on', x.dataset.v === v)); }

// a box on the editor canvas: centre, size and tilt in canvas pixels
const ROT_GAP = 26;
function boxView(b) {
  const k = FC.width / crop.s;
  return { cx: (b[0] + b[2] / 2 - crop.x) * k, cy: (b[1] + b[3] / 2 - crop.y) * k, w: b[2] * k, h: b[3] * k, a: b[4] || 0 };
}
// a canvas point in the box's own (untilted) frame, origin at its centre
function local(v, px, py) {
  const dx = px - v.cx, dy = py - v.cy, c = Math.cos(v.a), s = Math.sin(v.a);
  return [dx * c + dy * s, -dx * s + dy * c];
}
function hit(px, py) {
  const name = S.names[S.faceIdx], f = S.faces[name], pad = 10;
  const boxes = [['mouth', f.mouth], ...(f.blinks === false ? [] : f.eyes.map((e, i) => ['eye' + i, e]))];
  const views = boxes.map(([id, b]) => { const v = boxView(b); return { id, b, v, l: local(v, px, py) }; });
  for (const { id, b, v, l: [u, w] } of views) if (Math.hypot(u, w + v.h / 2 + ROT_GAP) < 13) return { id, b, mode: 'rotate' };
  for (const { id, b, v, l: [u, w] } of views) if (Math.abs(u - v.w / 2) < 16 && Math.abs(w - v.h / 2) < 16) return { id, b, mode: 'size' };
  for (const { id, b, v, l: [u, w] } of views) if (Math.abs(u) <= v.w / 2 + pad && Math.abs(w) <= v.h / 2 + pad) return { id, b, mode: 'move' };
  return null;
}
// is there open-mouth art (tongue-pink) inside the box? then this pose talks with its own mouth
function hasOpenMouth(canvas, box) {
  const [x, y, w, h] = boxAABB(box);
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h)).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 180 && d[i] - d[i + 1] > 80 && Math.abs(d[i + 1] - d[i + 2]) < 32) n++;
  return n > (w * h) * 0.03;
}
const pos = e => { const r = FC.getBoundingClientRect(); return [(e.clientX - r.left) * FC.width / r.width, (e.clientY - r.top) * FC.height / r.height]; };
const toSprite = (px, py) => [crop.x + px * crop.s / FC.width, crop.y + py * crop.s / FC.height];
FC.addEventListener('pointerdown', e => {
  const [x, y] = pos(e); const h = hit(x, y);
  FC.setPointerCapture(e.pointerId);
  if (h) { drag = { ...h, x0: x, y0: y, start: h.b.slice() }; setTool(h.id); }
  else drag = { id: faceTool, mode: 'draw', x0: x, y0: y };
  FC.style.cursor = 'grabbing';
});
FC.addEventListener('pointermove', e => {
  const [x, y] = pos(e);
  if (!drag) { const h = hit(x, y); FC.style.cursor = h ? ({ size: 'nwse-resize', rotate: 'grab' }[h.mode] || 'move') : 'crosshair'; return; }
  const f = S.faces[S.names[S.faceIdx]];
  if (drag.mode === 'draw') {
    const [ax, ay] = toSprite(drag.x0, drag.y0), [bx, by] = toSprite(x, y);
    const box = [Math.round(Math.min(ax, bx)), Math.round(Math.min(ay, by)), Math.round(Math.abs(bx - ax)), Math.round(Math.abs(by - ay))];
    if (box[2] < 4 || box[3] < 4) return;
    if (drag.id === 'mouth') f.mouth = box; else { f.blinks = true; f.eyes[+drag.id.slice(3)] = box; }
  } else {
    const k = crop.s / FC.width, dx = (x - drag.x0) * k, dy = (y - drag.y0) * k, b = drag.b, s0 = drag.start;
    if (drag.mode === 'move') { b[0] = Math.round(s0[0] + dx); b[1] = Math.round(s0[1] + dy); }
    else if (drag.mode === 'rotate') {
      // knob sits straight above the centre, so the tilt is the pointer's angle from the centre minus "up"
      const v = boxView(s0);
      let a = Math.atan2(y - v.cy, x - v.cx) + Math.PI / 2;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const step = e.shiftKey ? Math.PI / 12 : 0;
      if (step) a = Math.round(a / step) * step;
      else if (Math.abs(a) < 0.05) a = 0; // snap back to straight
      if (a) b[4] = +a.toFixed(4); else b.length = 4;
    } else {
      // resize in the box's own frame, keeping its (tilted) top-left corner where it was
      const a = s0[4] || 0, c = Math.cos(a), sn = Math.sin(a);
      const w = Math.max(8, Math.round(s0[2] + dx * c + dy * sn)), h = Math.max(6, Math.round(s0[3] - dx * sn + dy * c));
      const dw = (w - s0[2]) / 2, dh = (h - s0[3]) / 2;
      const cx = s0[0] + s0[2] / 2 + dw * c - dh * sn, cy = s0[1] + s0[3] / 2 + dw * sn + dh * c;
      b[0] = Math.round(cx - w / 2); b[1] = Math.round(cy - h / 2); b[2] = w; b[3] = h;
    }
  }
  renderFace();
});
FC.addEventListener('pointerup', () => {
  if (!drag) return;
  const name = S.names[S.faceIdx], f = S.faces[name], drew = drag.mode === 'draw';
  if (drag.id === 'mouth') f.open = hasOpenMouth(S.mascot.imgs[name], f.mouth);
  if (drew) setTool({ mouth: 'eye0', eye0: 'eye1', eye1: 'mouth' }[drag.id]);
  drag = null; FC.style.cursor = 'crosshair';
  S.mascot.prepare(name);
  // closed-mouth poses borrow the first open mouth: refresh them too
  S.names.forEach(n => { if (!S.faces[n].open) S.mascot.prepare(n); });
  renderFace();
});
// double-click the round knob to straighten a box
FC.addEventListener('dblclick', e => {
  const [x, y] = pos(e), h = hit(x, y);
  if (!h || h.mode !== 'rotate') return;
  h.b.length = 4;
  const name = S.names[S.faceIdx];
  S.mascot.prepare(name); S.names.forEach(n => { if (!S.faces[n].open) S.mascot.prepare(n); });
  renderFace();
});
// Export for Claude Code: the mascot as a Mascot Booth presenter folder (zip)
$('#ccExport').onclick = async () => {
  if (!S.mascot) return;
  const st = $('#ccStatus'), b = $('#ccExport');
  b.disabled = true; status(st, t('s3_cc_working'));
  try {
    const { blob, slug } = await exportPresenter(S, $('#ccName').value);
    download(blob, `${slug}-presenter.zip`);
    status(st, t('s3_cc_done', { f: `${slug}-presenter.zip` }), 'ok');
  } catch (e) { console.error(e); status(st, e.message, 'err'); }
  finally { b.disabled = false; }
};
$('#ccName').addEventListener('change', e => { e.target.value = e.target.value.trim() ? slugify(e.target.value) : ''; });
$('#eyesClosed').onchange = e => { const n = S.names[S.faceIdx]; S.faces[n].blinks = !e.target.checked; S.mascot.prepare(n); renderFace(); };
$('#facePrev').onclick = () => { S.faceIdx = (S.faceIdx + S.names.length - 1) % S.names.length; crop = null; renderFace(); };
$('#faceNext').onclick = () => { S.faceIdx = (S.faceIdx + 1) % S.names.length; crop = null; renderFace(); };

// live talking preview of the current pose
const DEMO = ['closed', 'small', 'open', 'mid', 'wide', 'small', 'round', 'open', 'closed', 'fv', 'mid', 'open', 'rest', 'rest'];
(function previewLoop(now) {
  requestAnimationFrame(previewLoop);
  if (S.step !== 3 || !S.mascot || !crop) return;
  const name = S.names[S.faceIdx], tt = now / 1000;
  const mouth = DEMO[Math.floor(tt / 0.11) % DEMO.length];
  const blink = (tt % 1.6) < 0.12;
  const comp = S.mascot.compose(name, mouth, blink);
  pg.clearRect(0, 0, PV.width, PV.height);
  const side = crop.s, ar = PV.height / PV.width, h = side * ar;
  pg.imageSmoothingQuality = 'high';
  pg.drawImage(comp, crop.x, crop.y - (h - side) * 0.3, side, h, 0, 0, PV.width, PV.height);
})(0);

// ---------------- 4. voice ----------------
$$('#voiceTabs button').forEach(b => b.onclick = () => {
  $$('#voiceTabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.tab').forEach(x => (x.hidden = x.dataset.tab !== b.dataset.tab));
});

async function useAudio(blob, letters = null) {
  const st = $('#voiceStatus');
  status(st, t('s4_working'));
  try {
    const audio = await V.decode(blob);
    const an = V.analyze(audio);
    S.level = an.level;
    S.segs = letters ? V.segsFromLetters(letters) : V.speech(an);
    S.mouth = letters ? V.mouthFromLetters(letters) : V.mouthFromLevel(an, S.segs);
    S.audio = audio;
    S.duration = +(audio.duration + 0.8).toFixed(2);
    S.poses = V.autoPoses(S.segs, S.duration);
    S.blinks = blinkSchedule(S.duration);
    if (S.audioURL) URL.revokeObjectURL(S.audioURL);
    S.audioURL = URL.createObjectURL(blob);
    const pl = $('#voicePlayer'); pl.src = S.audioURL; pl.hidden = false;
    status(st, t('s4_ready', { s: audio.duration.toFixed(1) }), 'ok');
    // own recordings can get letter-exact timing; ElevenLabs takes already have it
    $('#sharpCard').hidden = !!letters;
    status($('#sharpStatus'), '');
    $('#sharpLang').value = getLang() === 'tl' ? 'tl' : 'en';
    $('#to5').disabled = false; go(4);
  } catch (e) { console.error(e); status(st, e.message, 'err'); }
}
dropzone($('#audioFile').parentElement, $('#audioFile'), f => useAudio(f));

$('#sharpGo').onclick = async () => {
  const st = $('#sharpStatus'), btn = $('#sharpGo');
  if (!S.audio) return;
  btn.disabled = true;
  const pct = d => d == null ? '' : Math.round(d * 100) + '%';
  let stage = '';
  try {
    const r = await V.sharpen(S.audio, $('#sharpText').value, $('#sharpLang').value, u => {
      if (u.type === 'stage') stage = u.stage;
      status(st, t('s4s_' + (u.stage || stage), { p: pct(u.done) }));
    });
    S.segs = V.segsFromLetters(r.letters);
    S.mouth = V.mouthFromLetters(r.letters);
    S.poses = V.autoPoses(S.segs, S.duration);
    const n = r.text.split(' ').length;
    if (r.score < -3) status(st, t('s4s_weak'), 'err');
    else status(st, t('s4s_done', { n }) + (r.heard ? '  ' + t('s4s_heard', { t: r.text.length > 120 ? r.text.slice(0, 120) + '…' : r.text }) : ''), 'ok');
  } catch (e) {
    console.error(e);
    status(st, e.message === 'no_speech' ? t('s4s_no_speech') : e.message, 'err');
  } finally { btn.disabled = false; }
};

// a ready-made voice, so anyone can try the app before recording: already letter-timed, so the mouth is sharp
$('#sampleVoice').onclick = async () => {
  const st = $('#voiceStatus');
  status(st, t('s4_working'));
  try {
    const [blob, j] = await Promise.all([fetch('assets/sample/voice.mp3').then(r => r.blob()), fetch('assets/sample/voice.json').then(r => r.json())]);
    await useAudio(blob, V.lettersFromAlignment(j.alignment));
    status(st, t('s4_sample_ready', { s: S.audio.duration.toFixed(1) }), 'ok');
  } catch (e) { console.error(e); status(st, e.message, 'err'); }
};

let rec = null, recT0 = 0, recTimer = 0;
$('#recBtn').onclick = async () => {
  const b = $('#recBtn');
  if (!rec) {
    try { rec = await V.startRecording(); } catch (e) { status($('#voiceStatus'), e.message, 'err'); return; }
    b.classList.add('on'); b.querySelector('span').textContent = t('s4_rec_stop');
    recT0 = performance.now(); recTimer = setInterval(() => ($('#recTime').textContent = ((performance.now() - recT0) / 1000).toFixed(1) + 's'), 100);
  } else {
    const blob = await rec.stop(); rec = null; clearInterval(recTimer);
    b.classList.remove('on'); b.querySelector('span').textContent = t('s4_rec_start');
    useAudio(blob);
  }
};

$('#elLoad').onclick = async () => {
  const st = $('#voiceStatus');
  try {
    const voices = await V.elevenVoices($('#elKey').value.trim());
    const sel = $('#elVoice'); sel.innerHTML = '';
    voices.forEach(v => { const o = document.createElement('option'); o.value = v.id; o.textContent = v.name; sel.appendChild(o); });
    status(st, `${voices.length} voices`, 'ok');
  } catch (e) { status(st, e.message, 'err'); }
};
$('#elGo').onclick = async () => {
  const st = $('#voiceStatus'), key = $('#elKey').value.trim(), voice = $('#elVoice').value, text = $('#elText').value.trim();
  if (!key || !voice || !text) { status(st, 'Add your key, pick a voice, and type what to say.', 'err'); return; }
  status(st, t('s4_el_working'));
  try {
    const { blob, alignment } = await V.elevenSpeak(key, voice, text);
    await useAudio(blob, V.lettersFromAlignment(alignment));
  } catch (e) { status(st, e.message, 'err'); }
};

// ---------------- 5. studio ----------------
const SC = $('#stageCanvas'), sg = SC.getContext('2d');
const SIZES = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] };

function sizeStage() {
  const [W, H] = SIZES[S.size];
  SC.width = W / 2; SC.height = H / 2;
  $('#stage').classList.toggle('checker', S.bg === 'clear');
}
const params = (W, H, forExport) => ({
  W, H, mascot: S.mascot, poses: S.poses, mouth: S.mouth, blinks: S.blinks, size: S.scale, pos: S.pos, enter: S.enter,
  bg: forExport === 'webm' ? 'clear' : forExport === 'mp4' && S.bg === 'clear' ? 'green' : S.bg, bgColor: S.bgColor,
});
function drawStage() {
  if (!S.mascot || !S.audio) return;
  drawFrame(sg, S.t, params(SC.width, SC.height));
  $('#clock').textContent = S.t.toFixed(1) + 's';
  $('#playhead').style.left = (S.t / S.duration * 100) + '%';
}
function loop() {
  if (!S.playing) return;
  S.t = player.ended ? S.duration : player.currentTime;
  if (S.t >= S.duration - 0.05 || player.ended) { pause(); S.t = 0; }
  drawStage();
  requestAnimationFrame(loop);
}
function play() {
  if (!S.audioURL) return;
  if (player.src !== S.audioURL) player.src = S.audioURL;
  player.currentTime = Math.min(S.t, S.audio.duration - 0.01); player.play();
  S.playing = true; $('#playBtn').textContent = t('s5_pause'); loop();
}
function pause() { S.playing = false; player.pause(); $('#playBtn').textContent = t('s5_play'); }
$('#playBtn').onclick = () => (S.playing ? pause() : play());

const seg = (id, key, after) => $$(`#${id} button`).forEach(b => b.onclick = () => { $$(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); S[key] = b.dataset.v; after?.(); drawStage(); });
seg('sizeSeg', 'size', () => { sizeStage(); });
seg('posSeg', 'pos');
seg('enterSeg', 'enter', () => { S.t = 0; });
$$('#bgSwatches .sw').forEach(b => b.addEventListener('click', () => { $$('#bgSwatches .sw').forEach(x => x.classList.toggle('on', x === b)); S.bg = b.dataset.v || 'custom'; sizeStage(); drawStage(); }));
$('#bgColor').addEventListener('input', e => { S.bgColor = e.target.value; S.bg = 'custom'; $$('#bgSwatches .sw').forEach(x => x.classList.toggle('on', x.classList.contains('custom'))); sizeStage(); drawStage(); });
$('#scaleRange').oninput = e => { S.scale = +e.target.value; drawStage(); };

function renderTimeline() {
  if (!S.audio || S.step !== 5) return;
  const wc = $('#waveCanvas'), tl = $('#timeline');
  wc.width = tl.clientWidth * 2; wc.height = tl.clientHeight * 2;
  const g = wc.getContext('2d'); g.clearRect(0, 0, wc.width, wc.height);
  const n = S.level.length, bw = wc.width / n;
  g.fillStyle = 'rgba(246,243,238,.28)';
  for (let i = 0; i < n; i++) { const v = S.level[i] * (wc.height * 0.38); g.fillRect(i * bw, wc.height - 14 - v, Math.max(1, bw - 0.5), v); }
  const pb = $('#poseBlocks'); pb.innerHTML = '';
  S.poses.forEach(([t0, name], i) => {
    const t1 = S.poses[i + 1]?.[0] ?? S.duration;
    const d = document.createElement('div'); d.className = 'pblock';
    d.style.left = (t0 / S.duration * 100) + '%'; d.style.width = `calc(${((t1 - t0) / S.duration * 100)}% - 3px)`;
    d.appendChild(thumb(S.mascot.imgs[name] || S.mascot.imgs[S.names[0]], 26, 32));
    const s = document.createElement('span'); s.textContent = t('pose_' + name); d.appendChild(s);
    d.onclick = e => { e.stopPropagation(); openPick(i); };
    pb.appendChild(d);
  });
}
$('#timeline').addEventListener('click', e => {
  const r = $('#timeline').getBoundingClientRect();
  S.t = Math.max(0, Math.min(S.duration, (e.clientX - r.left) / r.width * S.duration));
  if (S.playing) play(); drawStage();
});
function openPick(i) {
  const box = $('#posePick'); box.hidden = false; box.innerHTML = `<b>${t('pick_pose')}</b>`;
  S.names.forEach(name => {
    const b = document.createElement('button'); if (S.poses[i][1] === name) b.classList.add('on');
    b.appendChild(thumb(S.mascot.imgs[name], 54, 70));
    const s = document.createElement('span'); s.textContent = t('pose_' + name); b.appendChild(s);
    b.onclick = () => { S.poses[i][1] = name; box.hidden = true; S.t = S.poses[i][0] + 0.01; renderTimeline(); drawStage(); };
    box.appendChild(b);
  });
}
addEventListener('resize', () => renderTimeline());

async function doExport(kind) {
  if (!canExport()) { status($('#expStatus'), t('s5_unsupported'), 'err'); return; }
  pause();
  const [W, H] = SIZES[S.size];
  const bar = $('#expProgress'), st = $('#expStatus');
  $$('.export').forEach(b => (b.disabled = true)); bar.hidden = false;
  try {
    const p = params(W, H, kind);
    const blob = await exportVideo({ kind, W, H, fps: 30, duration: S.duration, audio: S.audio, draw: (g, tt) => drawFrame(g, tt, p),
      onProgress: k => { bar.firstElementChild.style.width = (k * 100).toFixed(0) + '%'; status(st, t('s5_exporting', { p: Math.round(k * 100) })); } });
    download(blob, `my-mascot-${S.size.replace(':', 'x')}.${kind}`);
    status(st, t('s5_done'), 'ok');
  } catch (e) { console.error(e); status(st, e.message, 'err'); }
  finally { $$('.export').forEach(b => (b.disabled = false)); setTimeout(() => (bar.hidden = true), 1500); }
}
$('#expAlpha').onclick = () => doExport('webm');
$('#expMp4').onclick = () => doExport('mp4');
