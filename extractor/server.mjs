// Extracteur audio dédié Zeleph : à lancer sur une machine dont l'IP n'est pas bloquée par YouTube (Northflank, VPS, PC perso).
// GET|HEAD /audio/<id>  (Authorization: Bearer EXTRACTOR_TOKEN, Range accepté) → M4A classique (lisible par Safari iOS). GET /health → ok.
// Aucune dépendance npm : Node ≥ 20 + yt-dlp + ffmpeg.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const PORT = Number(process.env.PORT || 8788);
const TOKEN = process.env.EXTRACTOR_TOKEN || '';
const YTDLP = process.env.YTDLP || 'yt-dlp';
// Moteurs essayés dans l'ordre (repli automatique) : VISIONOS sans moteur JS (testé le 24/11/2026), puis les clients
// par défaut de yt-dlp avec Node pour les défis JavaScript de YouTube.
const ENGINES = [
  (process.env.YTDLP_ARGS ?? '--extractor-args youtube:player_client=visionos').split(' ').filter(Boolean),
  ['--js-runtimes', 'node', '--extractor-args', 'youtube:player_client=default'],
];
const VID = /^[A-Za-z0-9_-]{11}$/;
const DIR = join(tmpdir(), 'zeleph-audio');
const MAX_FILES = Number(process.env.MAX_FILES || 300);
const jobs = new Map();
const run = promisify(execFile);
const lastLine = s => String(s ?? '').trim().split('\n').pop().slice(0, 300); // raison lisible renvoyée au Worker (logs privés)
await mkdir(DIR, { recursive: true });

if (TOKEN.length < 24) { console.error('EXTRACTOR_TOKEN manquant ou trop court (24 caractères min.)'); process.exit(1); }

const authorized = h => {
  const got = Buffer.from(String(h ?? '').replace(/^Bearer /, '')), want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
};

// yt-dlp télécharge lui-même (morceaux, reprises, pas de bridage), puis ffmpeg remuxe en local sans réencodage :
// le M4A « DASH » fragmenté de YouTube (ftyp dash) bloque Safari iOS à 0:00 ; ici M4A classique, moov en tête.
function remux(id) {
  if (jobs.has(id)) return jobs.get(id);
  const file = join(DIR, `${id}.m4a`), dl = join(DIR, `${id}.dl.m4a`), part = `${file}.part`;
  const p = stat(file).then(() => file, async () => {
    let why = '';
    for (const args of ENGINES) {
      try {
        await run(YTDLP, ['-f', '140/bestaudio[ext=m4a]', '--no-playlist', '--no-warnings', '--no-progress', '--force-overwrites',
          '--retries', '3', '--socket-timeout', '15', ...args, '-o', dl, `https://www.youtube.com/watch?v=${id}`], { timeout: 60000 });
        await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-i', dl, '-vn', '-c', 'copy', '-movflags', '+faststart', '-f', 'ipod', part], { timeout: 30000 });
        await rename(part, file);
        prune();
        return file;
      } catch (e) { why = lastLine(e.stderr || e.message); }
      finally { await unlink(dl).catch(() => {}); await unlink(part).catch(() => {}); }
    }
    throw new Error(why || 'extraction impossible');
  }).finally(() => jobs.delete(id));
  jobs.set(id, p);
  return p;
}
// shortcut: on supprime les plus anciens fichiers créés (pas les moins écoutés), passer en LRU si le disque devient juste.
async function prune() {
  const names = (await readdir(DIR)).filter(n => /^[\w-]{11}\.m4a$/.test(n));
  if (names.length <= MAX_FILES) return;
  const files = await Promise.all(names.map(async n => ({ n, t: (await stat(join(DIR, n)).catch(() => ({ mtimeMs: 0 }))).mtimeMs })));
  files.sort((a, b) => a.t - b.t).slice(0, names.length - MAX_FILES).forEach(f => unlink(join(DIR, f.n)).catch(() => {}));
}

function serve(req, res, file, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  const ranged = !!(m && (m[1] || m[2]));
  let start = 0, end = size - 1;
  if (ranged) {
    if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], size - 1); } else start = Math.max(0, size - +m[2]);
    if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
  }
  res.writeHead(ranged ? 206 : 200, { 'content-type': 'audio/mp4', 'accept-ranges': 'bytes', 'content-length': end - start + 1, ...(ranged && { 'content-range': `bytes ${start}-${end}/${size}` }) });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}

createServer(async (req, res) => {
  const m = /^\/audio\/([^/?]+)/.exec(req.url ?? '');
  if (req.url === '/health') return res.end('ok');
  if (!m || !['GET', 'HEAD'].includes(req.method)) { res.statusCode = 404; return res.end(); }
  if (!authorized(req.headers.authorization)) { res.statusCode = 401; return res.end(); }
  if (!VID.test(m[1])) { res.statusCode = 400; return res.end(); }
  try {
    const file = await remux(m[1]);
    serve(req, res, file, (await stat(file)).size);
  } catch (e) { console.error(m[1], e.message); res.statusCode = 422; res.end(e.message); } // pas 5xx : le proxy remplacerait le corps (« error code: 502 »)
}).listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`extracteur Zeleph sur ${process.env.HOST || '0.0.0.0'}:${PORT}`));
