import test from 'node:test';
import assert from 'node:assert/strict';
import {LabGoogleOAuthVault,importVaultKey,encryptRefresh,decryptRefresh} from '../worker/src/lab-google-oauth';
import {challenge,confirmScopes,GOOGLE_LAB_SCOPES} from '../worker/src/core/google-oauth';
import {makeLabChatWorker} from '../worker/src/chat-lab';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const redirect='https://oauth-lab.example/api/lab/oauth/callback';
const encryptionKey=btoa(String.fromCharCode(...new Uint8Array(32).fill(39)));
const oauthEnv={
 ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',GOOGLE_OAUTH_ENABLED:'true',
 GOOGLE_OAUTH_CLIENT_ID:'fake-client.apps.googleusercontent.com',
 GOOGLE_OAUTH_CLIENT_SECRET:'secret-for-test-only',
 GOOGLE_OAUTH_ENCRYPTION_KEY:encryptionKey,
 GOOGLE_OAUTH_REDIRECT_URI:redirect
};
function fixture(tokenExchange:typeof fetch=async()=>Response.json({
 access_token:'temporary-access-token',refresh_token:'test-refresh-token-secret',
 scope:GOOGLE_LAB_SCOPES.calendar[0],expires_in:3600,token_type:'Bearer'
})){
 const records=new Map<string,unknown>();
 const storage={transaction:async<T>(fn:(tx:any)=>Promise<T>)=>fn({
  get:async(k:string)=>records.get(k),
  put:async(k:string,v:unknown)=>{records.set(k,v);}
 })};
 const vault=new LabGoogleOAuthVault({storage} as any,oauthEnv,
  tokenExchange);
 const binding={idFromName:(uid:string)=>uid,get:(uid:string)=>{
  assert.equal(uid,'owner');
  return {fetch:(path:string,init?:RequestInit)=>vault.fetch(new Request(path,init))};
 }};
 const env={...oauthEnv,GOOGLE_OAUTH_VAULT:binding} as any;
 const worker=makeLabChatWorker({verify:async()=> 'owner',fetch:tokenExchange});
 const call=(path:string,method='GET',body?:unknown,site=origin)=>worker.fetch(
  new Request('https://worker-lab.example/api/lab/oauth/'+path,{
   method,headers:{Origin:site,'Authorization':'Bearer mock-firebase',
    ...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  }),env);
 const callback=(state:string,code='example-code-123456')=>worker.fetch(
  new Request(redirect+'?'+new URLSearchParams({state,code})),env);
 const raw=(path:string,method='GET',body?:unknown)=>vault.fetch(new Request(
  'https://internal.example'+path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})}));
 return {records,vault,env,worker,call,callback,raw};
}
test('AES-256-GCM: token cifra com IV aleatório e AAD vinculado ao UID',async()=>{
 const key=await importVaultKey(encryptionKey);
 const a=await encryptRefresh('secret-long-refresh-token',key,'owner');
 const b=await encryptRefresh('secret-long-refresh-token',key,'owner');
 assert.notEqual(a.data,b.data);
 assert.notEqual(a.iv,b.iv);
 assert.equal(await decryptRefresh(a,key,'owner'),'secret-long-refresh-token');
 await assert.rejects(()=>decryptRefresh(a,key,'other-user'),/indisponível/);
 assert.ok(!JSON.stringify(a).includes('secret-long-refresh-token'));
});
test('OAuth usa code+PKCE S256, offline, consent e escopos mínimos; não entrega segredo',async()=>{
 const f=fixture();
 const resp=await f.call('start','POST',{preset:'calendar'});
 assert.equal(resp.status,200);
 const data=await resp.json() as {authorizationUrl:string};
 const url=new URL(data.authorizationUrl);
 assert.equal(url.hostname,'accounts.google.com');
 assert.equal(url.searchParams.get('access_type'),'offline');
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('prompt'),'consent');
 assert.equal(url.searchParams.get('scope'),GOOGLE_LAB_SCOPES.calendar[0]);
 assert.ok((url.searchParams.get('code_challenge')||'').length>=40);
 assert.ok((url.searchParams.get('state')||'').startsWith('owner.'));
 assert.ok(!data.authorizationUrl.includes(oauthEnv.GOOGLE_OAUTH_CLIENT_SECRET));
 assert.ok(!data.authorizationUrl.includes('test-refresh-token-secret'));
 const linked=await f.callback(url.searchParams.get('state')!);
 assert.equal(linked.status,303);
 assert.equal(linked.headers.get('location'),origin+'/?sigma_oauth=connected');
 assert.ok(!linked.headers.get('location')?.includes('code'));
 const status=await f.call('status');
 const details=await status.json() as any;
 assert.equal(details.connections.calendar.connected,true);
 assert.equal(details.connections.drive_metadata.connected,false);
 assert.doesNotMatch(JSON.stringify(details),/secret|refresh_token/i);
 const replay=await f.callback(url.searchParams.get('state')!);
 assert.equal(replay.status,303);
 assert.match(replay.headers.get('Location')||'',/sigma_oauth=error/);
});
test('OAuth callback bloqueia state falso, rotas sem origem e UID diferente',async()=>{
 const f=fixture();
 assert.equal((await f.call('start','POST',{preset:'calendar'},'https://evil.example')).status,403);
 const bad=await f.callback('owner.invalid');
 assert.equal(bad.status,303);
 assert.match(bad.headers.get('Location')||'',/error/);
 const intruder=makeLabChatWorker({verify:async()=> 'intruder'});
 const req=new Request('https://worker-lab.example/api/lab/oauth/start',{
  method:'POST',headers:{Origin:origin,Authorization:'Bearer mock','Content-Type':'application/json'},
  body:JSON.stringify({preset:'calendar'})
 });
 assert.equal((await intruder.fetch(req,f.env)).status,403);
 assert.equal((await f.call('start','POST',{preset:'calendar',scope:'gmail'})).status,200);
 assert.throws(()=>confirmScopes('', 'calendar'),/não concedeu/);
 assert.ok((await challenge('a'.repeat(43))).length>=40);
});
test('Token refresh é interno, criptografado, em cache, independente para cada permissão',async()=>{
 let calls=0;
 const tokenServer=(async(_url:string,init:RequestInit)=>{
  calls++;
  const data=new URLSearchParams(String(init.body));
  if(data.get('grant_type')==='refresh_token'){
   assert.equal(data.get('refresh_token'),'test-refresh-token-secret');
   return Response.json({access_token:'refreshed-access',expires_in:3600});
  }
  return Response.json({access_token:'temporary-access-token',
   refresh_token:'test-refresh-token-secret',scope:GOOGLE_LAB_SCOPES.calendar[0]});
 }) as typeof fetch;
 const f=fixture(tokenServer);
 const start=await (await f.call('start','POST',{preset:'calendar'})).json() as any;
 const state=new URL(start.authorizationUrl).searchParams.get('state')!;
 await f.callback(state);
 const stored=JSON.stringify(f.records.get('linked:calendar'));
 assert.doesNotMatch(stored,/test-refresh-token-secret|temporary-access-token/);
 const internal=await f.raw('/access','POST',{preset:'calendar'});
 const first=await internal.json() as any;
 assert.equal(first.accessToken,'refreshed-access');
 const second=await f.raw('/access','POST',{preset:'calendar'});
 assert.equal((await second.json() as any).accessToken,'refreshed-access');
 assert.equal(calls,2,'one exchange and one refresh, second access cached');
 const removed=await f.call('disconnect','POST',{preset:'calendar'});
 assert.equal((await removed.json() as any).remoteRevoked,false);
 assert.equal((await f.raw('/access','POST',{preset:'calendar'})).status,401);
});
test('invalid_grant desabilita acesso contínuo e informa reconexão sem excluir outra permissão',async()=>{
 const server=(async(_url:string,init:RequestInit)=>{
  const data=new URLSearchParams(String(init.body));
  if(data.get('grant_type')==='refresh_token')
   return Response.json({error:'invalid_grant'},{status:400});
  return Response.json({access_token:'temporary-access-token',
   refresh_token:'test-refresh-token-secret',scope:GOOGLE_LAB_SCOPES.drive_metadata[0]});
 }) as typeof fetch;
 const f=fixture(server);
 const start=await (await f.call('start','POST',{preset:'drive_metadata'})).json() as any;
 await f.callback(new URL(start.authorizationUrl).searchParams.get('state')!);
 const expired=await f.raw('/access','POST',{preset:'drive_metadata'});
 assert.equal(expired.status,401);
 assert.match(JSON.stringify(await expired.json()),/Reconecte/);
 const status=await (await f.call('status')).json() as any;
 assert.equal(status.connections.drive_metadata.needsReauthorization,true);
 assert.equal(status.connections.calendar.connected,false);
});
