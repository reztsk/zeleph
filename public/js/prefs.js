// Préférences locales à l'appareil + thème « Cover Dynamique » qui suit la pochette en cours.
import { applyTheme, themeById } from './themes.js';
import { coverColor } from './ui.js';
import { session } from './nav.js';
import * as player from './player.js';

const KEY = 'zeleph.prefs';
export const prefs = (() => { try { return { coverBg: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { coverBg: true }; } })();
export function setPref(k, v) { prefs[k] = v; try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* privé */ } player.audio.dispatchEvent(new Event('zeleph:prefs')); }

export async function refreshTheme() {
  const id = session.me?.theme ?? localStorage.getItem('zeleph.theme');
  if (!themeById(id).dynamic) return applyTheme(id);
  applyTheme(id, await coverColor(player.state().track?.thumb));
}
player.on(t => { if (t === 'track' && themeById(session.me?.theme).dynamic) refreshTheme(); });
