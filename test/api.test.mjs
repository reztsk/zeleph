// Tests API : le vrai Worker (worker/index.js) sur une base D1 simulée (node:sqlite).
// Brevo, YouTube, googlevideo et LRCLIB sont simulés : on vérifie la forme exacte des appels sortants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { handle } from '../worker/index.js';
import { createD1 } from './d1-shim.mjs';

const fx = n => readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8');
const db = createD1();
const env = { DB: db, BREVO_API_KEY: 'cle-de-test', BREVO_SENDER_EMAIL: 'noreply@zeleph.test' };
const mails = [], calls = [], pending = [];
let gvFail = 0;

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(url);
  if (url === 'https://api.brevo.com/v3/smtp/email') {
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['api-key'], 'cle-de-test');
    const b = JSON.parse(init.body);
    assert.equal(b.sender.email, 'noreply@zeleph.test');
    mails.push({ to: b.to[0].email, code: /\b(\d{6})\b/.exec(b.textContent)[1], subject: b.subject });
    return new Response('{"messageId":"x"}', { status: 201 });
  }
  if (url.startsWith('https://music.youtube.com/youtubei/v1/search')) return new Response(fx(JSON.parse(init.body).params?.startsWith('EgWKAQIg') ? 'search-artists' : JSON.parse(init.body).params?.startsWith('EgeK') ? 'search-playlists' : 'search-songs'));
  if (url.startsWith('https://music.youtube.com/youtubei/v1/next')) return new Response(fx('next'));
  if (url.startsWith('https://music.youtube.com/youtubei/v1/browse')) {
    const id = JSON.parse(init.body).browseId;
    return new Response(fx(id === 'FEmusic_home' ? 'home' : id.startsWith('UC') ? 'artist' : id.startsWith('MPRE') ? 'album' : 'playlist'));
  }
  if (url === 'https://www.youtube.com/sw.js_data') {
    const inner = Array(14).fill(null); inner[13] = 'VISITEUR';
    return new Response(`)]}'${JSON.stringify([[0, 0, [[inner]]]])}`);
  }
  if (url.startsWith('https://www.youtube.com/youtubei/v1/player')) {
    const b = JSON.parse(init.body), client = b.context.client.clientName;
    assert.ok(['VISIONOS', 'IOS'].includes(client));
    if (client === 'VISIONOS') assert.equal(b.context.client.visitorData, 'VISITEUR');
    if (client === 'VISIONOS' && b.videoId === 'BOTBLOCKED1') return Response.json({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Connectez-vous pour confirmer que vous n\'êtes pas un robot' } });
    const len = b.videoId.startsWith('BIG') || b.videoId === 'BOTBLOCKED1' ? 3000000 : 4000;
    return Response.json({ playabilityStatus: { status: 'OK' }, streamingData: { adaptiveFormats: [
      { itag: 251, mimeType: 'audio/webm; codecs="opus"', url: 'https://rr1.googlevideo.test/webm', bitrate: 1 },
      { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', url: `https://rr1.googlevideo.test/videoplayback?id=${b.videoId}&c=${client}&len=${len}&expire=${Math.floor(Date.now() / 1e3) + 21600}`, bitrate: 130000, contentLength: String(len) },
    ] } });
  }
  if (url.startsWith('https://rr1.googlevideo.test/')) {
    if (gvFail > 0) { gvFail--; return new Response('', { status: 403 }); }
    const q = new URL(url).searchParams, total = +q.get('len');
    const [, a, b] = /bytes=(\d+)-(\d*)/.exec(init.headers?.range ?? `bytes=0-${total - 1}`);
    if (q.get('c') === 'IOS' && +a >= 1048576) return new Response('', { status: 403 }); // comportement réel : PO token exigé au-delà du 1er Mo
    const end = b === '' ? total - 1 : Math.min(+b, total - 1), len = end - +a + 1;
    return new Response(new Uint8Array(len).fill(7), { status: 206, headers: { 'content-type': 'audio/mp4', 'content-length': String(len), 'content-range': `bytes ${a}-${end}/${total}` } });
  }
  if (url.startsWith('https://extracteur.test/audio/')) {
    assert.equal(init.headers.authorization, 'Bearer jeton-extracteur');
    if (url.endsWith('EXTFAIL0001')) return new Response('extraction impossible : Sign in to confirm', { status: 422 });
    return new Response(new Uint8Array(2).fill(7), { status: 206, headers: { 'content-type': 'audio/mp4', 'content-length': '2', 'content-range': 'bytes 0-1/5000' } });
  }
  if (url.startsWith('https://lrclib.net/api/get')) return Response.json({ syncedLyrics: '[00:01.00]Ligne une\n[00:05.00]Ligne deux', plainLyrics: 'Ligne une\nLigne deux', duration: 178 });
  return realFetch(input, init);
};

