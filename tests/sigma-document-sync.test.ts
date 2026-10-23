import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCompleteSnapshot,normalizeDocument,normalizeNotionRecord,publicDocumentSearch} from '../worker/src/core/sigma-document-index';
import {readDocumentPage} from '../worker/src/core/sigma-document-pages';
import {LabDocumentIndex} from '../worker/src/lab-documents';
import {makeLabChatWorker} from '../worker/src/chat-lab';
const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
function storage(){
 const records=new Map<string,unknown>();
 const index=new LabDocumentIndex({storage:{transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn({
  get:async(key:string)=>records.get(key),
  put:async(key:string,v:unknown)=>{records.set(key,v);}
 })}} as any);
 return index;
}
const req=(path:string,method='GET',body?:unknown)=>new Request('https://documents.lab'+path,{
 method,...(body===undefined?{}:{body:JSON.stringify(body)})
});
async function direct(db:LabDocumentIndex,path:string,method='GET',body?:unknown){
 const r=await db.fetch(req(path,method,body));
 return {status:r.status,data:await r.json() as any};
}
const doc=(id:string,name:string,modifiedAt='2026-10-20T08:00:00Z')=>
 normalizeDocument('drive',{id,name,mimeType:'application/pdf',modifiedTime:modifiedAt,
  webViewLink:'https://drive.google.com/file/d/'+id+'/view'});
