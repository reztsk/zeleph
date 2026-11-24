// Démarrage : session → écran de connexion ou application (onglets, routes, mini-lecteur).
import { h, icon, toast, $ } from './ui.js';
import { get, post, onUnauthorized } from './api.js';
import { applyTheme } from './themes.js';
import { go, current, session } from './nav.js';
import * as player from './player.js';
import { refreshTheme } from './prefs.js';
import { mountMini, close as closePlayer } from './nowplaying.js';
import { renderAuth } from './views/auth.js';
import * as browse from './views/browse.js';
import * as lib from './views/library.js';
import * as social from './views/social.js';
import { settings } from './views/settings.js';
import { watchUpdates } from './update.js';

applyTheme(localStorage.getItem('zeleph.theme')); // thème instantané avant la réponse du serveur

const view = $('#view'), tabs = $('#tabs'), mini = $('#mini'), authRoot = $('#auth');
const TABS = [['/home', 'Accueil', 'home'], ['/search', 'Recherche', 'search'], ['/library', 'Bibliothèque', 'library'], ['/friends', 'Amis', 'friends']];
const ROUTES = [
  [/^\/home$/, () => browse.home(view)],
  [/^\/search$/, () => browse.search(view)],
  [/^\/library$/, () => lib.library(view)],
  [/^\/likes$/, () => lib.likes(view)],
  [/^\/playlist\/([\w-]+)$/, id => lib.playlist(view, id)],
  [/^\/collection\/([\w-]+)$/, id => browse.collection(view, id)],
  [/^\/artist\/([\w-]+)$/, id => browse.artist(view, id)],
  [/^\/friends$/, () => social.friends(view)],
  [/^\/me$/, () => social.profile(view, null)],
  [/^\/u\/([a-z0-9_]+)$/, hd => social.profile(view, hd)],
  [/^\/settings$/, () => settings(view, { onLogout: logout })],
];

function route() {
  if (!session.me) return;
  const path = current();
  const r = ROUTES.find(([re]) => re.test(path));
  if (!r) return go('/home');
  closePlayer();
  const root = `/${path.split('/')[1]}`;
  tabs.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.root === root || (root === '/likes' && a.dataset.root === '/library') || (root === '/playlist' && a.dataset.root === '/library')));
  view.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  Promise.resolve(r[1](...path.match(r[0]).slice(1))).catch(e => { console.error(e); toast('Erreur d\'affichage'); });
}

// Surligne le titre en cours dans toutes les listes affichées.
function markPlaying() {
  const id = player.state().track?.id;
  document.querySelectorAll('.row[data-vid]').forEach(r => r.classList.toggle('playing', r.dataset.vid === id));
}

function startApp(me) {
  session.me = me;
  localStorage.setItem('zeleph.theme', me.theme);
  refreshTheme();
  authRoot.hidden = true;
  authRoot.replaceChildren();
  document.body.classList.add('logged');
  tabs.replaceChildren(...TABS.map(([p, l, ic]) => h('a.tab', { href: `#${p}`, 'data-root': p }, icon(ic), h('span', {}, l))));
  player.loadLikes();
  streamToken().finally(player.restore); // jeton avant la 1re URL audio
  route();
}
// Jeton de flux (7 jours) : redemandé toutes les 6 h tant que l'app reste ouverte.
const streamToken = () => get('/stream-token').then(r => player.setStreamToken(r.token)).catch(() => {});
setInterval(() => { if (session.me) streamToken(); }, 6 * 36e5);

async function logout() {
  try { await post('/auth/logout'); } catch { /* déjà déconnecté */ }
  showAuth();
}
function showAuth() {
  session.me = null;
  player.audio.pause();
  player.setStreamToken(null);
  try { localStorage.removeItem('zeleph.queue'); } catch { /* privé */ }
  document.body.classList.remove('logged', 'has-mini');
  view.replaceChildren(); tabs.replaceChildren(); mini.hidden = true;
  closePlayer();
  authRoot.hidden = false;
  renderAuth(authRoot, me => { if (location.hash !== '#/home') location.hash = '/home'; startApp(me); });
}

onUnauthorized(() => { if (session.me) { toast('Session expirée, reconnecte-toi'); showAuth(); } });
window.addEventListener('hashchange', route);
player.on(t => { if (t === 'track' || t === 'queue') markPlaying(); });
let markQueued = false;
new MutationObserver(() => { if (!markQueued) { markQueued = true; requestAnimationFrame(() => { markQueued = false; markPlaying(); }); } }).observe(view, { childList: true, subtree: true });
mountMini(mini);

(async () => {
  try { startApp((await get('/me')).me); }
  catch (e) { if (e.status === 401) showAuth(); else { showAuth(); toast(e.message); } }
})();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
watchUpdates();
