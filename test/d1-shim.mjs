// Adaptateur « D1 » au-dessus de node:sqlite : fait tourner le vrai code du Worker dans les tests, sans wrangler.
// Reproduit le sous-ensemble utilisé : prepare().bind().run()/all()/first(), batch() atomique.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function createD1(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL('../worker/schema.sql', import.meta.url), 'utf8'));
  const isRead = sql => /^\s*(select|with|pragma)/i.test(sql);
  const meta = r => ({ changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) });
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    async run() { return { success: true, results: [], meta: meta(db.prepare(sql).run(...params)) }; },
    async all() { return { success: true, results: db.prepare(sql).all(...params).map(r => ({ ...r })), meta: {} }; },
    async first(col) { const r = db.prepare(sql).get(...params); return r ? (col ? r[col] : { ...r }) : null; },
    _exec() {
      const s = db.prepare(sql);
      return isRead(sql) ? { success: true, results: s.all(...params).map(r => ({ ...r })), meta: {} } : { success: true, results: [], meta: meta(s.run(...params)) };
    },
  });
  return {
    prepare: sql => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try { const out = list.map(s => s._exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    exec: sql => db.exec(sql),
    raw: db,
  };
}
