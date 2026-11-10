// Tiny static server for the player. Routes:
//   /_cs/...        engine runtime (engine/runtime)
//   /_fonts/...     bundled OFL fonts (node_modules/@fontsource)
//   /film/...       the film folder
//   /presenter/...  the presenter folder named in film.json
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(ENGINE, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4' };

function resolveFontDir() {
  // fontsource packages may be hoisted next to the package (when installed as a dependency) or inside it
  for (const p of [path.join(ROOT, 'node_modules/@fontsource'), path.resolve(ROOT, '../@fontsource')]) if (fs.existsSync(p)) return p;
  return path.join(ROOT, 'node_modules/@fontsource');
}

export function readFilm(filmDir) {
  return JSON.parse(fs.readFileSync(path.join(filmDir, 'film.json'), 'utf8'));
}

export function presenterDir(filmDir) {
  if (process.env.MASCOT_BOOTH_PRESENTER) return path.resolve(process.env.MASCOT_BOOTH_PRESENTER); // override, e.g. for tests/presenter-review
  const film = readFilm(filmDir);
  if (!film.presenter) return null;
  const p = film.presenter.replace(/^~(?=$|\/)/, process.env.HOME);
  return path.resolve(filmDir, p);
}

export function serve(filmDir, port = 0) {
  const mounts = [
    ['/_cs/', path.join(ENGINE, 'runtime')],
    ['/_fonts/', resolveFontDir()],
    ['/film/', path.resolve(filmDir)],
  ];
  const pdir = presenterDir(filmDir);
  if (pdir) mounts.push(['/presenter/', pdir]);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === '/index.html') { res.writeHead(302, { location: '/_cs/player.html' }); return res.end(); }
    for (const [pre, dir] of mounts) {
      if (!url.startsWith(pre)) continue;
      const file = path.join(dir, url.slice(pre.length));
      if (!file.startsWith(dir)) break;
      return fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('not found: ' + url); }
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
        fs.createReadStream(file).pipe(res);
      });
    }
    res.writeHead(404); res.end('not found: ' + url);
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}` })));
}
