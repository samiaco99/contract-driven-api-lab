import type Database from 'better-sqlite3';
import { ORDER_STATUSES } from '../schemas/order.schema.js';

interface Migration {
  id: number;
  name: string;
  up(db: Database.Database): void;
}

// Safe: ORDER_STATUSES is a compile-time const, never user input.
// SQLite CHECK constraints don't accept bound parameters, so interpolation is required here.
const allowedStatuses = ORDER_STATUSES.map((status) => `'${status}'`).join(
  ', '
);

const migrations: Migration[] = [
  {
    id: 1,
    name: 'create_orders',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          status TEXT NOT NULL CHECK(status IN (${allowedStatuses})),
          total REAL NOT NULL CHECK(total >= 0)
        );
      `);
    },
  },
  {
    id: 2,
    name: 'add_user_id_to_orders',
    up(db) {
      db.exec(`
        ALTER TABLE orders ADD COLUMN user_id TEXT NOT NULL DEFAULT 'system';
      `);
    },
  },
];

export function runSqliteMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => (row as { id: number }).id)
  );

  const applyMigration = db.transaction((migration: Migration) => {
    migration.up(db);
    db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
      migration.id,
      migration.name
    );
  });

  for (const migration of migrations) {
    if (!applied.has(migration.id)) {
      applyMigration(migration);
    }
  }
}
