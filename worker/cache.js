// Cache serveur à deux niveaux : mémoire de l'isolat (L1) puis KV (binding CACHE, partagé entre data centers) ou Cache API.
// shortcut: la Cache API est sans effet sur *.workers.dev ; sans KV ni domaine perso, seul le cache mémoire de l'isolat sert.
const L1 = new Map(), L1_MAX = 400;
const keyUrl = k => new Request(`https://cache.zeleph.internal/${encodeURIComponent(k)}`);

function remember(k, v, ttl) {
  if (L1.size >= L1_MAX) L1.delete(L1.keys().next().value);
  L1.set(k, { v, exp: Date.now() + ttl * 1e3 });
}

export async function cached(env, key, ttl, fn, { kv = false } = {}) {
  const hit = L1.get(key);
  if (hit && hit.exp > Date.now()) return hit.v;
  const store = kv && env.CACHE ? env.CACHE : null, cache = !store && globalThis.caches?.default;
  try {
    const raw = store ? await store.get(key) : cache ? await (await cache.match(keyUrl(key)))?.text() : null;
    if (raw) { const v = JSON.parse(raw); remember(key, v, Math.min(ttl, 600)); return v; }
  } catch (e) { console.error('cache : lecture', e.name); }
  const v = await fn();
  remember(key, v, ttl);
  const body = JSON.stringify(v);
  try {
    if (store) await store.put(key, body, { expirationTtl: Math.max(60, ttl) });
    else if (cache) await cache.put(keyUrl(key), new Response(body, { headers: { 'cache-control': `max-age=${ttl}` } }));
  } catch (e) { console.error('cache : écriture', e.name); }
  return v;
}

export async function forget(env, key, { kv = false } = {}) {
  L1.delete(key);
  try {
    if (kv && env.CACHE) await env.CACHE.delete(key);
    else await globalThis.caches?.default?.delete(keyUrl(key));
  } catch { /* rien à effacer */ }
}

// Petit drapeau mémoire (ex. « extraction directe bloquée sur cette IP pendant 10 min »).
export const flag = { get: k => (L1.get(k)?.exp ?? 0) > Date.now(), set: (k, ttl) => remember(k, true, ttl) };
