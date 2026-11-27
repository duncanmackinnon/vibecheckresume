import {createOnboardingSession,sessionForOwner,profileScreen,readOnboardingSession,writeOnboardingSession,readWizardResult,writeWizardResult,clearWizardResult,ONBOARDING_SESSION_KEY} from '../session';

test('private browser drafts cannot cross identities or survive logout',()=>{
  const draft={...createOnboardingSession(),ownerId:'alice'};
  expect(sessionForOwner(draft,'bob')).toBeNull();
  expect(sessionForOwner(draft,null)).toBeNull();
  expect(sessionForOwner(draft,'alice')?.ownerId).toBe('alice');
});
test('only explicit anonymous sign-in intent is adopted by an authenticated owner',()=>{
  const draft=createOnboardingSession();
  expect(sessionForOwner(draft,'alice')).toBeNull();
  expect(sessionForOwner({...draft,pendingSignIn:true},'alice')).toMatchObject({ownerId:'alice',pendingSignIn:false});
});

test('drafts from the removed connection step resume at search cadence',()=>{
  const draft={...createOnboardingSession(),screen:'connect' as const};
  localStorage.setItem(ONBOARDING_SESSION_KEY,JSON.stringify(draft));
  expect(readOnboardingSession()?.screen).toBe('cadence');
  expect(profileScreen({...draft.profile,step:'connect'})).toBe('cadence');
  localStorage.removeItem(ONBOARDING_SESSION_KEY);
});

test('wizard target and generated resume result persist in browser session storage',()=>{
  const draft={...createOnboardingSession(),screen:'target' as const,wizardTarget:{role:'Frontend Engineer',company:'Acme',jobUrl:'',jobDescription:'Build accessible React UI.',contactDetails:'alex@example.test'}};
  writeOnboardingSession(draft);
  expect(readOnboardingSession()?.screen).toBe('target');
  expect(readOnboardingSession()?.wizardTarget.role).toBe('Frontend Engineer');

  writeWizardResult({
    schemaVersion:1,
    generatedResume:{
      latex:'\\documentclass{article}',
      preview:{fullName:'Alex',contact:['alex@example.test'],sections:[],skillGroups:[]},
      tailoringNotes:[],
      assumptions:[],
      followUpQuestions:[],
    },
    analysis:null,
    answers:{},
    company:'Acme',
    targetRole:'Frontend Engineer',
    jobUrl:'',
    jobDescription:'',
    updatedAt:'2026-11-26T12:00:00.000Z',
  });
  expect(readWizardResult()?.generatedResume?.preview.fullName).toBe('Alex');
  clearWizardResult();
  expect(readWizardResult()).toBeNull();

  const reportDraft = { ...createOnboardingSession(), screen: 'report' as const };
  writeOnboardingSession(reportDraft);
  expect(readOnboardingSession()?.screen).toBe('report');

  const builderDraft = { ...createOnboardingSession(), screen: 'builder' as const };
  writeOnboardingSession(builderDraft);
  expect(readOnboardingSession()?.screen).toBe('builder');

  writeWizardResult({
    schemaVersion: 1,
    mode: 'tailored',
    generatedResume: null,
    analysis: {
      score: 78,
      matchedSkills: [{ name: 'TypeScript', match: true }],
      missingSkills: ['Docker'],
      recommendations: { improvements: [], strengths: [], skillGaps: [], format: [] },
      detailedAnalysis: 'Solid match.',
    },
    answers: { fullName: 'Alex' },
    company: 'Acme',
    targetRole: 'Frontend Engineer',
    jobUrl: '',
    jobDescription: 'Build accessible React UI.',
    updatedAt: '2026-11-26T12:00:00.000Z',
  });
  expect(readWizardResult()?.analysis?.score).toBe(78);

  writeWizardResult({
    schemaVersion: 1,
    mode: 'kept',
    generatedResume: null,
    analysis: null,
    answers: {},
    company: '',
    targetRole: '',
    jobUrl: '',
    jobDescription: '',
    updatedAt: '2026-11-26T12:00:00.000Z',
  });
  expect(readWizardResult()?.mode).toBe('kept');
  expect(readWizardResult()?.generatedResume).toBeNull();

  clearWizardResult();
  localStorage.removeItem(ONBOARDING_SESSION_KEY);
});
