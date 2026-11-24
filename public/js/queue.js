// File d'attente (logique pure, testée) : titre en cours, « À suivre » (contexte + ajouts manuels),
// « Poursuivre la lecture » (titres similaires ajoutés automatiquement), et historique pour « Précédent ».
const PAST_MAX = 100;

export class Queue {
  constructor(s = {}) {
    this.current = s.current ?? null;
    this.next = s.next ?? [];
    this.auto = s.auto ?? [];
    this.past = s.past ?? [];
  }
  toJSON() { return { current: this.current, next: this.next.slice(0, 500), auto: this.auto.slice(0, 60), past: this.past.slice(-PAST_MAX) }; }

  playList(tracks, i = 0) {
    this.past = tracks.slice(Math.max(0, i - PAST_MAX), i);
    this.current = tracks[i] ?? null;
    this.next = tracks.slice(i + 1);
    this.auto = [];
    return this.current;
  }
  playNext(t) { this.next.unshift(t); }
  playLater(t) { this.next.push(t); }

  advance() {
    if (this.current) this.past.push(this.current);
    if (this.past.length > PAST_MAX) this.past.shift();
    this.current = this.next.shift() ?? this.auto.shift() ?? null;
    return this.current;
  }
  back() {
    if (!this.past.length) return null;
    if (this.current) this.next.unshift(this.current);
    this.current = this.past.pop();
    return this.current;
  }

  list(name) { return name === 'auto' ? this.auto : this.next; }
  // Monter / descendre d'une place dans sa section.
  move(name, i, dir) {
    const l = this.list(name), j = i + dir;
    if (i < 0 || i >= l.length || j < 0 || j >= l.length) return false;
    [l[i], l[j]] = [l[j], l[i]];
    return true;
  }
  // Passer en premier : en tête de « À suivre », quelle que soit sa section.
  toTop(name, i) {
    const [t] = this.list(name).splice(i, 1);
    if (t) this.next.unshift(t);
    return !!t;
  }
  remove(name, i) { return this.list(name).splice(i, 1).length === 1; }
  // Toucher un titre de la file : on y saute, les titres sautés partent dans l'historique.
  jump(name, i) {
    const l = this.list(name);
    if (i < 0 || i >= l.length) return null;
    const skipped = name === 'auto' ? [...this.next.splice(0), ...l.splice(0, i)] : l.splice(0, i);
    if (this.current) this.past.push(this.current);
    this.past.push(...skipped);
    this.past.splice(0, Math.max(0, this.past.length - PAST_MAX));
    this.current = l.shift();
    return this.current;
  }
  shuffleNext() {
    for (let i = this.next.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.next[i], this.next[j]] = [this.next[j], this.next[i]]; }
  }
  clearNext() { this.next = []; }
  peek() { return this.next[0] ?? this.auto[0] ?? null; }
  needsAuto() { return this.next.length + this.auto.length < 3; }
  // Ajoute des suggestions sans doublon avec ce qui est déjà en file ou écouté récemment.
  fillAuto(tracks) {
    const seen = new Set([this.current, ...this.next, ...this.auto, ...this.past.slice(-30)].filter(Boolean).map(t => t.id));
    for (const t of tracks) if (!seen.has(t.id)) { this.auto.push(t); seen.add(t.id); }
  }
}

export function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
