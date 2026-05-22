import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { runSqliteMigrations } from '../src/repositories/sqlite.migrations.js';

describe('SQLite migrations', () => {
  it('creates the orders table and records applied migrations', () => {
    const db = new Database(':memory:');

    try {
      runSqliteMigrations(db);

      const migration = db
        .prepare('SELECT id, name FROM schema_migrations WHERE id = ?')
        .get(1);
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get('orders');

      const migration2 = db
        .prepare('SELECT id, name FROM schema_migrations WHERE id = ?')
        .get(2);

      expect(migration).toEqual({ id: 1, name: 'create_orders' });
      expect(migration2).toEqual({ id: 2, name: 'add_user_id_to_orders' });
      expect(table).toEqual({ name: 'orders' });
    } finally {
      db.close();
    }
  });

  it('is idempotent — running migrations twice does not throw or duplicate entries', () => {
    const db = new Database(':memory:');

    try {
      runSqliteMigrations(db);
      runSqliteMigrations(db);

      const { count } = db
        .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
        .get() as { count: number };

      // One entry per migration (2 total), not duplicated on second run
      expect(count).toBe(2);
    } finally {
      db.close();
    }
  });
});
