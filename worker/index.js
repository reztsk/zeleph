// Point d'entrée du Worker Zeleph : /api/* → API, le reste → fichiers statiques de la PWA (binding ASSETS).
import { HttpError, fail, json, one, imageResponse, ID_RE } from './util.js';
import * as auth from './auth.js';
import * as social from './social.js';
import * as lib from './library.js';
import * as yt from './yt.js';
import { stream } from './stream.js';
import { lyrics } from './lyrics.js';

const P = 'public', A = 'auth', S = 'stream'; // S : session (cookie) ou jeton de flux signé (?t=)
// Version déployée (tools/deploy.mjs → APP_VERSION) ; « dev » en local.
export const appVersion = env => String(env.APP_VERSION || 'dev').replace(/[^\w.-]/g, '');
const STAMPED = new Set(['/sw.js', '/js/update.js']);
// [méthode, motif, accès, action(c, ...paramètres)]
const ROUTES = [
  ['GET', /^\/api\/version$/, P, c => ({ version: appVersion(c.env) })],
  ['GET', /^\/api\/handle\/([^/]+)$/, P, (c, h) => auth.handleAvailable(c, decodeURIComponent(h))],
  ['POST', /^\/api\/auth\/signup$/, P, auth.signup],
  ['POST', /^\/api\/auth\/login$/, P, auth.login],
  ['POST', /^\/api\/auth\/forgot$/, P, auth.forgot],
  ['POST', /^\/api\/auth\/verify$/, P, auth.verify],
  ['POST', /^\/api\/auth\/resend$/, P, auth.resend],
  ['POST', /^\/api\/auth\/logout$/, P, auth.logout],
  ['GET', /^\/api\/me$/, A, c => ({ me: auth.me(c.user) })],
  ['PUT', /^\/api\/me$/, A, auth.putMe],
  ['POST', /^\/api\/me\/password$/, A, auth.changePassword],

  ['GET', /^\/api\/users$/, A, social.searchUsers],
  ['GET', /^\/api\/users\/([^/]+)$/, A, (c, h) => social.profile(c, decodeURIComponent(h), lib.summaries)],
  ['GET', /^\/api\/friends$/, A, social.friendsList],
  ['POST', /^\/api\/friends\/([^/]+)$/, A, (c, h) => social.friendAdd(c, decodeURIComponent(h))],
  ['DELETE', /^\/api\/friends\/([^/]+)$/, A, (c, h) => social.friendRemove(c, decodeURIComponent(h))],

  ['GET', /^\/api\/library$/, A, lib.library],
  ['POST', /^\/api\/playlists$/, A, lib.createPlaylist],
  ['GET', /^\/api\/playlists\/([\w-]+)$/, A, lib.getPlaylist],
  ['PUT', /^\/api\/playlists\/([\w-]+)$/, A, lib.putPlaylist],
  ['DELETE', /^\/api\/playlists\/([\w-]+)$/, A, lib.deletePlaylist],
  ['POST', /^\/api\/playlists\/([\w-]+)\/tracks$/, A, lib.addTrack],
  ['DELETE', /^\/api\/playlists\/([\w-]+)\/tracks\/([\w-]+)$/, A, lib.removeTrack],
  ['POST', /^\/api\/playlists\/([\w-]+)\/share$/, A, lib.sharePlaylist],
  ['GET', /^\/api\/likes$/, A, lib.likes],
  ['GET', /^\/api\/likes\/ids$/, A, lib.likeIds],
  ['PUT', /^\/api\/likes\/([\w-]+)$/, A, lib.like],
  ['DELETE', /^\/api\/likes\/([\w-]+)$/, A, lib.unlike],
  ['POST', /^\/api\/history$/, A, lib.addHistory],
  ['GET', /^\/api\/home$/, A, home],

  ['GET', /^\/api\/search$/, A, c => yt.search(c.env, c.url.searchParams.get('q'), c.url.searchParams.get('type') || 'all')],
  ['GET', /^\/api\/artist\/([\w-]+)$/, A, (c, id) => yt.artist(c.env, id)],
  ['GET', /^\/api\/collection\/([\w-]+)$/, A, (c, id) => yt.collection(c.env, id)],
  ['GET', /^\/api\/radio\/([\w-]+)$/, A, async (c, id) => ({ tracks: await yt.radio(c.env, id) })],
  ['GET', /^\/api\/lyrics$/, A, c => lyrics(c.env, Object.fromEntries(c.url.searchParams))],
  ['GET', /^\/api\/stream-token$/, A, auth.streamToken],
  ['GET', /^\/api\/stream\/([\w-]+)$/, S, stream],
  ['HEAD', /^\/api\/stream\/([\w-]+)$/, S, stream],

  ['GET', /^\/api\/img\/u\/([^/]+)$/, A, async (c, h) => imageResponse((await one(c.db, 'SELECT avatar FROM users WHERE handle = ?1', auth.handle(decodeURIComponent(h))))?.avatar)],
  ['GET', /^\/api\/img\/p\/([\w-]+)$/, A, async (c, id) => imageResponse(ID_RE.test(id) ? (await one(c.db, 'SELECT cover FROM playlists WHERE id = ?1', id))?.cover : null)],
];

