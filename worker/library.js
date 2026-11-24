import { fail, run, all, one, cleanTrack, cleanImage, ID_RE, VID_RE } from './util.js';
import { isFriend } from './social.js';
import { handle, avatarUrl } from './auth.js';

const MAX_PLAYLISTS = 200, MAX_TRACKS = 2000, HISTORY_KEEP = 200;
const parse = r => ({ ...JSON.parse(r.meta), added: r.added ?? r.at });
const name = v => { const n = String(v ?? '').trim(); if (n.length < 1 || n.length > 80) fail(400, 'bad_name', 'Nom : 1 à 80 caractères'); return n; };

// Résumé affiché dans les listes : pochette perso, sinon pochette du 1er titre.
export async function summaries(c, rows) {
  if (!rows.length) return [];
  const ids = rows.map(r => r.id).slice(0, 90); // D1 : 100 paramètres liés max
  const marks = ids.map((_, i) => `?${i + 1}`).join(',');
  const counts = await all(c.db, `SELECT playlist_id, COUNT(*) n, (SELECT meta FROM playlist_tracks t2 WHERE t2.playlist_id = t.playlist_id ORDER BY added LIMIT 1) first FROM playlist_tracks t WHERE playlist_id IN (${marks}) GROUP BY playlist_id`, ...ids);
  const owners = await all(c.db, `SELECT id, handle, name, avatar_v FROM users WHERE id IN (${[...new Set(rows.map(r => r.owner))].slice(0, 90).map((_, i) => `?${i + 1}`).join(',')})`, ...[...new Set(rows.map(r => r.owner))].slice(0, 90));
  const byId = Object.fromEntries(counts.map(x => [x.playlist_id, x])), own = Object.fromEntries(owners.map(o => [o.id, o]));
  return rows.filter(r => ids.includes(r.id)).map(r => {
    const k = byId[r.id], o = own[r.owner];
    return {
      id: r.id, name: r.name, public: !!r.public, mine: r.owner === c.user.id, count: k?.n ?? 0, updated: r.updated,
      cover: r.cover_v ? `/api/img/p/${r.id}?v=${r.cover_v}` : (k?.first ? JSON.parse(k.first).thumb : null),
      owner: o ? { handle: o.handle, name: o.name || o.handle, avatar: avatarUrl(o) } : null,
    };
  });
}

async function readable(c, id) {
  if (!ID_RE.test(id)) fail(404, 'not_found', 'Playlist introuvable');
  const p = await one(c.db, 'SELECT * FROM playlists WHERE id = ?1', id);
  if (!p) fail(404, 'not_found', 'Playlist introuvable');
  if (p.owner === c.user.id) return p;
  const shared = await one(c.db, 'SELECT 1 x FROM playlist_shares WHERE playlist_id = ?1 AND user_id = ?2', id, c.user.id);
  if ((p.public || shared) && await isFriend(c.db, c.user.id, p.owner)) return p;
  fail(404, 'not_found', 'Playlist introuvable');
}
async function owned(c, id) {
  const p = await readable(c, id);
  if (p.owner !== c.user.id) fail(403, 'forbidden', 'Seul le créateur peut modifier cette playlist');
  return p;
}
const touch = (c, id) => run(c.db, 'UPDATE playlists SET updated = ?2 WHERE id = ?1', id, c.now);

export async function library(c) {
  const [mine, shared, likes] = await Promise.all([
    all(c.db, 'SELECT * FROM playlists WHERE owner = ?1 ORDER BY updated DESC', c.user.id),
    all(c.db, `SELECT p.* FROM playlist_shares s JOIN playlists p ON p.id = s.playlist_id
      WHERE s.user_id = ?1 AND EXISTS (SELECT 1 FROM friends f WHERE f.status = 'accepted' AND ((f.a = ?1 AND f.b = p.owner) OR (f.b = ?1 AND f.a = p.owner))) ORDER BY s.created DESC LIMIT 50`, c.user.id),
    one(c.db, 'SELECT COUNT(*) n FROM likes WHERE user_id = ?1', c.user.id),
  ]);
  return { playlists: await summaries(c, mine), shared: await summaries(c, shared), likes: likes.n };
}

export async function createPlaylist(c) {
  if ((await one(c.db, 'SELECT COUNT(*) n FROM playlists WHERE owner = ?1', c.user.id)).n >= MAX_PLAYLISTS) fail(429, 'limit', 'Nombre maximum de playlists atteint');
  const id = crypto.randomUUID();
  await run(c.db, 'INSERT INTO playlists (id, owner, name, public, created, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?5)', id, c.user.id, name(c.body.name), c.body.public ? 1 : 0, c.now);
  if (c.body.track) await addTrack(c, id);
  return { playlist: (await summaries(c, [await one(c.db, 'SELECT * FROM playlists WHERE id = ?1', id)]))[0] };
}

export async function getPlaylist(c, id) {
  const p = await readable(c, id);
  const rows = await all(c.db, 'SELECT meta, added FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY added, vid', id);
  const shares = p.owner === c.user.id ? (await all(c.db, 'SELECT u.handle FROM playlist_shares s JOIN users u ON u.id = s.user_id WHERE s.playlist_id = ?1', id)).map(r => r.handle) : [];
  return { playlist: { ...(await summaries(c, [p]))[0], sharedWith: shares }, tracks: rows.map(parse) };
}

