/** @jest-environment node */
import { requireUser, identityId } from '../auth';
import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { capabilities } from '../config';
import { saveUser } from '../store';
const mockGetSession=jest.fn();
jest.mock('jose',()=>({createRemoteJWKSet:jest.fn()}));
jest.mock('@/lib/mcp/verify-token',()=>({verifyMcpAccessToken:jest.fn(),assertConnectionActive:jest.fn()}));
jest.mock('@auth0/nextjs-auth0/server',()=>({Auth0Client:jest.fn().mockImplementation(()=>({getSession:mockGetSession}))}));
jest.mock('../config',()=>({capabilities:jest.fn(),appBaseUrl:()=> 'https://tracker.example',mcpAudience:()=> 'https://tracker.example/mcp'}));
jest.mock('../store',()=>({saveUser:jest.fn()}));
beforeEach(()=>{
  jest.clearAllMocks(); process.env.AUTH0_DOMAIN='identity.example';
  jest.mocked(capabilities).mockReturnValue({auth:true,database:true,storage:false,deepseek:false,openai:false});
});
test('signed-out and unverified sessions never create a private database account',async()=>{
  mockGetSession.mockResolvedValue(null); await expect(requireUser()).rejects.toMatchObject({status:401});
  mockGetSession.mockResolvedValue({user:{sub:'auth0|a',email_verified:false}}); await expect(requireUser()).rejects.toMatchObject({code:'EMAIL_UNVERIFIED'});
  expect(saveUser).not.toHaveBeenCalled();
  expect(Auth0Client).toHaveBeenCalledWith(expect.objectContaining({signInReturnToPath:'/onboarding',enableAccessTokenEndpoint:false,session:expect.objectContaining({absoluteDuration:604800})}));
});
test('Google and email identities are stable and cannot be merged by matching emails',async()=>{
  mockGetSession.mockResolvedValue({user:{sub:'google-oauth2|a',email:'same@example.test',name:'Alex',email_verified:true}});
  const google=await requireUser();
  mockGetSession.mockResolvedValue({user:{sub:'auth0|a',email:'same@example.test',name:'Alex',email_verified:true}});
  const email=await requireUser();
  expect(google.id).not.toBe(email.id); expect(google.id).toBe(identityId('https://identity.example/','google-oauth2|a'));
});
