// Tests unitaires : paroles, file d'attente, thèmes, lecture des réponses YouTube Music (fixtures réelles du 24/11/2026), validations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLrc, activeLine } from '../public/js/lrc.js';
import { Queue, shuffled } from '../public/js/queue.js';
import { THEMES, themeById } from '../public/js/themes.js';
import { parseSearch, parseArtist, parseCollection, sections, byline, big, seconds, pickAudio } from '../worker/yt.js';
import { cleanTrack, cleanImage } from '../worker/util.js';
import { cleanTitle } from '../worker/lyrics.js';
import { otpMessage } from '../worker/mail.js';

const fx = n => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
const T = (id, title = id) => ({ id: id.padEnd(11, 'x'), title });

test('LRC : parse, tri, multi-horodatage, ligne active', () => {
  const l = parseLrc('[ar:x]\n[00:12.50]Deux\n[00:01.00][00:30.00]Refrain\n[01:02]Trois\nbruit');
  assert.deepEqual(l.map(x => x.t), [1, 12.5, 30, 62]);
  assert.equal(l[0].l, 'Refrain');
  assert.equal(activeLine(l, 0.5), -1);
  assert.equal(activeLine(l, 12.6), 1);
  assert.equal(activeLine(l, 999), 3);
  assert.deepEqual(parseLrc(null), []);
});

test('File : lecture, suivant, précédent, ajout ensuite/en dernier', () => {
  const q = new Queue();
  assert.equal(q.playList([T('a'), T('b'), T('c')], 1).title, 'b');
  assert.deepEqual(q.past.map(t => t.title), ['a']);
  q.playNext(T('n')); q.playLater(T('z'));
  assert.deepEqual(q.next.map(t => t.title), ['n', 'c', 'z']);
  assert.equal(q.advance().title, 'n');
  assert.equal(q.back().title, 'b');
  assert.equal(q.next[0].title, 'n');
});

test('File : monter / descendre / en premier / retirer / sauter, suggestions sans doublon', () => {
  const q = new Queue();
  q.playList([T('a'), T('b'), T('c'), T('d')], 0);
  assert.ok(q.move('next', 2, -1));
  assert.deepEqual(q.next.map(t => t.title), ['b', 'd', 'c']);
  assert.equal(q.move('next', 0, -1), false, 'pas au-delà du début');
  assert.equal(q.move('next', 2, 1), false, 'pas au-delà de la fin');
  q.fillAuto([T('b'), T('e'), T('f'), T('e')]);
  assert.deepEqual(q.auto.map(t => t.title), ['e', 'f'], 'b déjà en file, e en double');
  assert.ok(q.toTop('auto', 1));
  assert.deepEqual(q.next.map(t => t.title), ['f', 'b', 'd', 'c']);
  assert.ok(q.remove('next', 1));
  assert.equal(q.jump('next', 2).title, 'c');
  assert.deepEqual(q.past.map(t => t.title), ['a', 'f', 'd']);
  assert.equal(q.jump('auto', 0).title, 'e');
  assert.equal(q.advance(), null, 'fin de file');
  assert.ok(q.needsAuto());
  const r = new Queue(JSON.parse(JSON.stringify(q.toJSON())));
  assert.deepEqual(r.past.map(t => t.title), q.past.map(t => t.title), 'restauration');
  assert.equal(shuffled([1, 2, 3]).length, 3);
});

