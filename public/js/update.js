// Mises à jour : VERSION est estampillée par le Worker à chaque déploiement ; on la compare à /api/version
// au démarrage, toutes les 2 min et à chaque retour au premier plan (iOS). Nouvelle version → bannière,
// caches vidés, rechargement. La session (cookie HttpOnly) et la file d'attente (localStorage) sont conservées.
import { get } from './api.js';
import { toast } from './ui.js';
import { audio } from './player.js';

export const VERSION = '__APP_VERSION__';
const TRIED = 'zeleph.update';
let applying = false;

async function reload() {
  try { await Promise.all((await caches.keys()).map(k => caches.delete(k))); } catch { /* Cache Storage indisponible */ }
  try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* hors ligne : le navigateur réessaiera */ }
  location.reload();
}

// manual = bouton des Réglages : rechargement immédiat. Sinon on attend la pause pour ne pas couper la musique,
// et une seule tentative par version (évite une boucle si un cache intermédiaire sert encore l'ancienne).
export async function checkUpdate(manual = false) {
  const { version } = await get('/version');
  if (!version || version === VERSION) return false;
  if (applying || (!manual && sessionStorage.getItem(TRIED) === version)) return true;
  applying = true;
  try { sessionStorage.setItem(TRIED, version); } catch { /* navigation privée */ }
  toast('Nouvelle mise à jour disponible — mise à jour en cours…', 8000);
  if (manual || audio.paused) reload();
  else audio.addEventListener('pause', reload, { once: true });
  return true;
}

export function watchUpdates() {
  const quiet = () => checkUpdate().catch(() => {});
  quiet();
  setInterval(quiet, 120000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') quiet(); });
  window.addEventListener('pageshow', e => { if (e.persisted) quiet(); });
}
