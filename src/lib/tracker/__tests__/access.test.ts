import { safeReturnTo, assertEmailVerified } from '../access';
test('preserves local deep links and rejects external, escaped and auth destinations',()=>{
  expect(safeReturnTo('/applications/123?resumeVersion=abc')).toBe('/applications/123?resumeVersion=abc');
  for(const value of ['https://evil.test','//evil.test','/\\evil.test','/auth/login','/api/private','/\nfoo']) expect(safeReturnTo(value)).toBe('/onboarding');
});
test('explicit unverified email cannot enter a private workspace',()=>{
  expect(assertEmailVerified({email_verified:false})).toBe(false); expect(assertEmailVerified({email_verified:true})).toBe(true);
});