const ctx = { waitUntil: p => pending.push(p) };
async function call(method, path, { body, cookie, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['content-type'] ??= 'application/json';
  if (cookie) h.cookie = cookie;
  const res = await handle(new Request(`https://zeleph.test/api${path}`, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) }), env, ctx);
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : null;
  const sc = res.headers.get('set-cookie');
  return { status: res.status, data, res, cookie: sc ? sc.split(';')[0] : null, setCookie: sc };
}
async function account(handleName, email, password = 'motdepasse1') {
  const s = await call('POST', '/auth/signup', { body: { handle: handleName, email, password } });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const v = await call('POST', '/auth/verify', { body: { challenge: s.data.challenge, code: mails.at(-1).code } });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return v.cookie;
}
const TRACK = { id: 'Tk-vgRMoPnY', title: 'Jefe', artists: [{ name: 'Ninho', id: 'UCBNTNHPngOpC-yeC8VpAPJQ' }], album: { name: 'Jefe', id: 'MPREb_09DO8gDztAC' }, thumb: 'https://yt3.googleusercontent.com/a=w544-h544-l90-rj', dur: 178, explicit: true };
const TRACK2 = { ...TRACK, id: 'v0tkYHRqjbI', title: 'Goutte d\'eau', explicit: false };
let A, B;

