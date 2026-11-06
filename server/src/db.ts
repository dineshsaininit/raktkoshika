import pg from 'pg';
import { config } from './config.ts';
import { SCHEMA } from './db/schema.ts';

// Postgres returns bigint/numeric as strings by default; our numbers fit safely in JS numbers.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

/** Neon needs TLS. `sslmode=require` means "verify the certificate" in node-postgres today, so say that explicitly. */
const normalise = (url: string) => url.replace(/sslmode=(require|prefer|verify-ca)/, 'sslmode=verify-full');

let pool: pg.Pool | null = null;

export type Db = pg.Pool | pg.PoolClient;

export function db(): pg.Pool {
  if (!pool) throw new Error('Database is not connected');
  return pool;
}

export async function connectDb(url = config.databaseUrl) {
  if (!url) throw new Error('Set DATABASE_URL (your Neon connection string) in server/.env');
  pool = new pg.Pool({ connectionString: normalise(url), max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  pool.on('error', (e) => console.error('[db] idle client error', e.message));
  const r = await pool.query<{ db: string; host: string }>('select current_database() as db, inet_server_addr()::text as host');
  console.log(`[db] connected to Postgres database "${r.rows[0].db}"`);
  await pool.query(SCHEMA);
  return pool;
}

export async function disconnectDb() {
  await pool?.end();
  pool = null;
}

/** Runs one query. Pass a transaction client as `c` to run inside that transaction. */
export async function q<T extends pg.QueryResultRow = Record<string, any>>(sql: string, params: unknown[] = [], c: Db = db()) {
  return (await c.query<T>(sql, params)).rows;
}
export async function one<T extends pg.QueryResultRow = Record<string, any>>(sql: string, params: unknown[] = [], c: Db = db()) {
  return (await c.query<T>(sql, params)).rows[0] as T | undefined;
}
/** Number of rows changed by an update/delete. */
export async function run(sql: string, params: unknown[] = [], c: Db = db()) {
  return (await c.query(sql, params)).rowCount ?? 0;
}

/** Runs `fn` in a transaction: all of its writes happen, or none do. Money moves always go through here. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db().connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