test('compare snapshots: novos, alterados, iguais e ausentes sem excluir origem',()=>{
 const at='2026-10-23T10:00:00Z';
 const first=mergeCompleteSnapshot('drive',[],[doc('fileaaa','Direito A'),doc('filebbb','AFO')],at);
 assert.deepEqual(first.delta,{added:2,updated:0,missing:0,unchanged:0});
 const again=mergeCompleteSnapshot('drive',first.entries,[doc('filebbb','AFO'),
  doc('fileccc','Matemática'),doc('fileaaa','Direito A atualizado')],at);
 assert.deepEqual(again.delta,{added:1,updated:1,missing:0,unchanged:1});
 const removed=mergeCompleteSnapshot('drive',again.entries,[doc('filebbb','AFO')],at);
 assert.equal(removed.delta.missing,2);
 assert.equal(removed.entries.filter(x=>x.state==='missing').length,2);
 const repeats=mergeCompleteSnapshot('drive',removed.entries,[doc('filebbb','AFO')],at);
 assert.equal(repeats.delta.missing,0);
 assert.deepEqual(publicDocumentSearch(removed.entries,'AFO').map(x=>x.title),['AFO']);
 assert.deepEqual(publicDocumentSearch(removed.entries,'Direito',true).map(x=>x.state),['missing']);
});
test('metadados invalidos e links externos nao sao aceitos como documentacao confiavel',()=>{
 assert.throws(()=>normalizeDocument('drive',{id:'x',name:'Teste'}));
 assert.throws(()=>mergeCompleteSnapshot('drive',[],[doc('fileaaa','A'),doc('fileaaa','B')],new Date().toISOString()));
 assert.throws(()=>mergeCompleteSnapshot('notion',[],[doc('fileaaa','A')],new Date().toISOString()));
 const clean=normalizeDocument('drive',{id:'fileaaa',name:'<script> teste',mimeType:'pdf',
  webViewLink:'https://attacker.invalid/d'});
 assert.equal(clean.url,undefined);
 assert.doesNotMatch(clean.title,/[<>]/);
 const notion=normalizeNotionRecord({id:'aabbccdd-1234-4321-8000-aabbccddeeff',object:'page',
  last_edited_time:'2026-10-22T10:00:00Z',
  properties:{Title:{id:'title',type:'title',title:[{plain_text:'Anotações importantes'}]}}});
 assert.equal(notion.title,'Anotações importantes');
});
test('Drive pagina com token em cabecalho e falha fechada em incompleteSearch',async()=>{
 let queried:string[]=[];
 const transport=(async(url:string,init:RequestInit)=>{
  queried.push(url);
  assert.equal((init.headers as any).Authorization,'Bearer fake-token');
  if(url.includes('pageToken=next-1'))
   return Response.json({files:[{id:'filebbb',name:'Segundo.pdf',modifiedTime:'2026-10-22T10:00:00Z'}]});
  return Response.json({files:[{id:'fileaaa',name:'Primeiro.pdf',modifiedTime:'2026-10-22T10:00:00Z'}],nextPageToken:'next-1'});
 }) as typeof fetch;
 const a=await readDocumentPage('drive','fake-token',null,transport);
 const b=await readDocumentPage('drive','fake-token',a.nextCursor,transport);
 assert.equal(a.items[0].title,'Primeiro.pdf');
 assert.equal(b.items[0].title,'Segundo.pdf');
 assert.equal(b.nextCursor,null);
 assert.equal(queried.length,2);
 assert.ok(!queried.some(x=>x.includes('fake-token')));
 await assert.rejects(()=>readDocumentPage('drive','fake-token',null,
  (async()=>Response.json({incompleteSearch:true,files:[]})) as any),/incompleta/);
});
test('Notion pagina com cursor, escolhe paginas e nao envia token na URL',async()=>{
 let body:any;
 const transport=(async(url:string,init:RequestInit)=>{
  assert.equal(url,'https://api.notion.com/v1/search');
  assert.equal((init.headers as any).Authorization,'Bearer notion-fake-secret-012345');
  body=JSON.parse(String(init.body));
  return Response.json({results:[{object:'page',id:'aabbccdd-1234-4321-8000-aabbccddeeff',
   properties:{Nome:{type:'title',title:[{plain_text:'Projeto Alfa'}]}}}],
   has_more:false,next_cursor:null});
 }) as typeof fetch;
 const page=await readDocumentPage('notion','notion-fake-secret-012345','cursor-test',transport);
 assert.equal(body.start_cursor,'cursor-test');
 assert.equal(page.items[0].title,'Projeto Alfa');
 assert.equal(page.nextCursor,null);
 await assert.rejects(()=>readDocumentPage('notion','notion-fake-secret-012345',null,
  (async()=>Response.json({results:[],has_more:true,next_cursor:null})) as any),/cursor/);
});
test('Durable Object: estagio parcial nao apaga indice; commit atomico apos pagina final',async()=>{
 const db=storage();
 const first=await direct(db,'/scan/start','POST',{source:'drive'});
 const id=first.data.scan.id;
 assert.equal(first.status,201);
 assert.equal((await direct(db,'/scan/page','POST',{
  source:'drive',scanId:id,page:0,cursor:null,nextCursor:'next-page',
  items:[doc('fileaaa','Original')]
 })).data.completed,false);
 let status=await direct(db,'/status');
 assert.equal(status.data.sources[0].count,0);
 assert.equal((await direct(db,'/scan/page','POST',{
  source:'drive',scanId:id,page:0,cursor:null,nextCursor:'next-page',
  items:[doc('fileaaa','Original')]
 })).status,409);
 const peek=await direct(db,'/scan/peek?source=drive');
 assert.equal(peek.data.scan.cursor,'next-page');
 const completed=await direct(db,'/scan/page','POST',{
  source:'drive',scanId:id,page:1,cursor:'next-page',nextCursor:null,
  items:[doc('filebbb','Outro')]
 });
 assert.equal(completed.status,200);
 assert.deepEqual(completed.data.delta,{added:2,updated:0,missing:0,unchanged:0});
 status=await direct(db,'/status');
 assert.equal(status.data.sources[0].count,2);
 assert.equal(status.data.sources[0].scan,null);
 const query=await direct(db,'/list?source=drive&q=Outro');
 assert.deepEqual(query.data.items.map((x:any)=>x.title),['Outro']);
});
test('Erro, cancelamento e duplicatas preservam dados já catalogados',async()=>{
 const db=storage();
 const begin=await direct(db,'/scan/start','POST',{source:'drive'});
 const id=begin.data.scan.id;
 assert.equal((await direct(db,'/scan/page','POST',{
  source:'drive',scanId:id,page:0,cursor:null,nextCursor:null,
  items:[doc('fileaaa','A')]
 })).status,200);
 const next=await direct(db,'/scan/start','POST',{source:'drive'});
 const sid=next.data.scan.id;
 const fail=await direct(db,'/scan/page','POST',{source:'drive',scanId:sid,page:0,cursor:null,
  nextCursor:null,items:[doc('fileaaa','A'),doc('fileaaa','A')]});
 assert.equal(fail.status,400);
 assert.equal((await direct(db,'/status')).data.sources[0].count,1);
 assert.equal((await direct(db,'/scan/cancel','POST',{source:'drive',scanId:sid})).status,200);
 assert.equal((await direct(db,'/status')).data.sources[0].scan,null);
 assert.equal((await direct(db,'/status')).data.sources[0].count,1);
});
test('Rotas de documentos exigem origem exata, UID e ativacao separada',async()=>{
 const index=storage();
 const base:any={
  ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',LAB_DOCUMENTS_ENABLED:'false',
  LAB_DOCUMENTS:{idFromName:(uid:string)=>uid,get:()=>({fetch:(r:Request|string,i?:RequestInit)=>
   index.fetch(typeof r==='string'?new Request(r,i):r)})}
 };
 const make=(method='GET',path='status',body?:unknown,ori=origin)=>
  new Request('https://worker.invalid/api/lab/documents/'+path,{
   method,headers:{Origin:ori,Authorization:'Bearer fake',...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
 const worker=makeLabChatWorker({verify:async()=> 'owner'});
 assert.equal((await worker.fetch(make(),base)).status,503);
 assert.equal((await worker.fetch(make(),{...base,LAB_DOCUMENTS_ENABLED:'true'})).status,200);
 assert.equal((await worker.fetch(make('GET','status',undefined,'https://sigma-61328.web.app'),
  {...base,LAB_DOCUMENTS_ENABLED:'true'})).status,403);
 const intruder=makeLabChatWorker({verify:async()=> 'another'});
 assert.equal((await intruder.fetch(make(),{...base,LAB_DOCUMENTS_ENABLED:'true'})).status,403);
 const enabled={...base,LAB_DOCUMENTS_ENABLED:'true'};
 assert.equal((await worker.fetch(make('POST','sync',{source:'drive',action:'start'}),enabled)).status,401);
 assert.equal((await worker.fetch(make('POST','sync',{source:'notion',action:'start'}),enabled)).status,503);
 assert.equal((await worker.fetch(make(),enabled)).headers.get('Cache-Control'),'no-store');
});
