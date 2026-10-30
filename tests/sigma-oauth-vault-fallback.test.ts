import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveGoogleToken} from '../worker/src/core/google-oauth-api';

type Call={path:string;method:string;body:unknown};

/** Cofre falso: registra as chamadas e responde como o Durable Object real. */
function vault(response:(call:Call)=>{status:number;body:unknown}){
 const calls:Call[]=[];
 const namespace={
  idFromName:(name:string)=>name,
  get:(id:string)=>({
   fetch:async(input:string,init?:RequestInit)=>{
    const path=new URL(input).pathname;
    const body=init?.body?JSON.parse(String(init.body)):undefined;
    const call={path,method:init?.method||'GET',body};
    calls.push(call);
    const out=response(call);
    return new Response(JSON.stringify(out.body),{status:out.status});
   }
  })
 };
 return {namespace,calls};
}
const envWith=(vaultNamespace:unknown,extra:Record<string,unknown>={})=>({
 ALLOWED_ORIGIN:'https://exemplo.web.app',
 GOOGLE_OAUTH_ENABLED:'true',
 GOOGLE_OAUTH_VAULT:vaultNamespace,
 ...extra
} as any);
const request=(headers:Record<string,string>={})=>
 new Request('https://worker.example/api/lab/chat',{method:'POST',headers});

test('cabeçalho presente tem prioridade e o cofre não é consultado',async()=>{
 const {namespace,calls}=vault(()=>({status:200,body:{accessToken:'vault-token'}}));
 const token=await resolveGoogleToken(request({'X-Google-Token':'header-token'}),
  envWith(namespace),'uid_alpha','calendar');
 assert.equal(token,'header-token');
 assert.equal(calls.length,0,'cofre não deve ser chamado quando há cabeçalho');
});

test('sem cabeçalho, usa o access token renovado pelo cofre',async()=>{
 const {namespace,calls}=vault(()=>({status:200,body:{accessToken:'vault-token',expiresAt:1}}));
 const token=await resolveGoogleToken(request(),envWith(namespace),'uid_alpha','calendar');
 assert.equal(token,'vault-token');
 assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/access');
 assert.equal(calls[0].method,'POST');
 assert.deepEqual(calls[0].body,{preset:'calendar'});
});

test('cada conector pede o preset correto',async()=>{
 const presets:string[]=[];
 const build=async(provider:'calendar'|'drive'|'tasks')=>{
  const {namespace}=vault(call=>{
   presets.push((call.body as {preset:string}).preset);
   return {status:200,body:{accessToken:'tok'}};
  });
  await resolveGoogleToken(request(),envWith(namespace),'uid_alpha',provider);
 };
 await build('calendar');
 await build('drive');
 await build('tasks');
 assert.deepEqual(presets,['calendar','drive_metadata','calendar'],
  'Drive usa somente metadados nesta etapa');
});

test('cofre desligado devolve vazio e mantém o erro atual de conta não conectada',async()=>{
 const {namespace,calls}=vault(()=>({status:200,body:{accessToken:'tok'}}));
 for(const disabled of [
  envWith(namespace,{GOOGLE_OAUTH_ENABLED:'false'}),
  envWith(undefined)
 ]){
  const token=await resolveGoogleToken(request(),disabled,'uid_alpha','calendar');
  assert.equal(token,'','sem cofre não há token');
 }
 assert.equal(calls.length,0);
});

test('conta precisa reconectar vira erro claro, não falha genérica',async()=>{
 const {namespace}=vault(()=>({status:401,body:{error:'Conta Google precisa ser reconectada.'}}));
 await assert.rejects(
  ()=>resolveGoogleToken(request(),envWith(namespace),'uid_alpha','calendar'),
  (error:any)=>error.status===401&&/reconectada/.test(error.message)
 );
});

test('falha do cofre que não é de autorização não derruba o chat',async()=>{
 const {namespace}=vault(()=>({status:503,body:{error:'Cofre indisponível.'}}));
 const token=await resolveGoogleToken(request(),envWith(namespace),'uid_alpha','calendar');
 assert.equal(token,'','indisponibilidade do cofre não vira erro para o usuário');
});

test('cabeçalho inválido continua recusado como antes',async()=>{
 const {namespace}=vault(()=>({status:200,body:{accessToken:'tok'}}));
 await assert.rejects(
  ()=>resolveGoogleToken(request({'X-Google-Token':'ab'}),envWith(namespace),'uid_alpha','calendar'),
  (error:any)=>error.status===401
 );
});
