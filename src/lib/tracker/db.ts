import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient } from 'pg';
import { TrackerError } from './errors';

let pool: Pool | undefined;
export function setPoolForTests(value:Pool) {
  if(process.env.NODE_ENV!=='test') throw new Error('A test pool can only be installed in the test environment.');
  pool=value;
}
const context = new AsyncLocalStorage<{ ownerId: string; client: PoolClient }>();
export function getPool() {
  if (!process.env.DATABASE_URL) throw new TrackerError('Connect a database to save your workspace.', 503, 'DATABASE_UNCONFIGURED');
  const configuredMax = Number(process.env.TRACKER_DB_POOL_MAX || 3);
  const max = Number.isInteger(configuredMax) && configuredMax >= 1 && configuredMax <= 10 ? configuredMax : 3;
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max, connectionTimeoutMillis: 8000, idleTimeoutMillis: 20000 });
}
export async function withOwnerTransaction<T>(ownerId: string, callback: () => Promise<T>): Promise<T> {
  const active = context.getStore();
  if (active) {
    if (active.ownerId !== ownerId) throw new TrackerError('Account context mismatch.', 403, 'FORBIDDEN');
    return callback();
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const role = await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
    if (!role.rows[0] || role.rows[0].rolsuper || role.rows[0].rolbypassrls) throw new TrackerError('Database credentials must use the restricted application role.', 503, 'DATABASE_ROLE_UNSAFE');
    await client.query("SELECT set_config('app.user_id', $1, true)", [ownerId]);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))', [ownerId]);
    const result = await context.run({ ownerId, client }, callback);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export function currentClient() {
  const active = context.getStore();
  if (!active) throw new Error('An owner transaction is required.');
  return active.client;
}
