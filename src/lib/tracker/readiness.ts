import { getPool } from './db';

export type DatabaseReadiness = {ready:boolean; reason:'ready'|'unconfigured'|'unreachable'|'unsafe_role'|'migrations_required'};
/** Reads catalogs and zero rows only; never needs an ownership-policy bypass. */
export async function databaseReadiness(): Promise<DatabaseReadiness> {
  if (!process.env.DATABASE_URL) return {ready:false,reason:'unconfigured'};
  let client;
  try {
    client = await getPool().connect();
    const role = await client.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
    if (!role.rows[0] || role.rows[0].rolsuper || role.rows[0].rolbypassrls) return {ready:false,reason:'unsafe_role'};
    const tables = await client.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
      pg_has_role(c.relowner,'USAGE') AS owns_table
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='tracker' AND c.relname=ANY($1::text[])`, [['users','records','operations','openai_connections','openai_oauth_transactions','auth_credentials']]);
    if (tables.rows.some(row => row.owns_table)) return {ready:false,reason:'unsafe_role'};
    if (tables.rows.length !== 6 || tables.rows.some(row => !row.relrowsecurity || !row.relforcerowsecurity)) return {ready:false,reason:'migrations_required'};
    const policies = await client.query(`SELECT c.relname,p.polcmd,p.polpermissive,
      pg_get_expr(p.polqual,p.polrelid) AS ownership_using,
      pg_get_expr(p.polwithcheck,p.polrelid) AS ownership_check
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='tracker' AND c.relname=ANY($1::text[])`, [['users','records','operations','openai_connections','openai_oauth_transactions','auth_credentials']]);
    const normalize=(value:unknown)=>typeof value==='string'?value.toLowerCase().replace(/\s|::text|[()]/g,''):'';
    // Exactly one permissive owner policy per table; an extra permissive policy can bypass ownership.
    if(policies.rows.length!==6 || tables.rows.some(table=>{
      const rows=policies.rows.filter(policy=>policy.relname===table.relname);
      const ownerCol = table.relname === 'users' ? 'id' : table.relname === 'auth_credentials' ? 'user_id' : 'owner_id';
      const expected=normalize(`${ownerCol} = NULLIF(current_setting('app.user_id',true),'')::uuid`);
      return rows.length!==1 || rows[0].polcmd!=='*' || !rows[0].polpermissive || normalize(rows[0].ownership_using)!==expected || normalize(rows[0].ownership_check)!==expected;
    })) return {ready:false,reason:'migrations_required'};
    const draft = await client.query("SELECT to_regclass('tracker.records_one_onboarding_draft_per_owner') IS NOT NULL AS present");
    if (!draft.rows[0]?.present) return {ready:false,reason:'migrations_required'};
    await client.query('SELECT 1 FROM tracker.users LIMIT 0');
    await client.query('SELECT 1 FROM tracker.openai_connections LIMIT 0');
    await client.query('SELECT 1 FROM tracker.auth_credentials LIMIT 0');
    return {ready:true,reason:'ready'};
  } catch { return {ready:false,reason:'unreachable'}; }
  finally { client?.release(); }
}
