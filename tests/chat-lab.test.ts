import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {assertLabReply,nextLabMessages,validLabApiBase} from '../src/jarvis-chat-protocol';

const allowed='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const apiKey='TEST_API_KEY_NOT_REAL';
const env={
 FIREBASE_PROJECT_ID:'sigma-61328',ALLOWED_UID:'uid-test-only',
 ALLOWED_ORIGIN:allowed,LAB_CHAT_ENABLED:'true',
 GEMINI_API_KEY:apiKey,GEMINI_MODEL:'gemini-fake',
 LAB_QUOTA:{idFromName:(s:string)=>s,get:()=>({fetch:async()=>new Response(null,{status:204})})}
} as any;
const payload={messages:[{role:'user',text:'Exemplo fictício: diga oi.'}]};
function req(body:unknown=payload,origin=allowed,token='Bearer fake'){
 return new Request('https://lab-worker.invalid/api/lab/chat',{
  method:'POST',headers:{Origin:origin,Authorization:token,'Content-Type':'application/json'},
  body:JSON.stringify(body)
 });
}
const fakeModel=async(input:RequestInfo|URL,init?:RequestInit)=>{
 assert.match(String(input),/generativelanguage.googleapis.com/);
 assert.equal((init?.headers as Record<string,string>)['x-goog-api-key'],apiKey);
 const body=JSON.parse(String(init?.body));
 assert.equal(body.contents[0].parts[0].text,'Exemplo fictício: diga oi.');
 return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Olá do Gemini (mock).'}]}}]}),{status:200});
};
test('chat de laboratório exige origem exata e recusa origens de produção',async()=>{
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:fakeModel as typeof fetch});
 assert.equal((await worker.fetch(req(payload,'https://sigma-61328.web.app'),env)).status,403);
 assert.equal((await worker.fetch(req(payload,''),env)).status,403);
});
test('chat de laboratório falha fechado e não chama Gemini desativado',async()=>{
 let calls=0;
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:(async()=>{calls++;return new Response();}) as typeof fetch});
 const result=await worker.fetch(req(),{...env,LAB_CHAT_ENABLED:'false'});
 assert.equal(result.status,503);
 assert.equal(calls,0);
});
test('chat de laboratório requer credenciais, origem, token e conta verificada',async()=>{
 const worker=makeLabChatWorker({verify:async(_r,e)=>e.ALLOWED_UID,fetch:fakeModel as typeof fetch});
 assert.equal((await worker.fetch(req(),{...env,GEMINI_API_KEY:''})).status,503);
 const rejected=makeLabChatWorker({verify:async()=>{throw Error('denied');}});
 assert.equal((await rejected.fetch(req(),env)).status,503);
 const wrong=makeLabChatWorker({verify:async()=> 'outro-uid'});
 assert.equal((await wrong.fetch(req(),env)).status,403);
});
test('chat de laboratório responde sem salvar nem executar',async()=>{
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:fakeModel as typeof fetch});
 const response=await worker.fetch(req(),env);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),allowed);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(await response.json(),{text:'Olá do Gemini (mock).',persisted:false,executed:false,provider:'gemini'});
});
test('chat de laboratório restringe formato, tamanho e método',async()=>{
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:fakeModel as typeof fetch});
 assert.equal((await worker.fetch(req({messages:[{role:'assistant',text:'início inválido'}]}),env)).status,400);
 assert.equal((await worker.fetch(req({messages:[{role:'user',text:'oi'}],attachment:'pdf'}),env)).status,400);
 assert.equal((await worker.fetch(new Request('https://lab-worker.invalid/api/lab/chat',{method:'GET',headers:{Origin:allowed}}),env)).status,405);
 assert.equal((await worker.fetch(new Request('https://lab-worker.invalid/api/lab/chat',{method:'OPTIONS',headers:{Origin:allowed}}),env)).status,204);
});
test('protocolo do cliente recusa backend de produção, scripts e respostas falsas',()=>{
 assert.equal(validLabApiBase('https://sigma-cerebro.felipevieiraribeiro19.workers.dev'),null);
 assert.equal(validLabApiBase('javascript:alert(1)'),null);
 assert.equal(validLabApiBase('https://sigma-jarvis-cerebro-lab.testaccount.workers.dev'),'https://sigma-jarvis-cerebro-lab.testaccount.workers.dev');
 assert.equal(validLabApiBase('https://sigma-jarvis-cerebro-lab.testaccount.workers.dev/attack'),null);
 assert.deepEqual(nextLabMessages([],' oi '),[{role:'user',text:'oi'}]);
 assert.throws(()=>nextLabMessages([],' '));
 assert.throws(()=>assertLabReply({text:'Sim, gravei',persisted:true,executed:false,provider:'gemini'}));
 assert.equal(assertLabReply({text:'Oi',persisted:false,executed:false,provider:'gemini'}),'Oi');
});