test('Inscription : @pseudo, OTP Brevo, activation, cookie de session', async () => {
  assert.deepEqual((await call('GET', '/handle/Enzo_1')).data, { handle: 'enzo_1', available: true });
  assert.equal((await call('GET', '/handle/a-b')).status, 400);
  const s = await call('POST', '/auth/signup', { body: { handle: 'enzo_1', email: 'Enzo@Test.fr', password: 'motdepasse1' } });
  assert.equal(s.status, 200);
  assert.equal(s.data.demo, undefined, 'jamais de code renvoyé au client');
  assert.equal(mails.at(-1).to, 'enzo@test.fr');
  assert.match(mails.at(-1).subject, /Zeleph/);
  assert.equal((await call('GET', '/me', { cookie: 'zl=x' })).status, 401, 'pas de compte avant validation');
  assert.equal((await call('POST', '/auth/verify', { body: { challenge: s.data.challenge, code: mails.at(-1).code === '000000' ? '111111' : '000000' } })).status, 401);
  const v = await call('POST', '/auth/verify', { body: { challenge: s.data.challenge, code: mails.at(-1).code } });
  assert.equal(v.status, 200);
  assert.equal(v.data.me.handle, 'enzo_1');
  assert.match(v.setCookie, /HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
  assert.equal((await call('POST', '/auth/verify', { body: { challenge: s.data.challenge, code: mails.at(-1).code } })).status, 410, 'code à usage unique');
  A = v.cookie;
  assert.equal((await call('GET', '/me', { cookie: A })).data.me.email, 'enzo@test.fr');
  assert.equal((await call('GET', '/handle/enzo_1')).data.available, false);
  assert.equal((await call('POST', '/auth/signup', { body: { handle: 'enzo_1', email: 'autre@test.fr', password: 'motdepasse1' } })).status, 409);
  assert.equal((await call('POST', '/auth/signup', { body: { handle: 'autre', email: 'enzo@test.fr', password: 'motdepasse1' } })).status, 409);
  assert.equal((await call('POST', '/auth/signup', { body: { handle: 'court', email: 'x@test.fr', password: '123' } })).status, 400);
});

test('Brevo indisponible : 503, et échec d\'envoi = demande annulée', async () => {
  assert.equal((await handle(new Request('https://zeleph.test/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: 'zz_z', email: 'z@test.fr', password: 'motdepasse1' }) }), { DB: db }, ctx)).status, 503);
  const n = (await db.prepare('SELECT COUNT(*) n FROM otps').first()).n;
  const before = globalThis.fetch;
  globalThis.fetch = async (u, i) => (String(u).includes('brevo') ? new Response('{}', { status: 401 }) : before(u, i));
  assert.equal((await call('POST', '/auth/signup', { body: { handle: 'zz_z', email: 'z@test.fr', password: 'motdepasse1' } })).status, 502);
  globalThis.fetch = before;
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM otps').first()).n, n, 'aucune demande orpheline');
});

test('Connexion : e-mail ou @pseudo, erreurs neutres, anti force brute', async () => {
  assert.equal((await call('POST', '/auth/login', { body: { login: 'enzo@test.fr', password: 'faux-mdp-1' } })).status, 401);
  assert.equal((await call('POST', '/auth/login', { body: { login: 'inconnu', password: 'faux-mdp-1' } })).data.message, 'Identifiant ou mot de passe incorrect');
  const r = await call('POST', '/auth/login', { body: { login: '@Enzo_1', password: 'motdepasse1' } });
  assert.equal(r.status, 200);
  assert.ok(r.cookie);
  assert.equal((await call('GET', '/me', { cookie: A })).status, 200, 'plusieurs appareils connectés');
  for (let i = 0; i < 8; i++) await call('POST', '/auth/login', { body: { login: 'cible', password: 'x' } });
  assert.equal((await call('POST', '/auth/login', { body: { login: 'cible', password: 'x' } })).status, 429);
});

test('Mot de passe oublié : OTP → nouveau mot de passe → reconnecté, anciennes sessions fermées', async () => {
  const before = mails.length;
  const u = await call('POST', '/auth/forgot', { body: { email: 'inconnu@test.fr' } });
  assert.equal(u.status, 200);
  assert.ok(u.data.challenge, 'même réponse pour un e-mail inconnu');
  await Promise.all(pending.splice(0));
  assert.equal(mails.length, before, 'aucun e-mail pour un compte inexistant');
  const f = await call('POST', '/auth/forgot', { body: { email: 'enzo@test.fr' } });
  await Promise.all(pending.splice(0));
  assert.equal(mails.at(-1).to, 'enzo@test.fr');
  assert.equal((await call('POST', '/auth/verify', { body: { challenge: f.data.challenge, code: mails.at(-1).code, password: 'court' } })).status, 400, 'mot de passe validé avant de consommer le code');
  const v = await call('POST', '/auth/verify', { body: { challenge: f.data.challenge, code: mails.at(-1).code, password: 'nouveaumdp2' } });
  assert.equal(v.status, 200);
  assert.ok(v.cookie, 'reconnexion immédiate');
  assert.equal((await call('GET', '/me', { cookie: A })).status, 401, 'ancien téléphone déconnecté');
  A = v.cookie;
  assert.equal((await call('POST', '/auth/login', { body: { login: 'enzo_1', password: 'nouveaumdp2' } })).status, 200);
  const r = await call('POST', '/auth/resend', { body: { challenge: f.data.challenge } });
  assert.equal(r.status, 410, 'demande déjà consommée');
});

test('Profil : nom, thème, avatar (image servie), changement de mot de passe, déconnexion', async () => {
  const p = await call('PUT', '/me', { cookie: A, body: { name: 'Enzo', theme: 'sakura-nuit', avatar: 'data:image/jpeg;base64,/9j/4AAQ' } });
  assert.equal(p.status, 200);
  assert.equal(p.data.me.theme, 'sakura-nuit');
  assert.match(p.data.me.avatar, /^\/api\/img\/u\/enzo_1\?v=\d+$/);
  const img = await call('GET', p.data.me.avatar.replace('/api', ''), { cookie: A });
  assert.equal(img.res.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await img.res.arrayBuffer())].slice(0, 3), [0xff, 0xd8, 0xff]);
  assert.equal((await call('PUT', '/me', { cookie: A, body: { theme: 'inexistant' } })).status, 400);
  assert.equal((await call('PUT', '/me', { cookie: A, body: { avatar: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await call('POST', '/me/password', { cookie: A, body: { current: 'faux', next: 'encoreunmdp3' } })).status, 401);
  assert.equal((await call('POST', '/me/password', { cookie: A, body: { current: 'nouveaumdp2', next: 'encoreunmdp3' } })).status, 200);
  const other = (await call('POST', '/auth/login', { body: { login: 'enzo_1', password: 'encoreunmdp3' } })).cookie;
  const out = await call('POST', '/auth/logout', { cookie: other });
  assert.match(out.setCookie, /Max-Age=0/);
  assert.equal((await call('GET', '/me', { cookie: other })).status, 401);
  assert.equal((await call('GET', '/me', { cookie: A })).status, 200);
});

test('Sécurité : JSON obligatoire, origine étrangère refusée, accès sans session refusé', async () => {
  assert.equal((await call('POST', '/playlists', { cookie: A, raw: 'name=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415);
  assert.equal((await call('POST', '/playlists', { cookie: A, body: { name: 'x' }, headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await call('GET', '/search?q=ninho')).status, 401);
  assert.equal((await call('GET', '/stream/Tk-vgRMoPnY')).status, 401);
  assert.equal((await call('GET', '/nope', { cookie: A })).status, 404);
});

test('Amis : recherche @pseudo, demande, acceptation, refus, retrait', async () => {
  B = await account('lea_music', 'lea@test.fr');
  const C = await account('sam', 'sam@test.fr');
  const s = await call('GET', '/users?q=@lea', { cookie: A });
  assert.deepEqual(s.data.users.map(u => [u.handle, u.rel]), [['lea_music', 'none']]);
  assert.equal((await call('POST', '/friends/lea_music', { cookie: A })).data.rel, 'outgoing');
  assert.deepEqual((await call('GET', '/friends', { cookie: B })).data.incoming.map(u => u.handle), ['enzo_1']);
  assert.equal((await call('POST', '/friends/enzo_1', { cookie: B })).data.rel, 'friend', 'accepter');
  assert.deepEqual((await call('GET', '/friends', { cookie: A })).data.friends.map(u => u.handle), ['lea_music']);
  await call('POST', '/friends/enzo_1', { cookie: C });
  assert.equal((await call('DELETE', '/friends/sam', { cookie: A })).data.rel, 'none', 'refuser');
  assert.equal((await call('GET', '/friends', { cookie: A })).data.incoming.length, 0);
  assert.equal((await call('POST', '/friends/enzo_1', { cookie: A })).status, 400, 'pas soi-même');
  assert.equal((await call('POST', '/friends/personne', { cookie: A })).status, 404);
});

test('Playlists : création, titres, photo, recherche d\'accès, partage, visibilité, suppression', async () => {
  const c = await call('POST', '/playlists', { cookie: A, body: { name: 'Rap FR', track: TRACK } });
  assert.equal(c.status, 200);
  const id = c.data.playlist.id;
  assert.equal(c.data.playlist.count, 1);
  assert.equal(c.data.playlist.cover, TRACK.thumb, 'pochette du 1er titre par défaut');
  assert.equal((await call('POST', `/playlists/${id}/tracks`, { cookie: A, body: { track: TRACK2 } })).data.added, true);
  assert.equal((await call('POST', `/playlists/${id}/tracks`, { cookie: A, body: { track: TRACK2 } })).data.added, false, 'pas de doublon');
  assert.equal((await call('POST', `/playlists/${id}/tracks`, { cookie: A, body: { track: { id: 'bad' } } })).status, 400);
  const g = await call('GET', `/playlists/${id}`, { cookie: A });
  assert.deepEqual(g.data.tracks.map(t => t.title), ['Jefe', 'Goutte d\'eau']);
  assert.equal(g.data.tracks[0].explicit, true);
  assert.equal((await call('GET', `/playlists/${id}`, { cookie: B })).status, 404, 'privée');
  const cov = await call('PUT', `/playlists/${id}`, { cookie: A, body: { cover: 'data:image/png;base64,iVBORw0KGgo=' } });
  assert.match(cov.data.playlist.cover, /^\/api\/img\/p\//);
  assert.equal((await call('POST', `/playlists/${id}/share`, { cookie: A, body: { handles: ['sam'] } })).status, 400, 'partage aux amis seulement');
  assert.deepEqual((await call('POST', `/playlists/${id}/share`, { cookie: A, body: { handles: ['@lea_music'] } })).data.sharedWith, ['lea_music']);
  assert.equal((await call('GET', `/playlists/${id}`, { cookie: B })).status, 200, 'partagée');
  assert.deepEqual((await call('GET', '/library', { cookie: B })).data.shared.map(p => p.name), ['Rap FR']);
  assert.equal((await call('PUT', `/playlists/${id}`, { cookie: B, body: { name: 'Piraté' } })).status, 403);
  assert.equal((await call('DELETE', `/playlists/${id}/tracks/Tk-vgRMoPnY`, { cookie: B })).status, 403);
  const priv = await call('POST', '/playlists', { cookie: A, body: { name: 'Secret' } });
  assert.deepEqual((await call('GET', '/users/enzo_1', { cookie: B })).data.playlists.map(p => p.name), ['Rap FR'], 'profil ami : partagées seulement');
  await call('PUT', `/playlists/${priv.data.playlist.id}`, { cookie: A, body: { public: true } });
  assert.equal((await call('GET', '/users/enzo_1', { cookie: B })).data.playlists.length, 2, 'publique visible par les amis');
  const sam = (await call('POST', '/auth/login', { body: { login: 'sam', password: 'motdepasse1' } })).cookie;
  assert.equal((await call('GET', '/users/enzo_1', { cookie: sam })).data.playlists.length, 0, 'non-ami : rien');
  assert.equal((await call('GET', `/playlists/${priv.data.playlist.id}`, { cookie: sam })).status, 404);
  assert.equal((await call('DELETE', `/playlists/${id}/tracks/Tk-vgRMoPnY`, { cookie: A })).status, 200);
  assert.equal((await call('GET', `/playlists/${id}`, { cookie: A })).data.tracks.length, 1);
  assert.equal((await call('DELETE', '/friends/lea_music', { cookie: B })).status, 400, 'pas soi-même');
  await call('DELETE', '/friends/enzo_1', { cookie: B });
  assert.equal((await call('GET', `/playlists/${id}`, { cookie: B })).status, 404, 'plus amis = plus d\'accès');
  assert.equal((await call('DELETE', `/playlists/${id}`, { cookie: A })).status, 200);
  assert.equal((await call('GET', `/playlists/${id}`, { cookie: A })).status, 404);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM playlist_tracks WHERE playlist_id = ?1').bind(id).first()).n, 0);
});

test('Favoris, historique, accueil (récents + dans ton style + sélections)', async () => {
  assert.equal((await call('PUT', `/likes/${TRACK.id}`, { cookie: A, body: { track: TRACK } })).data.liked, true);
  assert.equal((await call('PUT', `/likes/${TRACK2.id}`, { cookie: A, body: { track: TRACK } })).status, 400, 'id incohérent');
  assert.deepEqual((await call('GET', '/likes/ids', { cookie: A })).data.ids, [TRACK.id]);
  await call('POST', '/history', { cookie: A, body: { track: TRACK2 } });
  await call('POST', '/history', { cookie: A, body: { track: TRACK } });
  const h = await call('GET', '/home', { cookie: A });
  assert.equal(h.status, 200);
  assert.deepEqual(h.data.recent.map(t => t.id), [TRACK.id, TRACK2.id]);
  assert.ok(h.data.forYou.length > 5 && !h.data.forYou.some(t => t.id === TRACK.id || t.id === TRACK2.id), 'pas de titres déjà écoutés');
  assert.ok(h.data.featured.length > 0);
  await call('DELETE', `/likes/${TRACK.id}`, { cookie: A });
  assert.deepEqual((await call('GET', '/likes', { cookie: A })).data.tracks, []);
});

test('Musique : recherche, artiste, album, playlist YouTube, radio, paroles', async () => {
  const s = await call('GET', '/search?q=ninho%20jefe', { cookie: A });
  assert.ok(s.data.songs.length > 5 && s.data.artists.length && s.data.playlists.length);
  assert.equal((await call('GET', '/search?q=x&type=bad', { cookie: A })).status, 400);
  assert.equal((await call('GET', '/artist/UCBNTNHPngOpC-yeC8VpAPJQ', { cookie: A })).data.name, 'Ninho');
  assert.equal((await call('GET', '/collection/MPREb_09DO8gDztAC', { cookie: A })).data.kind, 'album');
  assert.ok((await call('GET', '/collection/VLRDCLAK5uy_ncNOYjq7OOSZeazddJXSe-s9wXgjTG5uw', { cookie: A })).data.tracks.length > 10);
  assert.ok((await call('GET', '/radio/Tk-vgRMoPnY', { cookie: A })).data.tracks.every(t => t.id !== 'Tk-vgRMoPnY'));
  const l = await call('GET', '/lyrics?title=Jefe%20(Clip%20officiel)&artist=Ninho&dur=178', { cookie: A });
  assert.match(l.data.synced, /\[00:01.00\]Ligne une/);
  assert.ok(calls.some(u => u.startsWith('https://lrclib.net/api/get?') && u.includes('track_name=Jefe&')), 'titre nettoyé');
});

test('Flux audio : M4A, Range 206 (Safari iOS), cache ~4 h, nouvelle résolution si URL refusée', async () => {
  const players = () => calls.filter(u => u.includes('/youtubei/v1/player')).length;
  const n0 = players();
  const r = await call('GET', '/stream/Tk-vgRMoPnY', { cookie: A, headers: { range: 'bytes=0-1' } });
  assert.equal(r.status, 206);
  assert.equal(r.res.headers.get('content-type'), 'audio/mp4');
  assert.equal(r.res.headers.get('accept-ranges'), 'bytes');
  assert.equal(r.res.headers.get('content-range'), 'bytes 0-1/4000');
  assert.equal((await r.res.arrayBuffer()).byteLength, 2);
  const r2 = await call('GET', '/stream/Tk-vgRMoPnY', { cookie: A, headers: { range: 'bytes=1000-' } });
  assert.equal(r2.res.headers.get('content-range'), 'bytes 1000-3999/4000');
  assert.equal(players(), n0 + 1, 'URL résolue une seule fois (cache)');
  gvFail = 1;
  const r3 = await call('GET', '/stream/Tk-vgRMoPnY', { cookie: A, headers: { range: 'bytes=0-9' } });
  assert.equal(r3.status, 206, 'URL expirée → redemandée');
  assert.equal(players(), n0 + 2);
  const big = await call('GET', '/stream/BIGVIDEO123', { cookie: A, headers: { range: 'bytes=2000000-2000009' } });
  assert.equal(big.status, 206, 'milieu d\'un long fichier (client VISIONOS)');
  assert.equal(big.res.headers.get('content-range'), 'bytes 2000000-2000009/3000000');
  const blocked = await call('GET', '/stream/BOTBLOCKED1', { cookie: A, headers: { range: 'bytes=0-1' } });
  assert.equal(blocked.status, 502, 'IOS limité au 1er Mo : refusé plutôt que coupé après 1 min');
  assert.ok(calls.some(u => u.includes('id=BOTBLOCKED1') && u.includes('c=IOS')), 'repli IOS tenté puis sondé');
  assert.equal((await call('GET', '/stream/../../x', { cookie: A })).status, 404);
  assert.equal((await call('GET', '/stream/Tk-vgRMoPnY', { cookie: A, headers: { range: 'octets=0-1' } })).status, 416);
});

test('Version : /api/version (public, no-store) et sw.js / js/update.js estampillés sans 304', async () => {
  const v = await handle(new Request('https://zeleph.test/api/version'), { ...env, APP_VERSION: '898ca3a-202611241405' }, ctx);
  assert.equal(v.status, 200);
  assert.deepEqual(await v.json(), { version: '898ca3a-202611241405' });
  assert.equal(v.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await call('GET', '/version')).data, { version: 'dev' });
  const ASSETS = { fetch: async u => {
    assert.equal(typeof u, 'string', 'URL seule : aucun en-tête conditionnel transmis');
    return new Response(readFileSync(new URL(`../public${new URL(u).pathname}`, import.meta.url), 'utf8'), { headers: { etag: '"x"', 'content-type': 'text/javascript' } });
  } };
  for (const p of ['/sw.js', '/js/update.js']) {
    const r = await worker.fetch(new Request(`https://zeleph.test${p}`, { headers: { 'if-none-match': '"x"' } }), { ...env, ASSETS, APP_VERSION: 'abc1234-2026"<x>' }, ctx);
    const t = await r.text();
    assert.equal(r.status, 200);
    assert.ok(t.includes('abc1234-2026x') && !t.includes('__APP_VERSION__'), p);
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    assert.equal(r.headers.get('etag'), null);
  }
});

test('Flux : jeton signé dans l\'URL (sans cookie, iOS), falsifié refusé, mort à la déconnexion', async () => {
  const C = await account('jeton_ios', 'jeton@zeleph.test');
  const { data } = await call('GET', '/stream-token', { cookie: C });
  assert.match(data.token, /^[0-9a-f-]{36}\.\d{13}\.[0-9a-f]{64}$/);
  assert.ok(data.expires > Date.now() + 6 * 864e5);
  assert.equal((await call('GET', `/stream/Tk-vgRMoPnY?t=${data.token}`, { headers: { range: 'bytes=0-1' } })).status, 206, 'jeton seul suffit');
  assert.equal((await call('GET', '/stream/Tk-vgRMoPnY', { headers: { range: 'bytes=0-1' } })).status, 401, 'ni cookie ni jeton');
  const bad = data.token.replace(/.$/, c => (c === '0' ? '1' : '0'));
  assert.equal((await call('GET', `/stream/Tk-vgRMoPnY?t=${bad}`)).status, 401, 'signature falsifiée');
  const old = data.token.replace(/\.\d{13}\./, `.${Date.now() - 1000}.`);
  assert.equal((await call('GET', `/stream/Tk-vgRMoPnY?t=${old}`)).status, 401, 'expiration modifiée');
  assert.equal((await call('GET', '/stream-token')).status, 401);
  await call('POST', '/auth/logout', { cookie: C });
  assert.equal((await call('GET', `/stream/Tk-vgRMoPnY?t=${data.token}`)).status, 401, 'session fermée = jeton mort');
});

test('Flux via extracteur : relayé tel quel, échec = 502 net sans repli DASH (Safari iOS bloqué à 0:00)', async () => {
  const xenv = { ...env, EXTRACTOR_URL: 'https://extracteur.test/', EXTRACTOR_TOKEN: '\uFEFFjeton-extracteur ' };
  const get = (id, cookie) => handle(new Request(`https://zeleph.test/api/stream/${id}`, { headers: { cookie, range: 'bytes=0-1' } }), xenv, ctx);
  const ok = await get('Tk-vgRMoPnY', A);
  assert.equal(ok.status, 206);
  assert.equal(ok.headers.get('content-range'), 'bytes 0-1/5000');
  assert.equal(ok.headers.get('content-type'), 'audio/mp4');
  const n = calls.length;
  const ko = await get('EXTFAIL0001', A);
  assert.equal(ko.status, 502);
  assert.equal((await ko.json()).error, 'no_audio');
  assert.ok(!calls.slice(n).some(u => u.includes('googlevideo') || u.includes('/youtubei/v1/player')), 'aucun flux direct DASH');
});
