// Menu « … » d'un titre : file d'attente, favoris, playlists, aller à l'artiste / l'album, retirer de la playlist.
import { h, sheet, sheetHead, artistsText, ask, toast, cover, small, icon } from './ui.js';
import { get, post, del } from './api.js';
import * as player from './player.js';
import { go } from './nav.js';

export function trackMenu(t, { playlist = null, onRemoved = null } = {}) {
  const liked = player.likes.has(t.id);
  const artists = (t.artists ?? []).filter(a => a.id);
  sheet({
    head: sheetHead(t.thumb, t.title, artistsText(t)),
    items: [
      { label: 'Lire ensuite', icon: 'playNext', onClick: () => player.playNext(t) },
      { label: 'Ajouter à la file d\'attente', icon: 'playLater', onClick: () => player.playLater(t) },
      { label: liked ? 'Retirer des favoris' : 'Ajouter aux favoris', icon: liked ? 'heartOn' : 'heart', onClick: () => player.toggleLike(t) },
      { label: 'Ajouter à une playlist…', icon: 'plus', onClick: () => addToPlaylist(t) },
      artists.length ? { label: artists.length > 1 ? 'Aller à l\'artiste…' : `Aller à ${artists[0].name}`, icon: 'mic', onClick: () => (artists.length > 1 ? pickArtist(artists) : go(`/artist/${artists[0].id}`)) } : null,
      t.album?.id ? { label: `Aller à l'album`, icon: 'disc', onClick: () => go(`/collection/${t.album.id}`) } : null,
      playlist?.mine ? { label: 'Supprimer de la playlist', icon: 'trash', danger: true, onClick: () => removeFrom(playlist, t, onRemoved) } : null,
    ],
  });
}

function pickArtist(artists) {
  sheet({ head: h('div.sheet-title', {}, 'Artistes'), items: artists.map(a => ({ label: a.name, icon: 'mic', onClick: () => go(`/artist/${a.id}`) })) });
}

async function removeFrom(pl, t, done) {
  try { await del(`/playlists/${pl.id}/tracks/${t.id}`); toast('Retiré de la playlist'); done?.(); }
  catch (e) { toast(e.message); }
}

export async function addToPlaylist(t) {
  let lib;
  try { lib = await get('/library'); } catch (e) { return toast(e.message); }
  const create = async () => {
    const name = await ask('Nouvelle playlist', { placeholder: 'Nom de la playlist', ok: 'Créer' });
    if (!name) return;
    try { await post('/playlists', { name, track: t }); toast(`Ajouté à « ${name} »`); } catch (e) { toast(e.message); }
  };
  const add = async p => {
    try { const r = await post(`/playlists/${p.id}/tracks`, { track: t }); toast(r.added ? `Ajouté à « ${p.name} »` : `Déjà dans « ${p.name} »`); } catch (e) { toast(e.message); }
  };
  const close = sheet({
    head: h('div.sheet-title', {}, 'Ajouter à une playlist'),
    body: h('div.pick', {},
      h('button.pick-row', { type: 'button', onclick: () => { close(); create(); } }, h('div.cover.ph.new', {}, icon('plus')), h('span', {}, 'Nouvelle playlist…')),
      lib.playlists.map(p => h('button.pick-row', { type: 'button', onclick: () => { close(); add(p); } }, cover(small(p.cover), 'cover'), h('span', {}, p.name), h('small', {}, `${p.count}`)))),
  });
}
