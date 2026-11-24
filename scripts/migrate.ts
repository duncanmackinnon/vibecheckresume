import { config } from 'dotenv';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
config({ path: '.env.local' }); config();
async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error('Set MIGRATION_DATABASE_URL to a database migration credential. Runtime DATABASE_URL must use a restricted login with the vibecheck_app role.');
  const pool = new Pool({ connectionString, max: 1 });
  try { await migrate(drizzle(pool), { migrationsFolder: './drizzle' }); console.log('Tracker migrations applied.'); }
  finally { await pool.end(); }
}
main().catch(() => { console.error('Migration failed. Verify the migration credential and database connectivity. No credentials are logged.'); process.exitCode = 1; });
