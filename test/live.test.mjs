// Test réseau réel (npm run test:live) : YouTube Music, extraction M4A, octets googlevideo, paroles LRCLIB.
// Depuis ta machine : vérifie que la logique marche. Depuis Cloudflare, YouTube peut bloquer l'IP → extracteur dédié.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, artist, collection, radio, featured, resolveAudio } from '../worker/yt.js';
import { lyrics } from '../worker/lyrics.js';

const env = {};
let song;

test('Recherche YouTube Music en français', async () => {
  const r = await search(env, 'ninho jefe');
  song = r.songs.find(s => s.title.toLowerCase().includes('jefe')) ?? r.songs[0];
  assert.ok(song?.id && song.artists.length && song.thumb, JSON.stringify(r.songs[0]));
  assert.ok(r.artists.length && r.albums.length && r.playlists.length);
});

test('Artiste, album, radio, accueil', async () => {
  const a = await artist(env, song.artists[0].id);
  assert.ok(a.name && a.sections.length);
  if (song.album?.id) assert.ok((await collection(env, song.album.id)).tracks.length);
  assert.ok((await radio(env, song.id)).length >= 10);
  assert.ok((await featured(env)).length);
});

test('Flux M4A/AAC : résolution + premiers octets (en-tête MP4 « ftyp »)', async () => {
  const s = await resolveAudio(env, song.id);
  assert.ok(!s.error, s.error);
  assert.equal(s.mime, 'audio/mp4');
  const r = await fetch(s.url, { headers: { 'user-agent': s.ua, range: 'bytes=0-1023' } });
  assert.equal(r.status, 206);
  const b = new Uint8Array(await r.arrayBuffer());
  assert.equal(new TextDecoder().decode(b.slice(4, 8)), 'ftyp');
  const mid = Math.floor(s.len / 2), m = await fetch(s.url, { headers: { 'user-agent': s.ua, range: `bytes=${mid}-${mid + 99}` } });
  assert.equal(m.status, 206, 'milieu du fichier accessible (sinon coupure après ~1 min)');
  const full = await fetch(s.url, { headers: { 'user-agent': s.ua, range: 'bytes=0-' } });
  assert.equal(full.status, 206, 'plage ouverte « bytes=0- » (requête initiale du navigateur)');
  await full.body.cancel();
});

test('Paroles synchronisées LRCLIB', async () => {
  const l = await lyrics(env, { title: song.title, artist: song.artists[0].name, dur: song.dur });
  assert.ok(l.synced || l.plain, 'paroles trouvées');
});
