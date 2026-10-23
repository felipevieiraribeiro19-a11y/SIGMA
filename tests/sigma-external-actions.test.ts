import test from 'node:test';
import assert from 'node:assert/strict';
import {LabExternalActionStore,actionPayload} from '../worker/src/lab-external-actions';
import {executeApprovedExternalAction} from '../worker/src/core/sigma-action-executors';
import {makeLabChatWorker} from '../worker/src/chat-lab';
const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
function db(){
 const values=new Map<string,unknown>();
 return new LabExternalActionStore({storage:{transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn({
  get:async(k:string)=>values.get(k),put:async(k:string,v:unknown)=>{values.set(k,v)}
 })}} as any);
}
async function call(store:LabExternalActionStore,path:string,method:string,body?:unknown){
 const res=await store.fetch(new Request('https://lab-action.internal'+path,{method,
  ...(body===undefined?{}:{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}})}));
 return {status:res.status,data:await res.json()};
}
test('duas etapas: propõe sem executar e reivindica somente uma vez',async()=>{
 const store=db(),payload={operation:'calendar.create',title:'Reunião fictícia',
  start:'2026-11-01T10:00:00-03:00',end:'2026-11-01T11:00:00-03:00'};
 const draft=await call(store,'/propose','POST',payload);
 assert.equal(draft.status,201);assert.equal(draft.data.action.status,'pending');
 const id=draft.data.action.id;
 assert.equal((await call(store,'/claim/'+id,'POST',{confirmed:false})).status,400);
 const [a,b]=await Promise.all([call(store,'/claim/'+id,'POST',{confirmed:true}),call(store,'/claim/'+id,'POST',{confirmed:true})]);
 assert.deepEqual([a.status,b.status].sort(),[200,409]);
 assert.equal((await call(store,'/finish/'+id,'POST',{status:'succeeded',providerId:'google-id'})).status,200);
 assert.equal((await call(store,'/finish/'+id,'POST',{status:'succeeded'})).status,409);
 assert.equal((await call(store,'/status/'+id,'GET')).data.action.status,'succeeded');
});
test('ação desconhecida, horários inválidos e campos inesperados falham',()=>{
 for(const body of [
  {operation:'calendar.delete',title:'Apagar tudo'},
  {operation:'calendar.create',title:'Reunião fictícia',start:'2026-11-02T10:00:00Z',end:'2026-11-01T10:00:00Z'},
  {operation:'drive.folder.create',title:'Pasta',token:'secret'},
  {operation:'notion.page.create',title:'Página',parentId:'not-uuid'}
 ])assert.throws(()=>actionPayload(body));
});
test('executor usa endpoints fixos, nenhum modelo pode escolher URLs arbitrárias',async()=>{
 const p=actionPayload({operation:'calendar.create',title:'Consulta de teste',
  start:'2026-11-01T10:00:00-03:00',end:'2026-11-01T11:00:00-03:00'});
 const item={id:'013ceaa9-d456-4a17-8000-916ab50c129b',data:p,status:'in_progress' as const,
  createdAt:'2026-10-22T12:00:00Z',expiresAt:'2026-10-22T12:10:00Z'};
 let captured:any={};
 const mock=(async(url:string,init:RequestInit)=>{
  captured={url,body:JSON.parse(String(init.body)),auth:(init.headers as any).Authorization};
  return Response.json({id:'provider-1'});
 }) as typeof fetch;
 const done=await executeApprovedExternalAction(item,'token-de-teste',undefined,mock);
 assert.equal(done.status,'succeeded');
 assert.equal(captured.url,'https://www.googleapis.com/calendar/v3/calendars/primary/events');
 assert.equal(captured.auth,'Bearer token-de-teste');
 assert.match(captured.body.id,/^sigma[0-9a-f]{32}$/);
 assert.ok(!JSON.stringify(captured.body).includes('token-de-teste'));
 const lost=await executeApprovedExternalAction(item,'token-de-teste',undefined,
  (async()=>{throw Error('timeout após envio')}) as any);
 assert.equal(lost.status,'uncertain');
});
test('Notion cria página apenas sob pai validado, Drive usa scope restrito a itens do app',async()=>{
 const notion=actionPayload({operation:'notion.page.create',title:'Planejamento Sigma',
  parentId:'013ceaa9-d456-4a17-8000-916ab50c129b'});
 const item={id:'013ceaa9-d456-4a17-8000-916ab50c129b',data:notion,status:'in_progress' as const,
  createdAt:'2026-10-22T12:00:00Z',expiresAt:'2026-10-22T12:10:00Z'};
 let url='',headers:any;
 const result=await executeApprovedExternalAction(item,null,'notion-secret-example-123',
  (async(u:string,init:RequestInit)=>{url=u;headers=init.headers;return Response.json({id:'page-new'});}) as any);
 assert.equal(result.status,'succeeded');
 assert.equal(url,'https://api.notion.com/v1/pages');
 assert.equal(headers.Authorization,'Bearer notion-secret-example-123');
});
test('API real de ações fica negada sem flag ou fora do UID',async()=>{
 const store=db();let count=0;
 const env={ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',LAB_ACTIONS_ENABLED:'false',
  LAB_CONNECTORS_ENABLED:'false',LAB_ACTIONS:{idFromName:(x:string)=>x,get:()=>({
   fetch:(req:Request|string)=>{count++;return store.fetch(typeof req==='string'?new Request(req):req);}
  })}} as any;
 const request=()=>new Request('https://x.test/api/lab/actions/prepare',{method:'POST',
  headers:{Origin:origin,Authorization:'Bearer ficticio','Content-Type':'application/json'},
  body:JSON.stringify({operation:'drive.folder.create',title:'Pasta de teste'})});
 const worker=makeLabChatWorker({verify:async()=>env.ALLOWED_UID});
 assert.equal((await worker.fetch(request(),env)).status,503);
 assert.equal(count,0);
 const intruder=makeLabChatWorker({verify:async()=> 'another-uid'});
 assert.equal((await intruder.fetch(request(),{...env,LAB_ACTIONS_ENABLED:'true',LAB_CONNECTORS_ENABLED:'true'})).status,403);
 assert.equal(count,0);
});
