// Extracteur audio dédié Zeleph (optionnel) : à lancer sur une machine dont l'IP n'est pas bloquée par YouTube
// (PC perso, mini-serveur, VPS) et à exposer via Cloudflare Tunnel. Le Worker l'appelle si l'extraction directe échoue.
// GET|HEAD /audio/<id>  (Authorization: Bearer EXTRACTOR_TOKEN, Range accepté) → flux M4A/AAC relayé. GET /health → ok.
// Aucune dépendance npm : Node ≥ 20 + yt-dlp.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';

const PORT = Number(process.env.PORT || 8788);
const TOKEN = process.env.EXTRACTOR_TOKEN || '';
const YTDLP = process.env.YTDLP || 'yt-dlp';
// Client VISIONOS forcé (testé le 24/11/2026) : avec un moteur JS, yt-dlp choisit sinon le client TV dont les URL renvoient 403.
const ARGS = (process.env.YTDLP_ARGS ?? '--extractor-args youtube:player_client=visionos').split(' ').filter(Boolean);
const TTL = 4 * 3600e3;
const VID = /^[A-Za-z0-9_-]{11}$/;
const cache = new Map();

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
    execFile(YTDLP, ['-f', '140/bestaudio[ext=m4a]', '--no-playlist', '--no-warnings', ...ARGS, '--print', '%(url)s', '--print', '%(http_headers.User-Agent)s', `https://www.youtube.com/watch?v=${id}`], { timeout: 45000 }, (err, out) => {
      const [url, ua] = String(out ?? '').trim().split('\n');
      if (err || !url?.startsWith('https://')) return ko(new Error('extraction impossible'));
      if (cache.size > 2000) cache.delete(cache.keys().next().value);
      const v = { url, ua: ua && ua !== 'NA' ? ua : 'Mozilla/5.0', exp: Date.now() + TTL };
      cache.set(id, v);
      ok(v);
    });
  });
}

createServer(async (req, res) => {
  const m = /^\/audio\/([^/?]+)/.exec(req.url ?? '');
  if (req.url === '/health') return res.end('ok');
  if (!m || !['GET', 'HEAD'].includes(req.method)) { res.statusCode = 404; return res.end(); }
  if (!authorized(req.headers.authorization)) { res.statusCode = 401; return res.end(); }
  if (!VID.test(m[1])) { res.statusCode = 400; return res.end(); }
  const range = /^bytes=\d*-\d*$/.test(req.headers.range ?? '') ? req.headers.range : undefined;
  try {
    for (let i = 0; i < 2; i++) {
      const s = await resolve(m[1], i > 0);
      const up = await fetch(s.url, { method: req.method, headers: { 'user-agent': s.ua, ...(range && { range }) } });
      if (!up.ok) { await up.body?.cancel(); continue; } // URL expirée : nouvelle extraction une fois
      res.writeHead(up.status, Object.fromEntries(['content-type', 'content-length', 'content-range', 'accept-ranges'].map(k => [k, up.headers.get(k)]).filter(([, v]) => v)));
      if (req.method === 'HEAD' || !up.body) return res.end();
      return Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
    }
    res.statusCode = 502; res.end();
  } catch (e) { console.error(m[1], e.message); res.statusCode = 502; res.end(); }
}).listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`extracteur Zeleph sur ${process.env.HOST || '0.0.0.0'}:${PORT}`));
