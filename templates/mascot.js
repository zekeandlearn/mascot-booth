// A mascot-only clip: your presenter talking, nothing else. All the directing lives in direction.json (poses, place,
// size, flips, entrance and exit, keyed to spoken words), so it can be written, checked and hand-edited as data.
// Renders with a transparent background by default: layer it over anything in CapCut, Premiere or Canva.
export default async (cs, lib) => {
  const { M } = lib;
  const dir = await (await fetch('/film/direction.json')).json().catch(() => { throw new Error('direction.json is missing or not valid JSON'); });
  const man = await (await fetch('/presenter/presenter.json')).json().catch(() => { throw new Error('no presenter: set "presenter" in film.json'); });
  const W = cs.W, H = cs.H, POSES = Object.keys(man.poses);

  // ---------- vocabulary ----------
  const SIZES = { small: 0.45, medium: 0.62, large: 0.8 };               // share of the frame height the body fills
  const PLACES = { left: 0.27, center: 0.5, right: 0.73 };               // where the feet stand, share of the width
  const MOVES = ['glide', 'cut'], ENTERS = ['pop', 'pixel', 'slide', 'none'];
  const BACKGROUNDS = { clear: 'transparent', green: '#00B140', dark: '#15171C', light: '#F6F3EE' };
  const warnings = [];
  const fail = (where, msg) => { throw new Error(`direction.json ${where}: ${msg}`); };
  const size = (v, where) => {
    if (typeof v === 'number' && v >= 0.15 && v <= 1.3) return v;
    if (SIZES[v]) return SIZES[v];
    fail(where, `size "${v}" is not one of ${Object.keys(SIZES).join(', ')} (or a number 0.15..1.3)`);
  };
  const place = (v, where) => {
    if (typeof v === 'number' && v >= 0 && v <= 1) return v * W;
    if (PLACES[v] != null) return PLACES[v] * W;
    fail(where, `place "${v}" is not one of ${Object.keys(PLACES).join(', ')} (or a number 0..1)`);
  };
  const pose = (v, where) => (POSES.includes(v) ? v : fail(where, `pose "${v}" is not one of this mascot's poses: ${POSES.join(', ')}`));
  /** When a beat happens: { t } in seconds, or { at: 'phrase', after?, n? } on the voice, minus lead (default 0.1s). */
  const when = (b, where, lead = 0.1) => {
    let t;
    if (typeof b.t === 'number') t = b.t;
    else if (typeof b.at === 'string') {
      try { t = cs.at(b.at, { after: b.after ?? -1, n: b.n ?? 1 }); } catch (e) { fail(where, `"${b.at}"${b.after != null ? ` after ${b.after}s` : ''} is not in the take (check words.json)`); }
    } else fail(where, 'needs "at" (a spoken phrase) or "t" (seconds)');
    return Math.max(0, +(t - (b.lead ?? lead)).toFixed(3));
  };

  // ---------- defaults ----------
  const bg = dir.background ?? 'clear';
  cs.root.style.background = BACKGROUNDS[bg] || bg;
  const base = size(dir.size ?? 'medium', 'size');
  const scale = (base * H) / man.foot[1] * 0.98;
  const FOOT = Math.round(H * 0.95);
  const startPose = pose(dir.pose ?? POSES[0], 'pose');
  let x = place(dir.place ?? 'center', 'place'), z = 1, flip = false;

  // ---------- beats -> tracks ----------
  const beats = (dir.beats || []).map((b, i) => ({ ...b, i, time: when(b, `beat ${i + 1}`) })).sort((a, b) => a.time - b.time);
  const poses = [[0, startPose]], moves = [[0, x, FOOT]], zooms = [[0, 1]], flips = [[0, false]];
  const log = [];
  let lastPose = { t: 0, name: startPose };
  for (const b of beats) {
    const where = `beat ${b.i + 1}${b.at ? ` ("${b.at}")` : ''}`, t = b.time, row = { t, word: b.at ?? null };
    if (b.pose != null) {
      const p = pose(b.pose, where);
      if (t - lastPose.t < 0.9 && t > 0) warnings.push(`${where}: "${lastPose.name}" only holds ${(t - lastPose.t).toFixed(2)}s before "${p}" (aim for 1.5s+)`);
      poses.push([t, p]); lastPose = { t, name: p }; row.pose = p;
    }
    if (b.place != null) {
      const nx = place(b.place, where), how = b.move ?? 'glide';
      if (!MOVES.includes(how)) fail(where, `move "${how}" is not one of ${MOVES.join(', ')}`);
      if (how === 'cut') moves.push([t, x, FOOT, M.ease.linear], [t + 0.001, nx, FOOT, M.ease.linear]);
      else { const d = b.duration ?? 0.6; moves.push([t, x, FOOT], [t + d, nx, FOOT, M.ease.inOutCubic]); }
      x = nx; row.place = b.place; row.move = how;
    }
    if (b.size != null) {
      const nz = size(b.size, where) / base, d = b.duration ?? 0.5;
      zooms.push([t, z], [t + d, nz, M.ease.inOutCubic]); z = nz; row.size = b.size;
    }
    if (b.flip != null) { flip = !!b.flip; flips.push([t, flip]); row.flip = flip; }
    if (b.note) row.note = b.note;
    log.push(row);
  }

  // ---------- entrance and exit ----------
  const enter = dir.enter === null ? { style: 'none' } : { style: 'pop', t: 0, ...(dir.enter || {}) };
  const exit = dir.exit ? { style: 'pixel', ...dir.exit } : null;
  if (!ENTERS.includes(enter.style)) fail('enter', `style "${enter.style}" is not one of ${ENTERS.join(', ')}`);
  if (exit && !ENTERS.includes(exit.style)) fail('exit', `style "${exit.style}" is not one of ${ENTERS.join(', ')}`);
  const tIn = enter.style === 'none' ? 0 : when(enter, 'enter', 0.25), tOut = exit ? when(exit, 'exit', 0) : null;
  // Keyframes must stay in time order, so enter/exit keys replace whatever the tracks hold before tIn / after tOut.
  const zAt = t => M.keys(t, zooms), xAt = t => M.keys(t, moves.map(([tt, mx, my, e]) => [tt, [mx, my], e]))[0];
  const IN = enter.style === 'pop' ? 0.45 : enter.style === 'slide' ? 0.55 : 0;
  const below = FOOT + man.height * scale * 1.4 + 40; // fully under the frame, even at a large size
  let zTrack = zooms, mTrack = moves;
  const opts = {};
  if (enter.style === 'pixel') opts.enter = tIn;
  if (enter.style === 'pop') zTrack = [[0, 0.001], [tIn, 0.001], [tIn + IN, zAt(tIn + IN), M.ease.outBack], ...zTrack.filter(k => k[0] > tIn + IN)];
  if (enter.style === 'slide') { const sx = xAt(tIn + IN); mTrack = [[0, sx, below], [tIn, sx, below], [tIn + IN, sx, FOOT, M.ease.outCubic], ...mTrack.filter(k => k[0] > tIn + IN)]; }
  if (exit) {
    if (tOut < tIn + IN) fail('exit', `happens at ${tOut}s, before the entrance has finished (${(tIn + IN).toFixed(2)}s)`);
    if (exit.style === 'pixel') opts.exit = tOut;
    if (exit.style === 'pop') { const z0 = M.keys(tOut, zTrack); zTrack = [...zTrack.filter(k => k[0] < tOut), [tOut, z0], [tOut + 0.3, 0.001, M.ease.inCubic]]; }
    if (exit.style === 'slide') { const ex = M.keys(tOut, mTrack.map(([tt, mx, my, e]) => [tt, [mx, my], e]))[0]; mTrack = [...mTrack.filter(k => k[0] < tOut), [tOut, ex, FOOT], [tOut + 0.5, ex, below, M.ease.inCubic]]; }
    const late = beats.filter(b => b.time > tOut);
    if (late.length) warnings.push(`${late.length} beat(s) come after the exit at ${tOut}s and won't be seen`);
  }

  // render sharp enough for the biggest size it reaches
  const zMax = Math.max(1, ...zTrack.map(k => k[1]));
  const host = lib.presenter(cs, { src: '/presenter/', scale, res: Math.min(2.5, Math.max(1.25, zMax * 1.25)), poses, moves: mTrack, zooms: zTrack, flips, hop: dir.hop ?? ['cheer', 'wave', 'whoa', 'laugh'], ...opts });
  if (!(dir.shadow ?? bg !== 'clear')) host.el.node.querySelector('.cs-presenter-shadow').style.display = 'none';

  // for `mascot-booth direction <film>`: the resolved timeline and any warnings
  window.__direction = { duration: cs.duration, poses: POSES, enter: { ...enter, t: tIn }, exit: exit && { ...exit, t: tOut }, beats: log, warnings };
};
