import test from 'node:test';
import assert from 'node:assert/strict';
import {LabDocumentIndex} from '../worker/src/lab-document-index';
import {fetchDriveDocumentPage,fetchNotionDocumentPage} from '../worker/src/core/document-source-readers';
import {makeLabChatWorker} from '../worker/src/chat-lab';
const source='drive';
const doc=(i:number,version='v1',text?:string)=>({
 source:'drive' as const,sourceId:'file'+i,title:'Arquivo '+i,
 version,updatedAt:'2026-10-23T10:00:00Z',url:'https://drive.google.com/file/d/file'+i,
 mimeType:'application/pdf',...(text===undefined?{}:{text})
});
function store(){
 const data=new Map<string,unknown>();
 const object=new LabDocumentIndex({storage:{transaction:async<T>(cb:(tx:any)=>Promise<T>)=>cb({
  get:async(key:string)=>data.get(key),put:async(key:string,v:unknown)=>{data.set(key,v);}
 })}} as any);
 const request=async(path:string,method='GET',body?:unknown)=>{
  const response=await object.fetch(new Request('https://internal.example'+path,{
   method,...(body===undefined?{}:{body:JSON.stringify(body)})
  }));
  return {status:response.status,data:await response.json() as any};
 };
 return {request,data,object};
}
test('paginação segura: 250 arquivos, índice antigo preservado até a última página',async()=>{
 const {request}=store();
 assert.equal((await request('/sync','POST',{source,complete:true,documents:[doc(999,'v1','Trecho salvo')]})).status,200);
 const start=await request('/scan/start','POST',{source,includeContent:false});
 assert.equal(start.status,201);
 const id=start.data.scan.id as string;
 let cursor:null|string=null;
 for(let page=0;page<3;page++){
  const next=page<2?'CUR'+page:null;
  const docs=Array.from({length:page<2?100:50},(_,i)=>doc(page*100+i));
  const result=await request('/scan/page','POST',{
   source,scanId:id,page,cursor,nextCursor:next,documents:docs,textReads:0
  });
  assert.equal(result.status,200);
  assert.equal(result.data.completed,page===2);
  const listed=await request('/documents');
  assert.equal(listed.data.count,page===2?250:1);
  if(page<2)assert.equal(listed.data.documents[0].textLength,12);
  cursor=next;
 }
 const search=await request('/search?q=Arquivo%20249');
 assert.equal(search.data.results.length,1);
 assert.equal(search.data.results[0].key,'drive:file249');
});
test('falha na página posterior, duplicata e ciclo não substituem catálogo',async()=>{
 const {request}=store();
 await request('/sync','POST',{source,complete:true,documents:[doc(999)]});
 const scan=await request('/scan/start','POST',{source,includeContent:false});
 const id=scan.data.scan.id;
 const first=await request('/scan/page','POST',{source,scanId:id,page:0,cursor:null,
  nextCursor:'CUR1',documents:[doc(0)],textReads:0});
 assert.equal(first.data.completed,false);
 const dup=await request('/scan/page','POST',{source,scanId:id,page:1,cursor:'CUR1',
  nextCursor:null,documents:[doc(0)],textReads:0});
 assert.equal(dup.status,409);
 const cycle=await request('/scan/page','POST',{source,scanId:id,page:1,cursor:'CUR1',
  nextCursor:'CUR1',documents:[doc(1)],textReads:0});
 assert.equal(cycle.status,409);
 assert.equal((await request('/documents')).data.documents[0].key,'drive:file999');
 const cancelled=await request('/scan/cancel','POST',{source,scanId:id});
 assert.equal(cancelled.data.cancelled,true);
 assert.equal((await request('/scan/status?source=drive')).data.scan,null);
 const rejected=await request('/scan/page','POST',{source,scanId:id,page:1,cursor:'CUR1',
  nextCursor:null,documents:[doc(1)],textReads:0});
 assert.equal(rejected.status,409);
 assert.equal((await request('/documents')).data.count,1);
});
test('conteúdo de versão idêntica permanece, versão nova sem extração não fica desatualizada',async()=>{
 const {request}=store();
 await request('/sync','POST',{source,complete:true,documents:[doc(1,'v1','Conteúdo sobre finanças')]});
 for(const version of ['v1','v2']){
  const scan=await request('/scan/start','POST',{source,includeContent:false});
  const result=await request('/scan/page','POST',{source,scanId:scan.data.scan.id,
   page:0,cursor:null,nextCursor:null,documents:[doc(1,version)],textReads:0});
  assert.equal(result.status,200);
  const list=await request('/documents');
  assert.equal(list.data.documents[0].contentStatus,version==='v1'?'indexed':'metadata-only');
 }
});
test('leitura paginada Drive detecta resposta incompleta e não envia tokens na URL',async()=>{
 const transport=(async(url:string,init:RequestInit)=>{
  assert.match(url,/pageToken=NEXT/);
  assert.ok(!url.includes('secret-test'));
  assert.equal((init.headers as any).Authorization,'Bearer secret-test');
  return Response.json({files:[],incompleteSearch:true});
 }) as typeof fetch;
 await assert.rejects(()=>fetchDriveDocumentPage('secret-test','NEXT',0,transport),/incompleta/);
});
test('leitura Notion valida cursor e usa autorização somente no cabeçalho',async()=>{
 const transport=(async(url:string,init:RequestInit)=>{
  assert.equal(url,'https://api.notion.com/v1/search');
  assert.equal((init.headers as any).Authorization,'Bearer valid-notion-secret');
  assert.equal(JSON.parse(String(init.body)).start_cursor,'NEXT');
  return Response.json({results:[],has_more:false,next_cursor:null});
 }) as typeof fetch;
 const page=await fetchNotionDocumentPage('valid-notion-secret','NEXT',0,transport);
 assert.deepEqual(page,{documents:[],nextCursor:null,textReads:0});
});
test('Worker exige UID e flags, e continua apenas um lote por solicitação',async()=>{
 const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
 const {object}=store();
 const env={
  ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',LAB_DOCUMENTS_ENABLED:'true',
  LAB_CONNECTORS_ENABLED:'true',NOTION_API_KEY:'valid-notion-secret',
  LAB_DOCUMENT_INDEX:{idFromName:(v:string)=>v,get:()=>({fetch:(u:Request|string,i?:RequestInit)=>
   object.fetch(typeof u==='string'?new Request(u,i):u)})},
  LAB_QUOTA:{idFromName:(v:string)=>v,get:()=>({fetch:async()=>new Response(null,{status:204})})}
 } as any;
 let providerCalls=0;
 const worker=makeLabChatWorker({verify:async()=> 'owner',
  fetch:(async()=>{providerCalls++;return Response.json({files:[]});}) as typeof fetch
 });
 const req=(body:unknown,method='POST')=>new Request('https://lab.invalid/api/lab/documents/sync',{
  method,headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer test','X-Google-Token':'fake-token'},
  body:JSON.stringify(body)});
 const start=await worker.fetch(req({source:'drive',action:'start'}),env);
 assert.equal(start.status,201);
 const data=await start.json() as any;
 assert.equal(providerCalls,0);
 const finish=await worker.fetch(req({source:'drive',action:'continue',scanId:data.scan.id}),env);
 assert.equal(finish.status,200);
 assert.equal((await finish.json() as any).completed,true);
 assert.equal(providerCalls,1);
 const blocked=await worker.fetch(req({source:'drive',action:'continue',scanId:data.scan.id}),env);
 assert.equal(blocked.status,404);
 const wrong=makeLabChatWorker({verify:async()=> 'intruder'});
 assert.equal((await wrong.fetch(req({source:'drive',action:'start'}),env)).status,403);
});
