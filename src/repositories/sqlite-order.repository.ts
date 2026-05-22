import Database from 'better-sqlite3';
import {
  ORDER_STATUSES,
  type CreateOrderInput,
  type Order,
  type OrderStatus,
  type PaginatedOrders,
} from '../schemas/order.schema.js';
import { type PaginationOptions, type RepoLogger, OrderRepository } from './order.repository.js';
import { runSqliteMigrations } from './sqlite.migrations.js';

export interface SqliteOrderRepositoryOptions {
  filename?: string;
  seed?: boolean;
}

interface SqliteOrderRow {
  id: number;
  userId: string;
  status: string;
  total: number;
}

export class SqliteOrderRepository implements OrderRepository {
  private db: Database.Database;

  constructor(options: SqliteOrderRepositoryOptions = {}) {
    const { filename = ':memory:', seed = false } = options;

    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    runSqliteMigrations(this.db);

    if (seed) {
      this.seedIfEmpty();
    }
  }

  private seedIfEmpty(): void {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM orders')
      .get() as { count: number };

    if (row.count === 0) {
      this.db
        .prepare('INSERT INTO orders (id, status, total, user_id) VALUES (?, ?, ?, ?)')
        .run(1, ORDER_STATUSES[0], 120, 'system');
    }
  }

  async findAll(
    opts: PaginationOptions = { limit: 20, cursor: 0 },
    log?: RepoLogger
  ): Promise<PaginatedOrders> {
    log?.debug({ opts }, 'findAll called');
    const { limit, cursor } = opts;
    const rows = this.db
      .prepare(
        'SELECT id, user_id AS userId, status, total FROM orders WHERE id > ? ORDER BY id LIMIT ?'
      )
      .all(cursor, limit + 1) as SqliteOrderRow[];

    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows) as Order[];

    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async findById(id: number, log?: RepoLogger): Promise<Order | undefined> {
    log?.debug({ id }, 'findById called');
    return this.db
      .prepare('SELECT id, user_id AS userId, status, total FROM orders WHERE id = ?')
      .get(id) as Order | undefined;
  }

  async create(data: CreateOrderInput, log?: RepoLogger): Promise<Order> {
    log?.debug({ status: data.status, total: data.total }, 'create called');
    const result = this.db
      .prepare('INSERT INTO orders (status, total, user_id) VALUES (?, ?, ?)')
      .run(data.status, data.total, data.userId);

    return {
      id: Number(result.lastInsertRowid),
      userId: data.userId,
      status: data.status,
      total: data.total,
    };
  }

  async updateStatus(
    id: number,
    status: OrderStatus,
    log?: RepoLogger
  ): Promise<Order> {
    log?.debug({ id, status }, 'updateStatus called');
    this.db
      .prepare('UPDATE orders SET status = ? WHERE id = ?')
      .run(status, id);
    return this.db
      .prepare('SELECT id, user_id AS userId, status, total FROM orders WHERE id = ?')
      .get(id) as Order;
  }

  async deleteById(id: number, log?: RepoLogger): Promise<boolean> {
    log?.debug({ id }, 'deleteById called');
    const result = this.db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    return result.changes > 0;
  }

  async ping(): Promise<void> {
    this.db.prepare('SELECT 1').run();
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
