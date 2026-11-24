import { fail, run, all, one } from './util.js';
import { handle, avatarUrl } from './auth.js';

// Amis par @pseudo : une ligne (a → b) par demande, « accepted » une fois acceptée.
export async function relation(db, me, other) {
  if (me === other) return 'self';
  const r = await one(db, 'SELECT a, status FROM friends WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)', me, other);
  if (!r) return 'none';
  if (r.status === 'accepted') return 'friend';
  return r.a === me ? 'outgoing' : 'incoming';
}
export const isFriend = async (db, a, b) => (await relation(db, a, b)) === 'friend';
const card = (u, rel) => ({ handle: u.handle, name: u.name || u.handle, avatar: avatarUrl(u), ...(rel && { rel }) });
const byHandle = async (c, h) => (await one(c.db, 'SELECT * FROM users WHERE handle = ?1', handle(h))) ?? fail(404, 'not_found', 'Utilisateur introuvable');

export async function searchUsers(c) {
  const q = String(c.url.searchParams.get('q') ?? '').trim().replace(/^@/, '').toLowerCase().slice(0, 30);
  if (q.length < 2) return { users: [] };
  const like = `${q.replace(/[\\%_]/g, m => `\\${m}`)}%`;
  const rows = await all(c.db, "SELECT * FROM users WHERE (handle LIKE ?1 ESCAPE '\\' OR name LIKE ?1 ESCAPE '\\') AND id != ?2 ORDER BY handle = ?3 DESC, length(handle) LIMIT 20", like, c.user.id, q);
  return { users: await Promise.all(rows.map(async u => card(u, await relation(c.db, c.user.id, u.id)))) };
}

export async function friendsList(c) {
  const rows = await all(c.db, `SELECT f.a, f.b, f.status, u.* FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END
    WHERE f.a = ?1 OR f.b = ?1 ORDER BY u.handle LIMIT 500`, c.user.id);
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    if (r.status === 'accepted') out.friends.push(card(r, 'friend'));
    else if (r.a === c.user.id) out.outgoing.push(card(r, 'outgoing'));
    else out.incoming.push(card(r, 'incoming'));
  }
  return out;
}

// Envoyer une demande, ou accepter celle reçue de cette personne.
export async function friendAdd(c, h) {
  const u = await byHandle(c, h), rel = await relation(c.db, c.user.id, u.id);
  if (rel === 'self') fail(400, 'self', 'Tu ne peux pas t\'ajouter toi-même');
  if (rel === 'incoming') await run(c.db, "UPDATE friends SET status = 'accepted' WHERE a = ?1 AND b = ?2", u.id, c.user.id);
  else if (rel === 'none') {
    if ((await one(c.db, "SELECT COUNT(*) n FROM friends WHERE a = ?1 AND status = 'pending'", c.user.id)).n >= 100) fail(429, 'busy', 'Trop de demandes en attente');
    await run(c.db, "INSERT OR IGNORE INTO friends (a, b, status, created) VALUES (?1, ?2, 'pending', ?3)", c.user.id, u.id, c.now);
  }
  return { rel: await relation(c.db, c.user.id, u.id) };
}

// Refuser, annuler ou retirer un ami : la ligne disparaît, ainsi que les partages entre les deux.
export async function friendRemove(c, h) {
  const u = await byHandle(c, h);
  if (u.id === c.user.id) fail(400, 'self', 'Action impossible sur ton propre compte');
  await c.db.batch([
    c.db.prepare('DELETE FROM friends WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)').bind(c.user.id, u.id),
    c.db.prepare('DELETE FROM playlist_shares WHERE user_id = ?2 AND playlist_id IN (SELECT id FROM playlists WHERE owner = ?1)').bind(c.user.id, u.id),
    c.db.prepare('DELETE FROM playlist_shares WHERE user_id = ?1 AND playlist_id IN (SELECT id FROM playlists WHERE owner = ?2)').bind(c.user.id, u.id),
  ]);
  return { rel: 'none' };
}

export async function profile(c, h, summaries) {
  const u = await byHandle(c, h), rel = await relation(c.db, c.user.id, u.id);
  let rows = [];
  if (rel === 'self') rows = await all(c.db, 'SELECT * FROM playlists WHERE owner = ?1 ORDER BY updated DESC', u.id);
  else if (rel === 'friend') rows = await all(c.db, `SELECT * FROM playlists p WHERE owner = ?1 AND (public = 1 OR EXISTS (SELECT 1 FROM playlist_shares s WHERE s.playlist_id = p.id AND s.user_id = ?2)) ORDER BY updated DESC`, u.id, c.user.id);
  const counts = await one(c.db, "SELECT COUNT(*) n FROM friends WHERE (a = ?1 OR b = ?1) AND status = 'accepted'", u.id);
  return { user: { ...card(u, rel), friends: counts.n }, playlists: await summaries(c, rows) };
}
