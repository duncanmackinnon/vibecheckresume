import {createOnboardingSession,sessionForOwner,profileScreen,readOnboardingSession,ONBOARDING_SESSION_KEY} from '../session';

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
  sessionStorage.setItem(ONBOARDING_SESSION_KEY,JSON.stringify(draft));
  expect(readOnboardingSession()?.screen).toBe('cadence');
  expect(profileScreen({...draft.profile,step:'connect'})).toBe('cadence');
  sessionStorage.removeItem(ONBOARDING_SESSION_KEY);
});
