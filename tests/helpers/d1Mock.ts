import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createTestD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const m1 = readFileSync(join(process.cwd(), 'migrations/0001_initial_links.sql'), 'utf8');
  const m2 = readFileSync(join(process.cwd(), 'migrations/0002_auth_features_dynamic.sql'), 'utf8');
  const m3 = readFileSync(join(process.cwd(), 'migrations/0003_access_profiles.sql'), 'utf8');
  sqlite.exec(m1);
  sqlite.exec(m2);
  sqlite.exec(m3);

  const makeStatement = (sql: string, bindings: unknown[] = []) => {
    const stmtObj = {
      bind(...args: unknown[]) {
        return makeStatement(sql, args);
      },
      async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
        const prepared = sqlite.prepare(sql);
        const row = prepared.get(...(bindings as never[])) as Record<string, unknown> | undefined;
        if (!row) return null;
        if (colName) return (row[colName] as T) ?? null;
        return row as T;
      },
      async all<T = Record<string, unknown>>() {
        const prepared = sqlite.prepare(sql);
        const results = prepared.all(...(bindings as never[])) as T[];
        return { results, success: true, meta: {} };
      },
      async run() {
        const prepared = sqlite.prepare(sql);
        const info = prepared.run(...(bindings as never[]));
        return {
          success: true,
          meta: {
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
          },
        };
      },
      _execRaw() {
        const prepared = sqlite.prepare(sql);
        const info = prepared.run(...(bindings as never[]));
        return {
          success: true,
          meta: {
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
          },
        };
      },
    };
    return stmtObj;
  };

  return {
    prepare(sql: string) {
      return makeStatement(sql) as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const s of statements) {
        results.push((s as unknown as { _execRaw: () => unknown })._execRaw());
      }
      return results as D1Result[];
    },
    async exec(sql: string) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
    withSession() {
      return this as unknown as D1DatabaseSession;
    },
  } as unknown as D1Database;
}
