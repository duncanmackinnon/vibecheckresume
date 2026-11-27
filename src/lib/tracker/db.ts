import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { TrackerError } from './errors';

let pool: Pool | undefined;
let testPoolOverride = false;
let runtimePoolUrl: string | undefined;

interface PgliteCacheEntry {
  pg: import('@electric-sql/pglite').PGlite;
  migrated: boolean;
  tail: Promise<void>;
}

const PGLITE_GLOBAL_KEY = '__vibecheckPgliteCache' as const;

export function isPgliteUrl(url = process.env.DATABASE_URL): boolean {
  return Boolean(url && (url.startsWith('pglite://') || url === 'memory://'));
}

export function resolvePgliteDataDir(url: string): string | undefined {
  if (url === 'memory://' || url === 'pglite://memory') return undefined;
  const raw = url.slice('pglite://'.length);
  return path.resolve(process.cwd(), raw);
}

function pgliteCache(): Map<string, PgliteCacheEntry> {
  const g = globalThis as unknown as Record<string, Map<string, PgliteCacheEntry> | undefined>;
  if (!g[PGLITE_GLOBAL_KEY]) g[PGLITE_GLOBAL_KEY] = new Map<string, PgliteCacheEntry>();
  return g[PGLITE_GLOBAL_KEY]!;
}

async function getPgliteEntry(url: string): Promise<PgliteCacheEntry> {
  const dataDir = resolvePgliteDataDir(url);
  const cacheKey = dataDir ?? 'memory';
  const cache = pgliteCache();
  let entry = cache.get(cacheKey);
  if (!entry) {
    if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = dataDir ? new PGlite(dataDir) : new PGlite();
    entry = { pg, migrated: false, tail: Promise.resolve() };
    cache.set(cacheKey, entry);
  }
  return entry;
}

function runWithEntryLock<T>(entry: PgliteCacheEntry, fn: () => Promise<T>): Promise<T> {
  const prev = entry.tail;
  let release!: () => void;
  entry.tail = new Promise<void>((resolve) => { release = resolve; });
  return prev.then(fn).finally(() => release());
}

export async function ensurePgliteMigrated(url = process.env.DATABASE_URL || 'pglite://.data/pgdata'): Promise<void> {
  const entry = await getPgliteEntry(url);
  if (entry.migrated) return;
  await runWithEntryLock(entry, async () => {
    if (entry.migrated) return;
    await entry.pg.waitReady;
    await entry.pg.exec(`
      CREATE SCHEMA IF NOT EXISTS drizzle;
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL UNIQUE,
        created_at bigint
      );
    `);
    const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
    const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const appliedRows = await entry.pg.query<{ hash: string }>('SELECT hash FROM drizzle.__drizzle_migrations');
    const applied = new Set(appliedRows.rows.map((row) => row.hash));
    for (const item of journal.entries) {
      const sql = fs.readFileSync(path.join(migrationsFolder, `${item.tag}.sql`), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      if (applied.has(hash)) continue;
      const cleanSql = sql.replace(/-->\s*statement-breakpoint/g, '');
      await entry.pg.exec(`BEGIN;\n${cleanSql}\nCOMMIT;`);
      await entry.pg.query(
        'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING',
        [hash, item.when],
      );
    }
    await entry.pg.exec('SET ROLE vibecheck_app;');
    entry.migrated = true;
  });
}

export async function closePgliteEntry(url = process.env.DATABASE_URL || 'pglite://.data/pgdata'): Promise<void> {
  const dataDir = resolvePgliteDataDir(url);
  const cacheKey = dataDir ?? 'memory';
  const cache = pgliteCache();
  const entry = cache.get(cacheKey);
  if (!entry) return;
  await entry.tail;
  cache.delete(cacheKey);
  await entry.pg.close();
}

function createPglitePool(url: string): Pool {
  const executeQuery = async (
    pg: import('@electric-sql/pglite').PGlite,
    textOrConfig: string | { text: string; values?: unknown[] },
    values?: unknown[],
  ) => {
    const sql = typeof textOrConfig === 'string' ? textOrConfig : textOrConfig.text;
    const params = typeof textOrConfig === 'string' ? values : textOrConfig.values;
    return pg.query(sql, params);
  };

  return {
    query: async (textOrConfig: string | { text: string; values?: unknown[] }, values?: unknown[]) => {
      await ensurePgliteMigrated(url);
      const entry = await getPgliteEntry(url);
      return runWithEntryLock(entry, () => executeQuery(entry.pg, textOrConfig, values));
    },
    connect: async () => {
      await ensurePgliteMigrated(url);
      const entry = await getPgliteEntry(url);
      const prev = entry.tail;
      let releaseLock!: () => void;
      entry.tail = new Promise<void>((resolve) => { releaseLock = resolve; });
      await prev;
      let released = false;
      return {
        query: (textOrConfig: string | { text: string; values?: unknown[] }, values?: unknown[]) =>
          executeQuery(entry.pg, textOrConfig, values),
        release: () => {
          if (released) return;
          released = true;
          releaseLock();
        },
      } as unknown as PoolClient;
    },
    end: async () => {
      const dataDir = resolvePgliteDataDir(url);
      const cacheKey = dataDir ?? 'memory';
      const entry = pgliteCache().get(cacheKey);
      if (!entry) return;
      await entry.tail;
      pgliteCache().delete(cacheKey);
      await entry.pg.close();
    },
  } as unknown as Pool;
}

export function setPoolForTests(value: Pool) {
  if (process.env.NODE_ENV !== 'test') throw new Error('A test pool can only be installed in the test environment.');
  pool = value;
  testPoolOverride = Boolean(value);
  runtimePoolUrl = undefined;
}
const context = new AsyncLocalStorage<{ ownerId: string; client: PoolClient }>();
export function getPool() {
  if (process.env.NODE_ENV === 'test' && testPoolOverride && pool) return pool;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new TrackerError('Connect a database to save your workspace.', 503, 'DATABASE_UNCONFIGURED');
  if (pool && runtimePoolUrl === databaseUrl) return pool;
  runtimePoolUrl = databaseUrl;
  if (isPgliteUrl(databaseUrl)) {
    pool = createPglitePool(databaseUrl);
    return pool;
  }
  const configuredMax = Number(process.env.TRACKER_DB_POOL_MAX || 3);
  const max = Number.isInteger(configuredMax) && configuredMax >= 1 && configuredMax <= 10 ? configuredMax : 3;
  pool = new Pool({ connectionString: databaseUrl, max, connectionTimeoutMillis: 8000, idleTimeoutMillis: 20000 });
  return pool;
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
    if (isPgliteUrl(process.env.DATABASE_URL) && !(process.env.NODE_ENV === 'test' && testPoolOverride)) {
      await client.query('SET LOCAL ROLE vibecheck_app');
    }
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
