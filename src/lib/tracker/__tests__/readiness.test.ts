/** @jest-environment node */
import { databaseReadiness } from '../readiness';
import { getPool } from '../db';
jest.mock('../db', () => ({getPool:jest.fn()}));
const query=jest.fn(),release=jest.fn();
beforeEach(() => {
  jest.resetAllMocks(); process.env.DATABASE_URL='test-only';
  jest.mocked(getPool).mockReturnValue({connect:async()=>({query,release})} as never);
  query.mockResolvedValueOnce({rows:[{rolsuper:false,rolbypassrls:false}]})
    .mockResolvedValueOnce({rows:['users','records','operations','openai_connections','openai_oauth_transactions'].map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true,owns_table:false}))})
    .mockResolvedValueOnce({rows:['users','records','operations','openai_connections','openai_oauth_transactions'].map(relname=>({relname,polcmd:'*',polpermissive:true,ownership_using:`(${relname==='users'?'id':'owner_id'} = NULLIF(current_setting('app.user_id'::text, true), ''::text)::uuid)`,ownership_check:`(${relname==='users'?'id':'owner_id'} = NULLIF(current_setting('app.user_id'::text, true), ''::text)::uuid)`}))})
    .mockResolvedValueOnce({rows:[{present:true}]}).mockResolvedValue({rows:[]});
});
test('requires restricted credentials, owner policies and account migrations before reporting ready',async()=>{
  expect(await databaseReadiness()).toEqual({ready:true,reason:'ready'}); expect(release).toHaveBeenCalledTimes(1);
});
test('rejects privileged roles and table owners without querying private content',async()=>{
  query.mockReset().mockResolvedValueOnce({rows:[{rolsuper:false,rolbypassrls:true}]});
  expect((await databaseReadiness()).reason).toBe('unsafe_role'); expect(query).toHaveBeenCalledTimes(1);
});
test('an incomplete migration or missing ownership policy is unready',async()=>{
  query.mockReset().mockResolvedValueOnce({rows:[{rolsuper:false,rolbypassrls:false}]}).mockResolvedValueOnce({rows:[]});
  expect((await databaseReadiness()).reason).toBe('migrations_required');
});
test('connection errors are redacted and checked-out clients are released',async()=>{
  query.mockReset().mockRejectedValue(new Error('secret connection string'));
  expect(await databaseReadiness()).toEqual({ready:false,reason:'unreachable'}); expect(release).toHaveBeenCalled();
});
test('forced row security without the owner policy remains unready',async()=>{
  query.mockReset().mockResolvedValueOnce({rows:[{rolsuper:false,rolbypassrls:false}]})
    .mockResolvedValueOnce({rows:['users','records','operations','openai_connections','openai_oauth_transactions'].map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true,owns_table:false}))})
    .mockResolvedValueOnce({rows:[]});
  expect((await databaseReadiness()).reason).toBe('migrations_required');
});
test.each(['broadened','duplicate'])('rejects %s permissive policies that could bypass ownership',async(kind)=>{
  const names=['users','records','operations','openai_connections','openai_oauth_transactions'];
  const policies=names.map(relname=>({relname,polcmd:'*',polpermissive:true,ownership_using:`${relname==='users'?'id':'owner_id'} = NULLIF(current_setting('app.user_id',true),'')::uuid`,ownership_check:`${relname==='users'?'id':'owner_id'} = NULLIF(current_setting('app.user_id',true),'')::uuid`}));
  if(kind==='broadened') policies[0].ownership_using+=' OR true';else policies.push({...policies[0]});
  query.mockReset().mockResolvedValueOnce({rows:[{rolsuper:false,rolbypassrls:false}]})
    .mockResolvedValueOnce({rows:names.map(relname=>({relname,relrowsecurity:true,relforcerowsecurity:true,owns_table:false}))})
    .mockResolvedValueOnce({rows:policies});
  expect((await databaseReadiness()).reason).toBe('migrations_required');
});
