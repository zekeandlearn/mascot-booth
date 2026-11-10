// Review sheet: crops every pose's face so mouth shapes and blinks can be checked by eye.
// ?mouth=<state>&blink=1
export default async (cs, lib) => {
  const q = new URLSearchParams(location.search);
  const mouth = q.get('mouth') || 'rest';
  const man = await (await fetch('/presenter/presenter.json')).json();
  const names = Object.keys(man.poses);
  const s = 1.25, cw = 340, ch = 280;
  names.forEach((n, i) => {
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;left:${(i % 4) * cw + 20}px;top:${Math.floor(i / 4) * (ch + 40) + 60}px;width:${cw - 10}px;height:${ch}px;overflow:hidden;background:#2a2d35;border-radius:10px`;
    const label = document.createElement('div');
    label.textContent = n + ' · ' + mouth;
    label.style.cssText = `position:absolute;left:${(i % 4) * cw + 24}px;top:${Math.floor(i / 4) * (ch + 40) + 24}px;font:600 22px var(--mono);color:#FF783E`;
    cs.world.append(box, label);
    // centre the crop on this pose's face (mouth + eye boxes); fall back to the old fixed region (x 190.., y 190..)
    const p = man.poses[n], boxes = [p.mouth, ...(p.eyes || [])].filter(Boolean);
    let fx = 190 + (cw - 10) / 2 / s, fy = 190 + ch / 2 / s;
    if (boxes.length) {
      const xs = boxes.flatMap(([x, , w]) => [x, x + w]), ys = boxes.flatMap(([, y, , h]) => [y, y + h]);
      fx = (Math.min(...xs) + Math.max(...xs)) / 2; fy = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    lib.presenter(cs, { src: '/presenter/', scale: s, x: (cw - 10) / 2 + (man.foot[0] - fx) * s, y: ch / 2 + (man.foot[1] - fy) * s, poses: [[0, n]], mouth: [[0, mouth]], layer: box, blinkAt: q.has('blink') });
  });
};
