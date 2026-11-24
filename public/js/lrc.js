// Paroles LRC « [mm:ss.xx] texte » → [{ t: secondes, l: ligne }] triées. Une ligne peut porter plusieurs horodatages.
export function parseLrc(src) {
  const out = [];
  for (const raw of String(src ?? '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const l = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(`0.${m[3]}`) : 0), l });
  }
  return out.sort((a, b) => a.t - b.t);
}

// Index de la ligne active à l'instant `time` (recherche dichotomique), -1 avant la première.
export function activeLine(lines, time) {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time + 0.15) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