export async function putPlaylist(c, id) {
  await owned(c, id);
  const b = c.body;
  if (b.name !== undefined) await run(c.db, 'UPDATE playlists SET name = ?2 WHERE id = ?1', id, name(b.name));
  if (b.public !== undefined) await run(c.db, 'UPDATE playlists SET public = ?2 WHERE id = ?1', id, b.public ? 1 : 0);
  if (b.cover !== undefined) { const img = cleanImage(b.cover); await run(c.db, 'UPDATE playlists SET cover = ?2, cover_v = ?3 WHERE id = ?1', id, img, img ? c.now : 0); }
  await touch(c, id);
  return getPlaylist(c, id);
}

export async function deletePlaylist(c, id) {
  await owned(c, id);
  await c.db.batch(['playlist_tracks', 'playlist_shares'].map(t => c.db.prepare(`DELETE FROM ${t} WHERE playlist_id = ?1`).bind(id)).concat(c.db.prepare('DELETE FROM playlists WHERE id = ?1').bind(id)));
  return { ok: true };
}

export async function addTrack(c, id) {
  await owned(c, id);
  const t = cleanTrack(c.body.track);
  if ((await one(c.db, 'SELECT COUNT(*) n FROM playlist_tracks WHERE playlist_id = ?1', id)).n >= MAX_TRACKS) fail(429, 'limit', 'Playlist pleine (2000 titres)');
  const r = await run(c.db, 'INSERT OR IGNORE INTO playlist_tracks (playlist_id, vid, meta, added) VALUES (?1, ?2, ?3, ?4)', id, t.id, JSON.stringify(t), c.now);
  await touch(c, id);
  return { added: r.meta.changes === 1 };
}

export async function removeTrack(c, id, vid) {
  await owned(c, id);
  if (!VID_RE.test(vid)) fail(400, 'bad_track', 'Titre invalide');
  await run(c.db, 'DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND vid = ?2', id, vid);
  await touch(c, id);
  return { ok: true };
}

// Partager à des amis précis (la playlist apparaît dans leur bibliothèque, section « Partagées avec moi »).
export async function sharePlaylist(c, id) {
  await owned(c, id);
  const hs = c.body.handles;
  if (!Array.isArray(hs) || hs.length > 50) fail(400, 'bad_request', 'Liste d\'amis invalide');
  const out = [];
  for (const h of hs) {
    const u = await one(c.db, 'SELECT id, handle FROM users WHERE handle = ?1', handle(h));
    if (!u || !(await isFriend(c.db, c.user.id, u.id))) fail(400, 'not_friend', `@${String(h).replace(/^@/, '')} ne fait pas partie de tes amis`);
    await run(c.db, 'INSERT OR IGNORE INTO playlist_shares (playlist_id, user_id, created) VALUES (?1, ?2, ?3)', id, u.id, c.now);
    out.push(u.handle);
  }
  return { sharedWith: out };
}

// ---------- Favoris & historique ----------
export async function likes(c) {
  return { tracks: (await all(c.db, 'SELECT meta, at FROM likes WHERE user_id = ?1 ORDER BY at DESC LIMIT 2000', c.user.id)).map(parse) };
}
export async function likeIds(c) {
  return { ids: (await all(c.db, 'SELECT vid FROM likes WHERE user_id = ?1', c.user.id)).map(r => r.vid) };
}
export async function like(c, vid) {
  const t = cleanTrack(c.body.track);
  if (t.id !== vid) fail(400, 'bad_track', 'Titre invalide');
  await run(c.db, 'INSERT OR REPLACE INTO likes (user_id, vid, meta, at) VALUES (?1, ?2, ?3, ?4)', c.user.id, vid, JSON.stringify(t), c.now);
  return { liked: true };
}
export async function unlike(c, vid) {
  await run(c.db, 'DELETE FROM likes WHERE user_id = ?1 AND vid = ?2', c.user.id, String(vid));
  return { liked: false };
}
export async function addHistory(c) {
  const t = cleanTrack(c.body.track);
  await c.db.batch([
    c.db.prepare('INSERT OR REPLACE INTO history (user_id, vid, meta, at) VALUES (?1, ?2, ?3, ?4)').bind(c.user.id, t.id, JSON.stringify(t), c.now),
    c.db.prepare('DELETE FROM history WHERE user_id = ?1 AND at < (SELECT at FROM history WHERE user_id = ?1 ORDER BY at DESC LIMIT 1 OFFSET ?2)').bind(c.user.id, HISTORY_KEEP),
  ]);
  return { ok: true };
}
export async function recent(c, n = 20) {
  return (await all(c.db, 'SELECT meta, at FROM history WHERE user_id = ?1 ORDER BY at DESC LIMIT ?2', c.user.id, n)).map(parse);
}
export async function friendsPlaylists(c) {
  const rows = await all(c.db, `SELECT p.* FROM playlists p JOIN friends f ON f.status = 'accepted' AND ((f.a = ?1 AND f.b = p.owner) OR (f.b = ?1 AND f.a = p.owner))
    WHERE p.public = 1 OR EXISTS (SELECT 1 FROM playlist_shares s WHERE s.playlist_id = p.id AND s.user_id = ?1) ORDER BY p.updated DESC LIMIT 12`, c.user.id);
  return summaries(c, rows);
}
