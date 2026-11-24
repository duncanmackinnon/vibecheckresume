import { pgSchema, uuid, text, jsonb, integer, timestamp, primaryKey, uniqueIndex, index, check, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
export const tracker = pgSchema('tracker');
export const users = tracker.table('users', { id: uuid('id').primaryKey(), issuer: text('issuer').notNull(), subject: text('subject').notNull(), email: text('email').notNull(), name: text('name').notNull() }, table => [uniqueIndex('users_identity').on(table.issuer, table.subject)]);
export const records = tracker.table('records', { id: uuid('id').primaryKey(), ownerId: uuid('owner_id').notNull().references(() => users.id), kind: text('kind').notNull(), applicationId: uuid('application_id'), data: jsonb('data').notNull(), version: integer('version').notNull().default(1), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() }, table => [
  index('records_owner_kind').on(table.ownerId, table.kind), index('records_application').on(table.ownerId, table.applicationId),
  uniqueIndex('records_one_profile_per_owner').on(table.ownerId).where(sql`${table.kind} = 'profile'`),
  uniqueIndex('records_one_onboarding_draft_per_owner').on(table.ownerId).where(sql`${table.kind} = 'onboarding_draft'`),
  check('records_kind_check', sql`${table.kind} IN ('application','entry','source_resume','analysis','builder_draft','resume_version','ai_job','conversation','message','connection','usage','profile','job_match','discovery_run','onboarding_draft')`),
]);
export const operations = tracker.table('operations', { ownerId: uuid('owner_id').notNull().references(() => users.id), key: text('key').notNull(), operation: text('operation').notNull(), input: jsonb('input').notNull(), result: jsonb('result').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow() }, table => [primaryKey({ columns: [table.ownerId, table.key] })]);
export const openaiConnections = tracker.table('openai_connections', {
  ownerId: uuid('owner_id').primaryKey().references(() => users.id), id: uuid('id').notNull().unique(),
  issuer: text('issuer').notNull(), clientId: text('client_id').notNull(), subject: text('subject').notNull(), email: text('email'), name: text('name'),
  credentials: text('credentials'), expiresAt: timestamp('expires_at', {withTimezone: true}), usagePausedUntil: timestamp('usage_paused_until', {withTimezone:true}),
  inferenceAuthorized: boolean('inference_authorized').notNull().default(false), selectedModel: text('selected_model'), status: text('status').notNull(),
  generation: integer('generation').notNull().default(1), version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(), updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, table => [uniqueIndex('openai_external_identity').on(table.issuer,table.clientId,table.subject),check('openai_connections_status_check',sql`${table.status} IN ('active','reconnect_required','disconnected')`)]);
export const openaiOauthTransactions = tracker.table('openai_oauth_transactions', {
  id: uuid('id').primaryKey(), ownerId: uuid('owner_id').notNull().references(() => users.id), stateHash: text('state_hash').notNull().unique(),
  browserHash: text('browser_hash').notNull(), verifier: text('verifier').notNull(), nonce: text('nonce').notNull(), redirectUri: text('redirect_uri').notNull(), returnTo: text('return_to').notNull(), priorGeneration: integer('prior_generation'),
  expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(), createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, table => [index('openai_transactions_owner_expiry').on(table.ownerId, table.expiresAt)]);
