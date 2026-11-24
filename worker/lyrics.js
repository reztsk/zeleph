import { cached } from './cache.js';

// Paroles synchronisées (format LRC) via LRCLIB : API libre, sans clé. Le client les découpe (public/js/lrc.js).
const UA = 'Zeleph/1.0 (lecteur musical PWA)';
export const cleanTitle = t => String(t ?? '')
  .replace(/\s*[([][^)\]]*(feat|ft\.|clip|official|officiel|vid[ée]o|audio|lyrics|paroles|visuali[sz]er|remaster|prod\.?)[^)\]]*[)\]]/gi, '')
  .replace(/\s+-\s+topic$/i, '').trim();

async function lrclib(path) {
  const r = await fetch(`https://lrclib.net/api/${path}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`lrclib ${r.status}`);
  return r.json();
}

export async function lyrics(env, { title, artist, dur }) {
  const t = cleanTitle(title).slice(0, 200), a = String(artist ?? '').split(/,|&| feat/i)[0].trim().slice(0, 120), d = Math.round(Number(dur) || 0);
  if (!t) return { synced: null, plain: null };
  return cached(env, `l:${a}|${t}|${d}`.toLowerCase(), 86400, async () => {
    const q = new URLSearchParams({ track_name: t, artist_name: a, ...(d > 0 && { duration: String(d) }) });
    let hit = await lrclib(`get?${q}`).catch(() => null);
    if (!hit?.syncedLyrics) {
      const list = await lrclib(`search?${new URLSearchParams({ q: `${a} ${t}`.trim() })}`).catch(() => null);
      hit = (list ?? []).find(x => x.syncedLyrics && (!d || Math.abs(x.duration - d) < 6)) ?? hit ?? (list ?? [])[0] ?? null;
    }
    return { synced: hit?.syncedLyrics ?? null, plain: hit?.plainLyrics ?? null };
  });
}