// Accueil : récemment écoutés, « dans ton style » (radio du dernier titre), sélections YouTube Music, playlists des amis.
async function home(c) {
  const recent = await lib.recent(c, 20);
  const safe = p => p.catch(e => { console.error('accueil', e.message); return []; });
  const seen = new Set(recent.map(t => t.id));
  const [forYou, featured, friends] = await Promise.all([
    recent.length ? safe(yt.radio(c.env, recent[0].id)).then(l => l.filter(t => !seen.has(t.id)).slice(0, 20)) : [],
    safe(yt.featured(c.env)),
    lib.friendsPlaylists(c),
  ]);
  return { recent, forYou, featured, friends };
}

export async function handle(req, env, ctx) {
  const url = new URL(req.url);
  const c = { req, env, ctx, url, db: env.DB, now: Date.now(), body: {}, user: null, setCookie: null };
  try {
    const route = ROUTES.find(r => r[0] === req.method && r[1].test(url.pathname));
    if (!route) fail(ROUTES.some(r => r[1].test(url.pathname)) ? 405 : 404, 'not_found', 'Introuvable');
    if (!['GET', 'HEAD'].includes(req.method)) {
      // Anti-CSRF : JSON obligatoire (un formulaire tiers ne peut pas l'envoyer sans pré-vol CORS) + même origine.
      const origin = req.headers.get('origin');
      if (origin && origin !== url.origin) fail(403, 'bad_origin', 'Origine refusée');
      const raw = await req.text();
      if (raw.length > 450000) fail(413, 'too_big', 'Requête trop volumineuse');
      if (raw) {
        if (!/^application\/json\b/.test(req.headers.get('content-type') ?? '')) fail(415, 'bad_type', 'JSON attendu');
        try { c.body = JSON.parse(raw) ?? {}; } catch { fail(400, 'bad_json', 'JSON invalide'); }
        if (typeof c.body !== 'object' || Array.isArray(c.body)) fail(400, 'bad_json', 'JSON invalide');
      }
    }
    c.user = await auth.authenticate(c);
    if ((route[2] === A && !c.user) || (route[2] === S && !c.user && !(await auth.streamAllowed(c)))) fail(401, 'unauthorized', 'Connexion requise');
    const out = await route[3](c, ...url.pathname.match(route[1]).slice(1));
    const res = out instanceof Response ? out : json(out);
    if (c.setCookie) res.headers.append('set-cookie', c.setCookie);
    return res;
  } catch (e) {
    if (e instanceof HttpError) {
      const res = json({ error: e.code, message: e.message }, e.status);
      if (c.setCookie) res.headers.append('set-cookie', c.setCookie);
      return res;
    }
    console.error('erreur API', url.pathname, e?.stack ?? e);
    return json({ error: 'server', message: 'Erreur serveur, réessaie' }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handle(request, env, ctx);
    if (!STAMPED.has(pathname)) return env.ASSETS.fetch(request);
    // URL seule : jamais de 304 sur un fichier dont le contenu dépend de la version déployée.
    const res = await env.ASSETS.fetch(request.url);
    if (!res.ok) return res;
    const h = new Headers(res.headers);
    h.set('cache-control', 'no-cache'); h.delete('etag'); h.delete('content-length');
    return new Response((await res.text()).replaceAll('__APP_VERSION__', appVersion(env)), { status: 200, headers: h });
  },
};
