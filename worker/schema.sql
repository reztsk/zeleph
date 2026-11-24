-- Zeleph : schéma D1 (SQLite). Rejouable : uniquement des CREATE ... IF NOT EXISTS.
-- npm run db:init (local) / npm run db:init:remote (production)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- @pseudo : [a-z0-9_]{3,20}
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL,                           -- PBKDF2-SHA256 « sel$hash »
  name TEXT NOT NULL DEFAULT '',
  avatar TEXT,                                  -- data:image/jpeg;base64 (≤ 300 Ko)
  avatar_v INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'noir-oled',
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Demandes à code OTP (inscription / mot de passe oublié). Le code n'est stocké que haché.
CREATE TABLE IF NOT EXISTS otps (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,            -- signup | reset
  email TEXT NOT NULL,
  handle TEXT,
  pass TEXT,
  user_id TEXT,
  code_hash TEXT NOT NULL,
  exp INTEGER NOT NULL,
  sent INTEGER NOT NULL,
  sends INTEGER NOT NULL DEFAULT 1,
  tries INTEGER NOT NULL DEFAULT 0,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS otps_email ON otps(email, sent);
CREATE INDEX IF NOT EXISTS otps_ip ON otps(ip, sent);

-- Échecs de connexion (anti force brute) : clé = sha256(identifiant) ou sha256(ip).
CREATE TABLE IF NOT EXISTS login_fails (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_fails_key ON login_fails(key, at);

-- Amitiés : une ligne par demande (a → b). status : pending | accepted.
CREATE TABLE IF NOT EXISTS friends (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  status TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE INDEX IF NOT EXISTS friends_b ON friends(b);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  cover TEXT,                    -- data:image/jpeg;base64
  cover_v INTEGER NOT NULL DEFAULT 0,
  public INTEGER NOT NULL DEFAULT 0,  -- 1 = visible par mes amis sur mon profil
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS playlists_owner ON playlists(owner);

-- Métadonnées du titre copiées dans chaque ligne (JSON validé) : pas de table partagée empoisonnable.
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT NOT NULL,
  vid TEXT NOT NULL,
  meta TEXT NOT NULL,
  added INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, vid)
);

CREATE TABLE IF NOT EXISTS playlist_shares (
  playlist_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, user_id)
);
CREATE INDEX IF NOT EXISTS shares_user ON playlist_shares(user_id);

CREATE TABLE IF NOT EXISTS likes (
  user_id TEXT NOT NULL,
  vid TEXT NOT NULL,
  meta TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, vid)
);

CREATE TABLE IF NOT EXISTS history (
  user_id TEXT NOT NULL,
  vid TEXT NOT NULL,
  meta TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, vid)
);
CREATE INDEX IF NOT EXISTS history_recent ON history(user_id, at);
