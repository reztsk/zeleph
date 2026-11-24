// Client HTTP : même origine, session par cookie HttpOnly (aucun jeton côté JavaScript).
const listeners = new Set();
export const onUnauthorized = f => listeners.add(f);

export async function api(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Pas de connexion internet'), { status: 0, code: 'offline' });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/auth/')) listeners.forEach(f => f());
    throw Object.assign(new Error(data.message || `Erreur ${r.status}`), { status: r.status, code: data.error });
  }
  return data;
}

export const get = p => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body = {}) => api(p, { method: 'PUT', body });
export const del = p => api(p, { method: 'DELETE' });
