import test from 'node:test';
import assert from 'node:assert/strict';
import {clarifyAfo,focusedAfoQuery,relevantAfoSources,resolveAfoMeaning} from '../worker/src/core/lab-acronym';
import {makeLabChatWorker} from '../worker/src/chat-lab';
import {assertLabReply} from '../src/jarvis-chat-protocol';

const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const env={
 FIREBASE_PROJECT_ID:'sigma-61328',ALLOWED_UID:'fictitious-uid',
 ALLOWED_ORIGIN:origin,LAB_CHAT_ENABLED:'true',LAB_WEB_ENABLED:'true',
 GEMINI_API_KEY:'not-real',GEMINI_MODEL:'fake-model',TAVILY_API_KEY:'test',
 LAB_QUOTA:{idFromName:(id:string)=>id,get:()=>({fetch:async()=>new Response(null,{status:204})})}
} as any;
const msg=(text:string,role:'user'|'assistant'='user')=>({role,text});
function request(messages:Array<{role:'user'|'assistant';text:string}>){
 return new Request('https://worker.example/api/lab/chat',{
  method:'POST',headers:{Origin:origin,Authorization:'Bearer mock','Content-Type':'application/json'},
  body:JSON.stringify({messages})
 });
}

test('sem contexto, AFO é ambígua e deve solicitar esclarecimento',()=>{
 const m=[msg('O que é AFO?')];
 assert.equal(resolveAfoMeaning(m),'ambiguous');
 assert.match(clarifyAfo(m)||'',/Administração Financeira e Orçamentária/);
 assert.match(clarifyAfo(m)||'',/tornozelo/);
 assert.equal(resolveAfoMeaning([msg('O que é LOA?')]),null);
});
test('a pergunta genérica não deve custar chamada Tavily ou Gemini',async()=>{
 let external=0;
 const worker=makeLabChatWorker({
  verify:async()=>env.ALLOWED_UID,
  fetch:async()=>{external++;throw Error('external call not expected');}
 });
 const response=await worker.fetch(request([msg('Pesquise o que significa AFO')]),env);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.provider,'lab');
 assert.equal(body.persisted,false);
 assert.equal(body.executed,false);
 assert.match(assertLabReply(body),/Qual dos dois assuntos/);
 assert.equal(external,0);
});
test('contexto explícito e recente seleciona sentido de gestão pública',()=>{
 assert.equal(resolveAfoMeaning([msg('Estou estudando para concurso de finanças.'),msg('Ok','assistant'),msg('Explique AFO')]),'finance');
 assert.equal(resolveAfoMeaning([msg('O que significa AFO no orçamento público?')]),'finance');
 assert.equal(clarifyAfo([msg('Explique AFO de concursos públicos')]),null);
});
test('contexto médico não é convertido indevidamente para finanças',()=>{
 assert.equal(resolveAfoMeaning([msg('Quero entender uma órtese de tornozelo.'),msg('Entendi','assistant'),msg('AFO significa o quê?')]),'orthosis');
 assert.equal(resolveAfoMeaning([msg('AFO para reabilitação da marcha')]),'orthosis');
});
test('pedidos de todos os significados não são impedidos',()=>{
 assert.equal(clarifyAfo([msg('Compare os diferentes sentidos de AFO')]),null);
});
test('consultas web contextualizadas identificam corretamente cada domínio',()=>{
 assert.match(focusedAfoQuery('Pesquise AFO','finance'),/Orçamentária concursos públicos/);
 assert.match(focusedAfoQuery('Pesquise AFO','orthosis'),/órtese tornozelo pé/);
 const sources=[
  {title:'AFO - Administração Financeira e Orçamentária para concursos',url:'https://example.org/finance',excerpt:'Plano e orçamento público, LRF'},
  {title:'Ankle Foot Orthosis (AFO)',url:'https://example.org/orthosis',excerpt:'Support for ankle and foot in rehabilitation'}
 ];
 assert.deepEqual(relevantAfoSources(sources,'finance').map(x=>x.url),['https://example.org/finance']);
 assert.deepEqual(relevantAfoSources(sources,'orthosis').map(x=>x.url),['https://example.org/orthosis']);
});
test('pesquisa com contexto financeiro não retorna nem envia fontes médicas ao Gemini',async()=>{
 let calls=0;let prompt:unknown=null;let query='';
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID,fetch:(async(url:string,opts:RequestInit)=>{
  calls++;
  if(url.includes('api.tavily.com')){
   query=JSON.parse(String(opts.body)).query;
   return new Response(JSON.stringify({results:[
    {title:'AFO Orthosis Ankle Foot',url:'https://medical.example.org/afo',content:'Orthosis for rehabilitation'},
    {title:'AFO Administração Financeira e Orçamentária',url:'https://finance.example.org/afo',content:'Orçamento público: LRF, PPA e LOA'}
   ]}),{status:200});
  }
  prompt=JSON.parse(String(opts.body));
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'AFO é Administração Financeira e Orçamentária.'}]}}]}),{status:200});
 }) as typeof fetch});
 const response=await worker.fetch(request([msg('Pesquise AFO na área de concursos públicos')]),env);
 assert.equal(response.status,200);
 assert.equal(calls,2);
 const data=await response.json();
 assert.deepEqual(data.web.sources.map((x:{url:string})=>x.url),['https://finance.example.org/afo']);
 assert.match(query,/Orçamentária/);
 const obj=prompt as {systemInstruction:{parts:{text:string}[]};contents:{parts:{text:string}[]}[]};
 assert.match(obj.systemInstruction.parts[0].text,/Não explique órteses/);
 assert.doesNotMatch(obj.contents[0].parts[1].text,/medical.example.org/);
});
