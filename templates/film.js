// A starter film. Replace the scenes with your storyboard. Every time comes from the voice: cs.at('phrase').
export default (cs, lib) => {
  const { M, fx, type, blocks } = lib;
  const hasVoice = cs.words.length > 0;
  const at = (p, fallback) => (hasVoice ? cs.at(p) : fallback);

  fx.starfield(cs, { bottom: 0.78 });
  fx.glows(cs, [{ x: cs.W * 0.25, y: cs.H * 0.3, r: 380, color: 'var(--accent)', a: 0.2 }]);
  fx.gridFloor(cs, { horizon: Math.round(cs.H * 0.75) });

  if (cs.film.presenter) {
    lib.presenter(cs, { src: '/presenter/', scale: 0.8, res: 2, enter: 0.4, x: cs.W / 2, y: Math.round(cs.H * 0.93), poses: [[0, 'idle']] });
  }
  if (hasVoice) type.captions(cs, { from: 0, to: cs.duration, y: Math.round(cs.H * 0.78) });

  cs.scene({ from: 0, to: cs.duration, in: 'rise', out: 'blur' }, s => {
    s.push(0, cs.duration, 1, 1.05);
    type.kicker(s, { text: 'MASCOT BOOTH', x: 0, width: cs.W, align: 'center', y: 260, at: 0.2 });
    type.title(s, { text: 'Your story,\nlanding on every word.', x: 60, y: 330, width: cs.W - 120, size: 110, align: 'center', style: 'rise', hl: ['every'], at: hasVoice ? undefined : [0.5, 0.62, 0.9, 1.02, 1.14, 1.26] });
  });
  fx.finish(cs);
};
