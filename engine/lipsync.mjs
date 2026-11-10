// Lip sync from text timing, not from loudness: every spoken letter has a start and end time, so the mouth knows
// which shape to make (M/B/P close, F/V bite, O/U round, E/I wide, A open) and exactly when. Written for
// phonetic spellings, which suits Tagalog and Taglish well.

const SHAPE = {
  a: 'open', e: 'wide', i: 'wide', y: 'wide', o: 'round', u: 'round', w: 'round',
  m: 'closed', b: 'closed', p: 'closed', f: 'fv', v: 'fv',
  l: 'mid', r: 'mid', h: 'mid', j: 'mid',
};
const PRIORITY = { closed: 5, open: 4, wide: 4, round: 4, fv: 3, mid: 2, small: 1 };

export function shapeOf(c, next = '') {
  c = c.toLowerCase();
  if (c === 'o' && next === 'o') return 'round';
  if (c === 'e' && next === 'e') return 'wide';
  if (/[a-zà-ÿ]/.test(c)) return SHAPE[c.normalize('NFKD')[0]] || 'small';
  if (/[0-9]/.test(c)) return 'mid';
  return null; // space, punctuation
}

/**
 * letters: [{ c, s, e }] from the voice alignment. Returns { fps, track: [[t, shape]] } where shape 'rest' hands the
 * face back to the pose's own drawn expression (long pauses), 'closed' is a short closure between words.
 */
export function buildMouth(letters, { fps = 30, restGap = 0.35, endPad = 0.06 } = {}) {
  // spoken segments with a shape
  const segs = [];
  letters.forEach((l, i) => {
    const sh = shapeOf(l.c, letters[i + 1]?.c || '');
    if (sh && l.e > l.s) segs.push({ s: l.s, e: l.e, sh });
  });
  if (!segs.length) return { fps, track: [[0, 'rest']] };
  const end = segs[segs.length - 1].e + 0.5;
  const track = [];
  let j = 0;
  for (let f = 0; f * (1 / fps) < end; f++) {
    const a = f / fps, b = a + 1 / fps;
    while (j < segs.length && segs[j].e < a - 0.2) j++;
    let best = null, bestScore = 0;
    for (let k = j; k < segs.length && segs[k].s < b; k++) {
      const ov = Math.min(b, segs[k].e) - Math.max(a, segs[k].s);
      if (ov <= 0) continue;
      const score = ov * PRIORITY[segs[k].sh] * (segs[k].sh === 'closed' && ov < 0.35 / fps ? 0.3 : 1);
      if (score > bestScore) { bestScore = score; best = segs[k].sh; }
    }
    if (!best) {
      // silence: closed for a short gap, the pose's own face for a long pause
      const prev = segs.filter(s => s.e <= a).pop(), next = segs.find(s => s.s >= b);
      const gap = (next ? next.s : Infinity) - (prev ? prev.e : -Infinity);
      best = gap > restGap && (a - (prev ? prev.e : -1) > endPad) ? 'rest' : 'closed';
    }
    track.push([+(a).toFixed(4), best]);
  }
  // merge runs; drop single-frame flickers between two equal shapes
  for (let i = 1; i < track.length - 1; i++) if (track[i - 1][1] === track[i + 1][1] && track[i][1] !== track[i - 1][1] && track[i][1] !== 'closed') track[i][1] = track[i - 1][1];
  const out = [];
  for (const k of track) if (!out.length || out[out.length - 1][1] !== k[1]) out.push(k);
  return { fps, track: out };
}
