import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ensurePgliteMigrated, getPool } from '../src/lib/tracker/db';
import {
  authenticateNativeUser,
  createSessionToken,
  getNativeSessionUser,
  registerNativeUser,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '../src/lib/tracker/native-auth';
import { databaseReadiness } from '../src/lib/tracker/readiness';
import { executeAction, getApplication, getSnapshot } from '../src/lib/tracker/service';
import { downloadResume, listResumeSummaries, saveSessionBundle, uploadResume } from '../src/lib/resume-workspace/service';

describe('native PostgreSQL auth, RLS isolation, and file storage', () => {
  before(async () => {
    process.env.DATABASE_URL = 'memory://';
    process.env.AUTH_SECRET = 'integration-test-auth-secret-32-chars';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await ensurePgliteMigrated('memory://');
  });

  after(async () => {
    await getPool().end();
  });

  test('readiness reports ready after 0003_auth_credentials migration', async () => {
    const status = await databaseReadiness();
    assert.deepEqual(status, { ready: true, reason: 'ready' });
  });

  test('register, login, duplicate signup rejection, and session cookies work with PostgreSQL RLS', async () => {
    const alice = await registerNativeUser({
      email: 'Alice@Example.Test',
      password: 'correct-horse-battery',
      name: 'Alice',
    });
    assert.equal(alice.email, 'alice@example.test');
    assert.equal(alice.name, 'Alice');

    await assert.rejects(
      () => registerNativeUser({ email: 'alice@example.test', password: 'another-password' }),
      (err: unknown) => (err as { status?: number; code?: string }).status === 409 && (err as { code?: string }).code === 'EMAIL_EXISTS',
    );

    await assert.rejects(
      () => authenticateNativeUser({ email: 'alice@example.test', password: 'wrong-password' }),
      (err: unknown) => (err as { status?: number; code?: string }).status === 401 && (err as { code?: string }).code === 'INVALID_CREDENTIALS',
    );

    const loggedIn = await authenticateNativeUser({ email: 'alice@example.test', password: 'correct-horse-battery' });
    assert.equal(loggedIn.id, alice.id);

    const token = createSessionToken(alice);
    assert.equal(verifySessionToken(token)?.uid, alice.id);
    assert.equal(verifySessionToken(`${token}tampered`), null);

    const req = new Request('http://localhost:3000/api/tracker', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
    });
    const sessionUser = await getNativeSessionUser(req);
    assert.equal(sessionUser?.id, alice.id);
  });

  test('two native accounts are strictly isolated by PostgreSQL RLS', async () => {
    const alice = await authenticateNativeUser({ email: 'alice@example.test', password: 'correct-horse-battery' });
    const bob = await registerNativeUser({ email: 'bob@example.test', password: 'bob-secret-password', name: 'Bob' });

    const createdApp = (await executeAction(
      alice.id,
      'create_application',
      { company: 'Stripe', role: 'Backend Engineer', stage: 'Applied' },
      '00000000-0000-4000-8000-000000000101',
    )) as { id: string };

    const aliceSnap = await getSnapshot(alice.id);
    const bobSnap = await getSnapshot(bob.id);
    assert.equal(aliceSnap.applications.length, 1);
    assert.equal(aliceSnap.applications[0].id, createdApp.id);
    assert.equal(bobSnap.applications.length, 0);

    await assert.rejects(() => getApplication(bob.id, createdApp.id));
  });

  test('uploads and downloads resume bytes in PostgreSQL without Supabase Storage', async () => {
    const alice = await authenticateNativeUser({ email: 'alice@example.test', password: 'correct-horse-battery' });
    const resumeText = 'Alice\nalice@example.test\nSenior Backend Engineer with TypeScript, PostgreSQL, and Distributed Systems experience.';
    const file = new File([resumeText], 'alice-resume.txt', { type: 'text/plain' });

    const saved = await uploadResume(alice.id, file, '11111111-1111-4111-8111-111111111111');
    assert.equal(saved.data.filename, 'alice-resume.txt');
    assert.ok(saved.data.fileBase64);

    const downloaded = await downloadResume(alice.id, saved.id);
    assert.equal(await downloaded.data.text(), resumeText);

    const summaries = await listResumeSummaries(alice.id);
    assert.equal(summaries.sources.length, 1);
    assert.equal(summaries.sources[0].data.filename, 'alice-resume.txt');
  });

  test('saveSessionBundle persists application, analysis, draft, and generated resume under owner RLS', async () => {
    const alice = await authenticateNativeUser({ email: 'alice@example.test', password: 'correct-horse-battery' });
    const bob = await authenticateNativeUser({ email: 'bob@example.test', password: 'bob-secret-password' });

    const bundle = await saveSessionBundle(alice.id, {
      company: 'Linear',
      role: 'Product Engineer',
      jobUrl: 'https://linear.app/jobs/1',
      jobDescription: 'Build fast collaborative web tools using TypeScript, React, and PostgreSQL.',
      sourceFilename: 'alice.txt',
      sourceMimeType: 'text/plain',
      sourceText: 'Alice\nBuilt collaborative TypeScript & React applications backed by PostgreSQL.',
      analysis: {
        score: 86,
        matchedSkills: [{ name: 'TypeScript', match: true }],
        missingSkills: [],
        recommendations: { strengths: ['Strong TypeScript'], improvements: [], skillGaps: [], format: [] },
        detailedAnalysis: 'Strong match',
      },
      answers: { fullName: 'Alice', contactDetails: 'alice@example.test', targetTitle: 'Product Engineer' },
      generatedResume: {
        latex: '\\documentclass{article}',
        preview: { fullName: 'Alice', contact: ['alice@example.test'], headline: 'Product Engineer', sections: [], skillGroups: [] },
        tailoringNotes: [],
        assumptions: [],
        followUpQuestions: [],
      },
    });

    assert.equal(bundle.application.data.company, 'Linear');
    assert.equal(bundle.application.data.stage, 'Saved');
    assert.ok(bundle.analysisId);
    assert.ok(bundle.versionId);

    const aliceApps = (await getSnapshot(alice.id)).applications;
    const bobApps = (await getSnapshot(bob.id)).applications;
    assert.ok(aliceApps.some((a) => a.id === bundle.application.id));
    assert.equal(bobApps.length, 0);
  });
});
