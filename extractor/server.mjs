// Extracteur audio dédié Zeleph (optionnel) : à lancer sur une machine dont l'IP n'est pas bloquée par YouTube
// (PC perso, mini-serveur, VPS) et à exposer via Cloudflare Tunnel. Le Worker l'appelle si l'extraction directe échoue.
// GET|HEAD /audio/<id>  (Authorization: Bearer EXTRACTOR_TOKEN, Range accepté) → flux M4A/AAC relayé. GET /health → ok.
// Aucune dépendance npm : Node ≥ 20 + yt-dlp.
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
// Client VISIONOS forcé (testé le 24/11/2026) : avec un moteur JS, yt-dlp choisit sinon le client TV dont les URL renvoient 403.
const ARGS = (process.env.YTDLP_ARGS ?? '--extractor-args youtube:player_client=visionos').split(' ').filter(Boolean);
const TTL = 4 * 3600e3;
const VID = /^[A-Za-z0-9_-]{11}$/;
const cache = new Map();
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

// URL + User-Agent attendu par googlevideo (yt-dlp les fournit ensemble ; sans le bon UA certaines URL renvoient 403).
function resolve(id, fresh = false) {
  const hit = cache.get(id);
  if (!fresh && hit && hit.exp > Date.now()) return Promise.resolve(hit);
  return new Promise((ok, ko) => {
    execFile(YTDLP, ['-f', '140/bestaudio[ext=m4a]', '--no-playlist', '--no-warnings', ...ARGS, '--print', '%(url)s', '--print', '%(http_headers.User-Agent)s', `https://www.youtube.com/watch?v=${id}`], { timeout: 45000 }, (err, out, errOut) => {
      const [url, ua] = String(out ?? '').trim().split('\n');
      if (err || !url?.startsWith('https://')) return ko(new Error(`extraction impossible : ${lastLine(errOut || err?.message)}`));
      if (cache.size > 2000) cache.delete(cache.keys().next().value);
      const v = { url, ua: ua && ua !== 'NA' ? ua : 'Mozilla/5.0', exp: Date.now() + TTL };
      cache.set(id, v);
      ok(v);
    });
  });
}

// Safari iOS reste bloqué à 0:00 sur les M4A « DASH » fragmentés de YouTube (ftyp dash) : remux ffmpeg sans réencodage
// en M4A classique, moov en tête, gardé sur disque puis servi avec Range.
function remux(id) {
  if (jobs.has(id)) return jobs.get(id);
  const file = join(DIR, `${id}.m4a`);
  const p = stat(file).then(() => file, async () => {
    let why = '';
    for (let i = 0; i < 2; i++) {
      const s = await resolve(id, i > 0);
      const part = `${file}.part`;
      try {
        await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', '-user_agent', s.ua, '-i', s.url, '-vn', '-c', 'copy', '-movflags', '+faststart', '-f', 'ipod', part], { timeout: 120000 });
        await rename(part, file);
        prune();
        return file;
      } catch (e) { why = lastLine(e.stderr || e.message); await unlink(part).catch(() => {}); } // URL expirée : nouvelle extraction une fois
    }
    throw new Error(`remux impossible : ${why}`);
  }).finally(() => jobs.delete(id));
  jobs.set(id, p);
  return p;
}
// shortcut: on supprime les plus anciens fichiers créés (pas les moins écoutés), passer en LRU si le disque devient juste.
async function prune() {
  const names = (await readdir(DIR)).filter(n => n.endsWith('.m4a'));
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
  } catch (e) { console.error(m[1], e.message); res.statusCode = 502; res.end(e.message); }
}).listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`extracteur Zeleph sur ${process.env.HOST || '0.0.0.0'}:${PORT}`));
