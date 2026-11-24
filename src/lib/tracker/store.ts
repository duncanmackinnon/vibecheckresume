import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { currentClient, withOwnerTransaction } from './db';
import { TrackerError } from './errors';
import type { RecordKind, StoredRecord, User } from './types';
export { withOwnerTransaction } from './db';

function decode<T>(row: any): StoredRecord<T> {
  return { id: row.id, ownerId: row.owner_id, kind: row.kind, applicationId: row.application_id, version: row.version,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), data: row.data };
}
export async function listRecords<T>(ownerId: string, kind: RecordKind, filter?: { applicationId?: string }): Promise<StoredRecord<T>[]> {
  return withOwnerTransaction(ownerId, async () => {
    const result = await currentClient().query('SELECT * FROM tracker.records WHERE owner_id=$1 AND kind=$2 AND ($3::uuid IS NULL OR application_id=$3) ORDER BY created_at DESC, id', [ownerId, kind, filter?.applicationId || null]);
    return result.rows.map(decode<T>);
  });
}
export async function getRecord<T>(ownerId: string, kind: RecordKind, id: string): Promise<StoredRecord<T>> {
  return withOwnerTransaction(ownerId, async () => {
    const result = await currentClient().query('SELECT * FROM tracker.records WHERE owner_id=$1 AND kind=$2 AND id=$3', [ownerId, kind, id]);
    if (!result.rows[0]) throw new TrackerError('This record was not found.', 404, 'NOT_FOUND');
    return decode<T>(result.rows[0]);
  });
}
export async function createRecord<T>(ownerId: string, kind: RecordKind, data: T, options: { id?: string; applicationId?: string | null } = {}): Promise<StoredRecord<T>> {
  return withOwnerTransaction(ownerId, async () => {
    const id = options.id || randomUUID();
    if (options.applicationId) await getRecord(ownerId, 'application', options.applicationId);
    const result = await currentClient().query('INSERT INTO tracker.records(id,owner_id,kind,application_id,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING RETURNING *', [id, ownerId, kind, options.applicationId || null, JSON.stringify(data)]);
    if (result.rows[0]) return decode<T>(result.rows[0]);
    const existing = await getRecord<T>(ownerId, kind, id);
    if (!isDeepStrictEqual(existing.data, JSON.parse(JSON.stringify(data))) || existing.applicationId !== (options.applicationId || null)) throw new TrackerError('This request already exists with different content.', 409, 'CONFLICT');
    return existing;
  });
}
export async function updateRecord<T>(ownerId: string, kind: RecordKind, id: string, data: T, expectedVersion: number): Promise<StoredRecord<T>> {
  return withOwnerTransaction(ownerId, async () => {
    await getRecord(ownerId, kind, id);
    const result = await currentClient().query('UPDATE tracker.records SET data=$4,version=version+1,updated_at=now() WHERE owner_id=$1 AND kind=$2 AND id=$3 AND version=$5 RETURNING *', [ownerId, kind, id, JSON.stringify(data), expectedVersion]);
    if (!result.rows[0]) throw new TrackerError('This record changed elsewhere. Refresh before saving again.', 409, 'CONFLICT');
    return decode<T>(result.rows[0]);
  });
}
export async function deleteRecord(ownerId: string, kind: RecordKind, id: string): Promise<void> {
  return withOwnerTransaction(ownerId, async () => {
    await getRecord(ownerId, kind, id);
    await currentClient().query('DELETE FROM tracker.records WHERE owner_id=$1 AND kind=$2 AND id=$3', [ownerId, kind, id]);
  });
}
export async function saveUser(user: User, issuer: string, subject: string) {
  return withOwnerTransaction(user.id, async () => {
    await currentClient().query('INSERT INTO tracker.users(id,issuer,subject,email,name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name', [user.id, issuer, subject, user.email, user.name]);
  });
}
export async function getUser(ownerId: string): Promise<User> {
  return withOwnerTransaction(ownerId, async () => {
    const result = await currentClient().query('SELECT id,email,name FROM tracker.users WHERE id=$1', [ownerId]);
    if (!result.rows[0]) throw new TrackerError('Sign in to access your workspace.', 401, 'UNAUTHENTICATED');
    return result.rows[0];
  });
}
export async function idempotent<T>(ownerId: string, key: string, operation: string, input: unknown, callback: () => Promise<T>): Promise<T> {
  if (!key || key.length > 200) throw new TrackerError('A request identifier is required.');
  return withOwnerTransaction(ownerId, async () => {
    // Serializes only retries for this user's key; the response and domain writes commit together.
    await currentClient().query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${ownerId}:${key}`]);
    const existing = await currentClient().query('SELECT operation,input,result FROM tracker.operations WHERE owner_id=$1 AND key=$2', [ownerId, key]);
    if (existing.rows[0]) {
      const saved = existing.rows[0];
      const matches = await currentClient().query('SELECT $1::jsonb = $2::jsonb AS same', [JSON.stringify(saved.input), JSON.stringify(input)]);
      if (saved.operation !== operation || !matches.rows[0].same) throw new TrackerError('A request identifier cannot be reused for different changes.', 409, 'CONFLICT');
      return saved.result as T;
    }
    const result = await callback();
    await currentClient().query('INSERT INTO tracker.operations(owner_id,key,operation,input,result) VALUES($1,$2,$3,$4,$5)', [ownerId, key, operation, JSON.stringify(input), JSON.stringify(result)]);
    return result;
  });
}