test('Thèmes : 11 thèmes dont Sakura / rosés, ids uniques, couleurs valides', () => {
  assert.ok(THEMES.length >= 8 && THEMES.length <= 14);
  assert.equal(new Set(THEMES.map(t => t.id)).size, THEMES.length);
  for (const n of ['Sakura Nuit', 'Sakura Rose', 'Rose Velours', 'Néon Rose', 'Noir OLED Pur', 'Cover Dynamique', 'Minuit Bleu', 'Émeraude Sombre', 'Ambre / Sunset', 'Violet Crépuscule', 'Blanc / Clair']) assert.ok(THEMES.some(t => t.name === n), n);
  for (const t of THEMES) for (const k of ['bg', 'bg2', 'surface', 'surface2', 'line', 'text', 'muted', 'accent', 'on']) assert.match(t[k], /^#[0-9a-f]{6}$/, `${t.id}.${k}`);
  assert.equal(themeById('inconnu').id, 'noir-oled');
});

test('YouTube : recherche de titres (artiste, album, durée, pochette 544)', () => {
  const r = parseSearch(fx('search-songs'));
  const t = r.find(x => x.id === 'Tk-vgRMoPnY');
  assert.equal(t.kind, 'track');
  assert.equal(t.title, 'Jefe');
  assert.deepEqual(t.artists, [{ name: 'Ninho', id: 'UCBNTNHPngOpC-yeC8VpAPJQ' }]);
  assert.deepEqual(t.album, { name: 'Jefe', id: 'MPREb_09DO8gDztAC' });
  assert.equal(t.dur, 178);
  assert.match(t.thumb, /=w544-h544-l90-rj$/);
  assert.ok(r.filter(x => x.kind === 'track').length >= 10);
  assert.ok(parseSearch(fx('search-artists')).some(x => x.kind === 'artist' && x.id.startsWith('UC')));
  assert.ok(parseSearch(fx('search-playlists')).some(x => x.kind === 'playlist' && x.id.startsWith('VL')));
});

test('YouTube : page artiste, album, playlist, radio, accueil', () => {
  const a = parseArtist(fx('artist'));
  assert.equal(a.name, 'Ninho');
  assert.ok(a.thumb);
  assert.ok(a.sections.some(s => s.items.some(i => i.kind === 'track')), 'top titres');
  assert.ok(a.sections.some(s => s.title === 'Albums' && s.items.every(i => i.kind === 'album')));
  const al = parseCollection(fx('album'), 'MPREb_09DO8gDztAC');
  assert.equal(al.kind, 'album');
  assert.ok(al.tracks.length >= 10);
  assert.ok(al.tracks.every(t => t.artists.length && t.album?.name === al.title && t.thumb && t.dur > 0), 'pistes complétées par l\'en-tête');
  assert.ok(al.tracks.some(t => t.explicit), 'badge explicite');
  const pl = parseCollection(fx('playlist'), 'VLRDCLAK5uy_ncNOYjq7OOSZeazddJXSe-s9wXgjTG5uw');
  assert.equal(pl.kind, 'playlist');
  assert.ok(pl.tracks.length >= 30 && pl.tracks.every(t => t.artists.length));
  const radio = sections(fx('next')).flatMap(s => s.items);
  assert.ok(radio.length >= 20 && radio.every(t => t.kind === 'track' && t.title && t.dur > 0));
  assert.ok(sections(fx('home')).some(s => s.title && s.items.length));
});

test('YouTube : utilitaires (byline sans lien, durée, miniature, choix du flux AAC)', () => {
  assert.deepEqual(byline([{ text: 'Titre' }, { text: ' • ' }, { text: 'Aya Nakamura & Ninho' }, { text: ' • ' }, { text: '3:01' }]).artists.map(a => a.name), ['Aya Nakamura', 'Ninho']);
  assert.equal(seconds('1:02:03'), 3723);
  assert.equal(seconds('abc'), 0);
  assert.equal(big('https://lh3.googleusercontent.com/x=w60-h60-l90-rj'), 'https://lh3.googleusercontent.com/x=w544-h544-l90-rj');
  assert.equal(big('https://yt3.ggpht.com/y=s88-c-k-c0x00ffffff-no-rj'), 'https://yt3.ggpht.com/y=s544');
  const f = [{ itag: 251, mimeType: 'audio/webm; codecs="opus"', url: 'u1', bitrate: 160000 }, { itag: 139, mimeType: 'audio/mp4; codecs="mp4a.40.5"', url: 'u2', bitrate: 48000 }, { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', url: 'u3', bitrate: 130000 }];
  assert.equal(pickAudio(f).itag, 140);
  assert.equal(pickAudio(f.slice(0, 2)).itag, 139, 'jamais WebM');
  assert.equal(pickAudio([f[0]]), null);
});

test('Validation : titres et images reçus du client', () => {
  const t = cleanTrack({ id: 'Tk-vgRMoPnY', title: ' Jefe ', artists: [{ name: 'Ninho', id: 'UCBNTNHPngOpC-yeC8VpAPJQ' }, { name: '' }], thumb: 'https://evil.com/x.jpg', dur: 178.4, explicit: 'oui' });
  assert.deepEqual(t, { id: 'Tk-vgRMoPnY', title: 'Jefe', artists: [{ name: 'Ninho', id: 'UCBNTNHPngOpC-yeC8VpAPJQ' }], album: null, thumb: null, dur: 178, explicit: false });
  assert.throws(() => cleanTrack({ id: '../etc' }), /Titre invalide/);
  assert.equal(cleanImage('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
  assert.throws(() => cleanImage('data:text/html;base64,AAAA'), /Image invalide/);
  assert.throws(() => cleanImage(`data:image/png;base64,${'A'.repeat(400001)}`), /Image invalide/);
});

test('Paroles : nettoyage du titre', () => {
  assert.equal(cleanTitle('Jefe (Clip officiel)'), 'Jefe');
  assert.equal(cleanTitle('Djadja [Official Video] (feat. X)'), 'Djadja');
  assert.equal(cleanTitle('Amour (Live)'), 'Amour (Live)');
});

test('E-mail OTP : code, nom Zeleph, durée, aucun contenu injecté', () => {
  const m = otpMessage('signup', '042917', 10);
  assert.match(m.subject, /^042917 : .*Zeleph/);
  assert.ok(m.html.includes('042917') && m.text.includes('042917') && m.text.includes('10 minutes'));
  assert.throws(() => otpMessage('signup', '<b>1</b>', 10));
  assert.throws(() => otpMessage('autre', '123456', 10));
});
