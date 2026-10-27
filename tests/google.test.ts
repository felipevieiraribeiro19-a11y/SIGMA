import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleContext,googlePrompt,formatWhen} from '../worker/src/google';
import {makeWorker as originalMakeWorker,type Env} from '../worker/src/index';

const origin='https://sigma.example';
const env={ALLOWED_ORIGINS:origin,ALLOWED_UID:'owner',FIREBASE_PROJECT_ID:'sigma-test',GEMINI_MODEL:'configured-model',GEMINI_API_KEY:'test-only',QUOTA:{idFromName:()=> 'owner',get:()=>({fetch:async()=>new Response(null,{status:204})})}} as unknown as Env;

const calendarOk=()=>new Response(JSON.stringify({items:[
 {summary:'Psiquiatra',start:{dateTime:'2026-11-10T16:30:00-03:00'}},
 {summary:'Viagem\ncom <script>',start:{date:'2026-11-06'}},
]}),{status:200});
const driveOk=()=>new Response(JSON.stringify({files:[
 {name:'AFO - LRF.pdf',modifiedTime:'2026-10-18T13:34:00Z'},
 {name:'Contabilidade - CPC 01.pdf',modifiedTime:'2026-10-17T10:00:00Z'},
]}),{status:200});

const transport=(calendar:()=>Response,drive:()=>Response)=>(async (url:string)=>{
 assert.ok(!String(url).includes('Bearer'),'token nunca vai na URL');
 return String(url).includes('calendar/v3')?calendar():drive();
}) as unknown as typeof fetch;

test('formata data e data-hora no fuso do usuário',()=>{
 assert.equal(formatWhen('2026-11-06'),'06/11/2026');
 assert.match(formatWhen('2026-11-10T16:30:00-03:00'),/10\/11\/2026.*16:30/);
 assert.equal(formatWhen(''),'data não informada');
 assert.equal(formatWhen('lixo'),'data não informada');
});

test('lê agenda e materiais, limpando conteúdo do Google',async()=>{
 const data=await googleContext('token-valido',transport(calendarOk,driveOk));
 assert.equal(data.expired,false);
 assert.deepEqual(data.errors,[]);
 assert.equal(data.agenda.length,2);
 assert.equal(data.agenda[0].summary,'Psiquiatra');
 assert.equal(data.agenda[1].summary,'Viagem com','tag injetada é removida, não escapada');
 assert.ok(!/[<>]/.test(data.agenda[1].summary));
 assert.equal(data.materiais[0].name,'AFO - LRF.pdf');
});

test('autorização recusada nos dois serviços marca acesso expirado',async()=>{
 const denied=()=>new Response('denied',{status:401});
 const data=await googleContext('token-velho',transport(denied,denied));
 assert.equal(data.expired,true);
 assert.deepEqual(data.errors,['agenda','materiais']);
});

test('API desativada (403) não é tratada como sessão expirada',async()=>{
 const disabled=()=>new Response('SERVICE_DISABLED',{status:403});
 const data=await googleContext('token-novo',transport(disabled,disabled));
 assert.equal(data.expired,false);
 assert.deepEqual(data.errors,['agenda','materiais']);
 assert.ok(!JSON.stringify(data).includes('SERVICE_DISABLED'));
});

test('falha de rede em um serviço não derruba o outro',async()=>{
 const data=await googleContext('token-valido',transport(()=>{throw new Error('offline')},driveOk));
 assert.deepEqual(data.errors,['agenda']);
 assert.equal(data.materiais.length,2);
 assert.equal(data.expired,false);
});

test('token malformado é recusado antes de qualquer chamada',async()=>{
 let calls=0;const spy=(async()=>{calls++;return new Response('{}')}) as unknown as typeof fetch;
 await assert.rejects(()=>googleContext('a'.repeat(5000),spy),/inválido/);
 await assert.rejects(()=>googleContext('com\nquebra',spy),/inválido/);
 assert.equal(calls,0);
});

test('contexto do modelo informa o que foi lido e o que falhou',async()=>{
 const bom=googlePrompt(await googleContext('t',transport(calendarOk,driveOk)))!;
 assert.match(bom,/Psiquiatra/);
 assert.match(bom,/AFO - LRF\.pdf/);
 assert.match(bom,/somente leitura/);
 const vazio=googlePrompt({agenda:[],materiais:[],expired:false,errors:[]})!;
 assert.match(vazio,/nenhum compromisso encontrado/,'agenda vazia lida com sucesso não é o mesmo que falha');
 const falhou=googlePrompt({agenda:[],materiais:[],expired:false,errors:['agenda','materiais']})!;
 assert.match(falhou,/não foi possível ler/);
 assert.match(falhou,/Não invente/);
});


test('endpoint Google exige sessão e autorização específica',async()=>{
 const worker=originalMakeWorker({verify:async()=> 'owner',memory:{recent:async()=>[],save:async()=>{}},fetch:transport(calendarOk,driveOk)});
 const noToken=await worker.fetch(new Request('https://api.example/api/agenda',{headers:{Origin:origin,Authorization:'Bearer x'}}),env);
 assert.equal(noToken.status,401);
 const ok=await worker.fetch(new Request('https://api.example/api/agenda',{headers:{Origin:origin,Authorization:'Bearer x','X-Google-Token':'token-valido'}}),env);
 assert.equal(ok.status,200);
 const data=await ok.json();
 assert.equal(data.agenda.length,2);
 assert.equal(data.materiais.length,2);
});

test('chat com autorização recebe apenas contexto da agenda quando solicitado',async()=>{
 let sent:any;
 const worker=originalMakeWorker({verify:async()=> 'owner',memory:{recent:async()=>[],save:async()=>{}},fetch:async(url,init)=>{
  if(String(url).includes('calendar/v3'))return calendarOk();
  if(String(url).includes('drive/v3'))return driveOk();
  sent=JSON.parse(String(init!.body));return Response.json({candidates:[{content:{parts:[{text:'Compromisso encontrado.'}]}}]});
 }});
 const res=await worker.fetch(new Request('https://api.example/api/chat',{method:'POST',headers:{Origin:origin,Authorization:'Bearer x','Content-Type':'application/json','X-Turn-Id':'12345678-1234-1234-1234-123456789012','X-Google-Token':'token-secreto'},body:JSON.stringify({messages:[{role:'user',text:'O que tenho na agenda amanhã?'}]})}),env);
 assert.equal(res.status,200);
 const prompt=JSON.stringify(sent);
 assert.match(prompt,/Psiquiatra/);
 assert.doesNotMatch(prompt,/AFO - LRF\.pdf/);
 assert.doesNotMatch(prompt,/token-secreto/);
});
