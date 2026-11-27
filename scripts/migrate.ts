import { config } from 'dotenv';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closePgliteEntry, ensurePgliteMigrated, isPgliteUrl } from '../src/lib/tracker/db';

config({ path: '.env.local' });
config();

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set MIGRATION_DATABASE_URL or DATABASE_URL before running db:init.');
  }

  if (isPgliteUrl(connectionString)) {
    try {
      await ensurePgliteMigrated(connectionString);
      console.log(`Tracker migrations applied to PGlite (${connectionString}).`);
    } finally {
      await closePgliteEntry(connectionString);
    }
    return;
  }

  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
    if (process.env.APP_DB_PASSWORD) {
      const escaped = process.env.APP_DB_PASSWORD.replace(/'/g, "''");
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vibecheck_runtime') THEN
            EXECUTE 'CREATE ROLE vibecheck_runtime LOGIN PASSWORD ''${escaped}'' INHERIT';
          ELSE
            EXECUTE 'ALTER ROLE vibecheck_runtime WITH LOGIN PASSWORD ''${escaped}''';
          END IF;
        END
        $$;
        GRANT vibecheck_app TO vibecheck_runtime;
      `);
    }
    console.log('Tracker migrations applied.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Migration failed. Verify database connectivity and credentials.', error instanceof Error ? error.message : '');
  process.exitCode = 1;
});
