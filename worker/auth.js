import { fail, HANDLE_RE, sha256, safeEq, randHex, randInt, run, one, hashPass, passOk, DUMMY_PASS, cleanImage } from './util.js';
import { mailReady, sendOtp } from './mail.js';
import { THEMES } from '../public/js/themes.js';

// Comptes : @pseudo + e-mail + mot de passe (PBKDF2). Le compte n'existe qu'après validation du code OTP (Brevo).
// Session : cookie HttpOnly « zl=<id>.<secret> », seul le hash du secret est stocké. Plusieurs appareils = plusieurs sessions.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const TTL = 10 * 6e4, RESEND = 3e4, MAX_TRIES = 5, PER_HOUR = 5, MAX_SENDS = 5, PER_IP = 20;
const FAIL_WINDOW = 15 * 6e4, FAIL_MAX = 8, FAIL_IP_MAX = 30;
const YEAR = 365 * 864e5;

const newCode = () => String(randInt(1e6)).padStart(6, '0');
const codeHash = (id, code) => sha256(`${id}:${code}`);
const ipKey = c => { const ip = c.req.headers.get('cf-connecting-ip'); return ip ? sha256(`ip:${ip}`) : Promise.resolve(null); }; // en local / tests : pas d'en-tête, pas de limite par IP
const isLocal = c => ['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname);

function email(v) { const e = String(v ?? '').trim().toLowerCase(); if (!EMAIL_RE.test(e)) fail(400, 'bad_email', 'E-mail invalide'); return e; }
function password(v) { const p = String(v ?? ''); if (p.length < 8 || p.length > 72) fail(400, 'bad_password', 'Mot de passe : 8 à 72 caractères'); return p; }
export function handle(v) {
  const h = String(v ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!HANDLE_RE.test(h)) fail(400, 'bad_handle', '@pseudo : 3 à 20 caractères, lettres minuscules, chiffres ou _');
  return h;
}

// ---------- Sessions ----------
function cookie(c, value, maxAge) {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  return `zl=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
async function openSession(c, userId) {
  const id = crypto.randomUUID(), secret = randHex(24);
  await run(c.db, 'INSERT INTO sessions (id, user_id, secret_hash, created, seen) VALUES (?1, ?2, ?3, ?4, ?4)', id, userId, await sha256(secret), c.now);
  c.setCookie = cookie(c, `${id}.${secret}`, YEAR / 1e3);
  return id;
}
export async function authenticate(c) {
  const m = /(?:^|;\s*)zl=([0-9a-f-]{36})\.([0-9a-f]{48})(?:;|$)/.exec(c.req.headers.get('cookie') ?? '');
  if (!m) return null;
  const s = await one(c.db, 'SELECT s.id sid, s.secret_hash, s.seen, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?1', m[1]);
  if (!s || !safeEq(s.secret_hash, await sha256(m[2]))) return null;
  if (c.now - s.seen > 36e5) await run(c.db, 'UPDATE sessions SET seen = ?1 WHERE id = ?2', c.now, s.sid);
  return s;
}
// Jeton de flux « <session>.<expiration>.<hmac> » mis dans l'URL de /api/stream : le moteur audio d'iOS n'envoie pas
// toujours le cookie. Lié à la session (mort à la déconnexion), clé = hash du secret de session (jamais exposé).
const STREAM_TTL = 7 * 864e5;
const sign = async (key, msg) => {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
};
export async function streamToken(c) {
  const msg = `${c.user.sid}.${c.now + STREAM_TTL}`;
  return { token: `${msg}.${await sign(c.user.secret_hash, msg)}`, expires: c.now + STREAM_TTL };
}
export async function streamAllowed(c) {
  const m = /^([0-9a-f-]{36})\.(\d{13})\.([0-9a-f]{64})$/.exec(c.url.searchParams.get('t') ?? '');
  if (!m || +m[2] < c.now) return false;
  const s = await one(c.db, 'SELECT secret_hash FROM sessions WHERE id = ?1', m[1]);
  return !!s && safeEq(m[3], await sign(s.secret_hash, `${m[1]}.${m[2]}`));
}
export const avatarUrl = u => (u.avatar_v ? `/api/img/u/${u.handle}?v=${u.avatar_v}` : null);
export const me = u => ({ id: u.id, handle: u.handle, name: u.name || u.handle, email: u.email, avatar: avatarUrl(u), theme: u.theme });

// ---------- Inscription / mot de passe oublié (OTP) ----------
export async function handleAvailable(c, h) {
  const v = handle(h);
  return { handle: v, available: !(await one(c.db, 'SELECT 1 x FROM users WHERE handle = ?1', v)) };
}

async function deliver(c, to, kind, code, real) {
  if (c.env.DEMO_OTP === '1' && isLocal(c)) return real ? { demo: code } : {}; // dev local uniquement : jamais sur un domaine public
  if (!real) return {};
  const p = sendOtp(c.env, to, kind, code, TTL / 6e4);
  if (kind === 'reset' && c.ctx) { c.ctx.waitUntil(p.catch(() => {})); return {}; } // même durée de réponse que pour un e-mail inconnu
  await p;
  return {};
}
const mailOn = c => (c.env.DEMO_OTP === '1' && isLocal(c)) || mailReady(c.env) || fail(503, 'mail_off', 'Envoi des e-mails indisponible pour le moment, réessaie plus tard.');

async function quota(c, mail, ip) {
  if ((await one(c.db, 'SELECT COUNT(*) n FROM otps WHERE email = ?1 AND sent > ?2', mail, c.now - 36e5)).n >= PER_HOUR) fail(429, 'busy', 'Trop de demandes, réessaie dans une heure');
  if (ip && (await one(c.db, 'SELECT COUNT(*) n FROM otps WHERE ip = ?1 AND sent > ?2', ip, c.now - 36e5)).n >= PER_IP) fail(429, 'busy', 'Trop de demandes, réessaie dans une heure');
}

async function challenge(c, row, real) {
  const id = crypto.randomUUID(), code = newCode();
  await run(c.db, 'INSERT INTO otps (id, kind, email, handle, pass, user_id, code_hash, exp, sent, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)',
    id, row.kind, row.email, row.handle ?? null, row.pass ?? null, row.user_id ?? null, await codeHash(id, real ? code : newCode()), c.now + TTL, c.now, row.ip);
  let extra;
  try { extra = await deliver(c, row.email, row.kind, code, real); }
  catch (e) { await run(c.db, 'DELETE FROM otps WHERE id = ?1', id); throw e; } // envoi raté : la demande disparaît, aucun quota consommé
  return { challenge: id, ttl: TTL / 1e3, resend: RESEND / 1e3, ...extra };
}

export async function signup(c) {
  mailOn(c);
  const h = handle(c.body.handle), mail = email(c.body.email), pw = password(c.body.password);
  const ip = await ipKey(c);
  await quota(c, mail, ip);
  if (await one(c.db, 'SELECT 1 x FROM users WHERE handle = ?1', h)) fail(409, 'handle_taken', 'Ce @pseudo est déjà pris');
  if (await one(c.db, 'SELECT 1 x FROM users WHERE email = ?1', mail)) fail(409, 'email_taken', 'Un compte existe déjà avec cet e-mail');
  return challenge(c, { kind: 'signup', email: mail, handle: h, pass: await hashPass(pw), ip }, true);
}

export async function forgot(c) {
  mailOn(c);
  const mail = email(c.body.email), ip = await ipKey(c);
  await quota(c, mail, ip);
  const u = await one(c.db, 'SELECT id FROM users WHERE email = ?1', mail);
  return challenge(c, { kind: 'reset', email: mail, user_id: u?.id ?? null, ip }, !!u); // e-mail inconnu : même réponse, aucun code valide
}

export async function resend(c) {
  const row = await one(c.db, 'SELECT * FROM otps WHERE id = ?1', String(c.body.challenge ?? ''));
  if (!row || row.exp < c.now) fail(410, 'expired', 'Demande expirée, recommence');
  if (c.now - row.sent < RESEND) fail(429, 'wait', 'Patiente quelques secondes avant de renvoyer');
  if (row.sends >= MAX_SENDS) fail(429, 'busy', 'Trop de renvois, recommence la demande');
  const code = newCode(), real = row.kind !== 'reset' || !!row.user_id;
  // garde `sent = ancien` : deux renvois simultanés ne passent pas tous les deux
  const claim = await run(c.db, 'UPDATE otps SET code_hash = ?2, exp = ?3, sent = ?4, sends = sends + 1, tries = 0 WHERE id = ?1 AND sent = ?5', row.id, await codeHash(row.id, real ? code : newCode()), c.now + TTL, c.now, row.sent);
  if (claim.meta.changes !== 1) fail(429, 'wait', 'Patiente quelques secondes avant de renvoyer');
  let extra;
  try { extra = await deliver(c, row.email, row.kind, code, real); }
  catch (e) { await run(c.db, 'UPDATE otps SET code_hash = ?2, exp = ?3, sent = ?4, sends = ?5, tries = ?6 WHERE id = ?1', row.id, row.code_hash, row.exp, row.sent, row.sends, row.tries); throw e; }
  return { ttl: TTL / 1e3, resend: RESEND / 1e3, ...extra };
}

export async function verify(c) {
  const id = String(c.body.challenge ?? ''), code = String(c.body.code ?? '').trim();
  const row = await one(c.db, 'SELECT * FROM otps WHERE id = ?1', id);
  if (!row || row.exp < c.now) fail(410, 'expired', 'Code expiré, renvoie un code');
  if (row.tries >= MAX_TRIES) fail(429, 'locked', 'Trop d\'essais, renvoie un code');
  const newPass = row.kind === 'reset' ? await hashPass(password(c.body.password)) : null; // validé avant de consommer le code
  if (!/^\d{6}$/.test(code) || !safeEq(row.code_hash, await codeHash(id, code))) {
    await run(c.db, 'UPDATE otps SET tries = tries + 1 WHERE id = ?1', id);
    fail(401, 'bad_code', 'Code incorrect');
  }
  if ((await run(c.db, 'DELETE FROM otps WHERE id = ?1', id)).meta.changes !== 1) fail(410, 'expired', 'Code déjà utilisé'); // un code ne sert qu'une fois
  let uid = row.user_id;
  if (row.kind === 'reset') {
    await run(c.db, 'UPDATE users SET pass = ?2 WHERE id = ?1', uid, newPass);
    await run(c.db, 'DELETE FROM sessions WHERE user_id = ?1', uid); // anciennes sessions fermées (téléphone perdu…)
  } else {
    uid = crypto.randomUUID();
    try { await run(c.db, 'INSERT INTO users (id, handle, email, pass, name, created) VALUES (?1, ?2, ?3, ?4, ?2, ?5)', uid, row.handle, row.email, row.pass, c.now); }
    catch (e) { if (/UNIQUE/i.test(String(e.message))) fail(409, 'taken', '@pseudo ou e-mail déjà utilisé entre-temps'); throw e; }
  }
  await openSession(c, uid);
  return { me: me(await one(c.db, 'SELECT * FROM users WHERE id = ?1', uid)) };
}

// ---------- Connexion ----------
export async function login(c) {
  const ident = String(c.body.login ?? '').trim().toLowerCase(), pw = String(c.body.password ?? '');
  if (!ident || ident.length > 260 || !pw || pw.length > 72) fail(400, 'bad_login', 'Identifiant ou mot de passe incorrect');
  const key = await sha256(`id:${ident.replace(/^@/, '')}`), ip = await ipKey(c), since = c.now - FAIL_WINDOW;
  if ((await one(c.db, 'SELECT COUNT(*) n FROM login_fails WHERE key = ?1 AND at > ?2', key, since)).n >= FAIL_MAX
    || (ip && (await one(c.db, 'SELECT COUNT(*) n FROM login_fails WHERE key = ?1 AND at > ?2', ip, c.now - 36e5)).n >= FAIL_IP_MAX)) fail(429, 'busy', 'Trop d\'essais, réessaie dans 15 minutes');
  const u = ident.includes('@') && !ident.startsWith('@')
    ? await one(c.db, 'SELECT * FROM users WHERE email = ?1', ident)
    : await one(c.db, 'SELECT * FROM users WHERE handle = ?1', ident.replace(/^@/, ''));
  if (!(await passOk(pw, u?.pass ?? DUMMY_PASS)) || !u) {
    await c.db.batch([
      c.db.prepare('INSERT INTO login_fails (key, at) VALUES (?1, ?2)').bind(key, c.now),
      ...(ip ? [c.db.prepare('INSERT INTO login_fails (key, at) VALUES (?1, ?2)').bind(ip, c.now)] : []),
      c.db.prepare('DELETE FROM login_fails WHERE at < ?1').bind(c.now - 864e5),
    ]);
    fail(401, 'bad_login', 'Identifiant ou mot de passe incorrect');
  }
  await openSession(c, u.id);
  return { me: me(u) };
}

export async function logout(c) {
  if (c.user) await run(c.db, 'DELETE FROM sessions WHERE id = ?1', c.user.sid);
  c.setCookie = cookie(c, '', 0);
  return { ok: true };
}

export async function changePassword(c) {
  const cur = String(c.body.current ?? ''), next = password(c.body.next);
  const key = await sha256(`pw:${c.user.id}`);
  if ((await one(c.db, 'SELECT COUNT(*) n FROM login_fails WHERE key = ?1 AND at > ?2', key, c.now - 36e5)).n >= 5) fail(429, 'busy', 'Trop d\'essais, réessaie dans une heure');
  if (!(await passOk(cur, c.user.pass))) {
    await run(c.db, 'INSERT INTO login_fails (key, at) VALUES (?1, ?2)', key, c.now);
    fail(401, 'bad_login', 'Mot de passe actuel incorrect');
  }
  await run(c.db, 'UPDATE users SET pass = ?2 WHERE id = ?1', c.user.id, await hashPass(next));
  await run(c.db, 'DELETE FROM sessions WHERE user_id = ?1 AND id != ?2', c.user.id, c.user.sid); // les autres appareils sont déconnectés
  return { ok: true };
}

// ---------- Profil ----------
export async function putMe(c) {
  const b = c.body, u = c.user;
  if (b.name !== undefined) {
    const n = String(b.name).trim();
    if (n.length < 1 || n.length > 40) fail(400, 'bad_name', 'Nom : 1 à 40 caractères');
    await run(c.db, 'UPDATE users SET name = ?2 WHERE id = ?1', u.id, n);
  }
  if (b.theme !== undefined) {
    if (!THEMES.some(t => t.id === b.theme)) fail(400, 'bad_theme', 'Thème inconnu');
    await run(c.db, 'UPDATE users SET theme = ?2 WHERE id = ?1', u.id, b.theme);
  }
  if (b.avatar !== undefined) {
    const img = cleanImage(b.avatar);
    await run(c.db, 'UPDATE users SET avatar = ?2, avatar_v = ?3 WHERE id = ?1', u.id, img, img ? c.now : 0);
  }
  return { me: me(await one(c.db, 'SELECT * FROM users WHERE id = ?1', u.id)) };
}
