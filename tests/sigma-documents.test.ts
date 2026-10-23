import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileDocuments,searchDocuments,validateSnapshot,type DocumentSnapshot,type IndexedDocument} from '../worker/src/core/document-index';
import {LabDocumentIndex} from '../worker/src/lab-document-index';
import {fetchDriveDocumentSnapshot,fetchNotionDocumentSnapshot} from '../worker/src/core/document-source-readers';
import {makeLabChatWorker} from '../worker/src/chat-lab';
const drive=(id:string,version='v1',text?:string)=>({
 source:'drive' as const,sourceId:id,title:'Economia e Direito',version,
 updatedAt:'2026-10-23T10:00:00Z',url:'https://drive.google.com/file/d/'+id,
 mimeType:'application/pdf',...(text===undefined?{}:{text})
});
const notion=(id:string,version='v1',text?:string)=>({
 source:'notion' as const,sourceId:id,title:'Relatório de orçamento',version,
 updatedAt:'2026-10-23T10:00:00Z',url:'https://www.notion.so/'+id,
 mimeType:'application/vnd.notion.page',...(text===undefined?{}:{text})
});
const snapshot=(source:'drive'|'notion',documents:unknown[]):DocumentSnapshot=>({source,complete:true,documents:documents as any});
function makeStorage(){
 const values=new Map<string,unknown>();
 const object=new LabDocumentIndex({storage:{transaction:async <T>(fn:(tx:any)=>Promise<T>)=>fn({
  get:async(key:string)=>values.get(key),put:async(key:string,value:unknown)=>{values.set(key,value);}
 })}} as any);
 return object;
}
async function internal(store:LabDocumentIndex,path:string,method='GET',body?:unknown){
 const req=new Request('https://lab-documents.internal'+path,{method,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const res=await store.fetch(req);return {code:res.status,data:await res.json()};
}
test('sync detecta novos, alterados e removidos sem mexer na outra origem',()=>{
 const first=reconcileDocuments([],snapshot('drive',[drive('alpha','1','Texto de economia'),drive('beta','1')]));
 assert.deepEqual(first.changes,{added:2,updated:0,unchanged:0,removed:0,total:2});
 const withNotion=reconcileDocuments(first.documents,snapshot('notion',[notion('notion1')]));
 assert.equal(withNotion.changes.total,3);
 const second=reconcileDocuments(withNotion.documents,snapshot('drive',[drive('alpha','2')]));
 assert.deepEqual(second.changes,{added:0,updated:1,unchanged:0,removed:1,total:2});
 assert.equal(second.documents.find(x=>x.key==='drive:alpha')?.text,'','texto velho não deve parecer atual');
 assert.equal(second.documents.find(x=>x.source==='notion')?.title,'Relatório de orçamento');
});
test('metadados da mesma versão preservam texto indexado, reindexação altera texto',()=>{
 const a=reconcileDocuments([],snapshot('drive',[drive('a','v1','Importante conteúdo sobre LRF')]));
 const b=reconcileDocuments(a.documents,snapshot('drive',[drive('a','v1')]));
 assert.equal(b.changes.unchanged,1);
 assert.equal(b.documents[0].text,'Importante conteúdo sobre LRF');
 const c=reconcileDocuments(b.documents,snapshot('drive',[drive('a','v1','Novo texto')]));
 assert.equal(c.changes.updated,1);
 assert.equal(c.documents[0].text,'Novo texto');
});
test('listagem parcial, duplicada, URL maliciosa, textos enormes são rejeitados',()=>{
 assert.throws(()=>validateSnapshot({source:'drive',complete:false,documents:[]}),/incompleta/);
 assert.throws(()=>validateSnapshot(snapshot('drive',[drive('same'),drive('same')])),/duplicado/);
 assert.throws(()=>validateSnapshot(snapshot('drive',[{...drive('a'),url:'javascript:alert(1)'}])),/Link/);
 assert.throws(()=>validateSnapshot(snapshot('drive',[{...drive('a'),text:'x'.repeat(12001)}])),/Texto/);
 assert.throws(()=>validateSnapshot(snapshot('drive',[{...notion('a')} as any])),/Identificador/);
});
test('search encontra títulos e trechos com fonte e distingue apenas metadados',()=>{
 const store=reconcileDocuments([],snapshot('drive',[drive('file1','v1','Introdução à contabilidade pública'),drive('file2','v1')])).documents;
 const results=searchDocuments(store,'onde estão os documentos de contabilidade pública?');
 assert.equal(results.length,1);
 assert.equal(results[0].key,'drive:file1');
 assert.equal(results[0].contentStatus,'indexed');
 const meta=searchDocuments(store,'economia');
 assert.equal(meta.length,2);
 assert.equal(meta[1].excerpt.includes('Somente metadados'),true);
 assert.throws(()=>searchDocuments(store,'x'.repeat(181)),/Pesquisa/);
});
test('Durable Object mantém índice persistente e permite apagar só fonte local',async()=>{
 const db=makeStorage();
 assert.equal((await internal(db,'/sync','POST',snapshot('drive',[drive('aa')]))).code,200);
 assert.equal((await internal(db,'/sync','POST',snapshot('notion',[notion('cc','v1','Regra de estudo')]))).code,200);
 assert.equal((await internal(db,'/documents')).data.count,2);
 assert.equal((await internal(db,'/search?q=estudo')).data.results.length,1);
 const deleted=await internal(db,'/clear?source=drive','DELETE');
 assert.equal(deleted.data.removed,1);
 assert.equal(deleted.data.deletedFromProvider,false);
 assert.equal((await internal(db,'/documents')).data.documents[0].source,'notion');
 assert.equal((await internal(db,'/sync','POST',{source:'notion',complete:false,documents:[]})).code,409);
 assert.equal((await internal(db,'/documents')).data.count,1);
});
test('Google Drive paginação completa, texto simples opcional e token só no cabeçalho',async()=>{
 let calls=0;
 const fake=async (url:string,init:RequestInit)=>{
  calls++;
  assert.equal((init.headers as any).Authorization,'Bearer read-token');
  assert.ok(!url.includes('read-token'));
  if(url.includes('/export'))return new Response('Plano de estudos: orçamento e finanças públicas');
  if(url.includes('pageToken=NEXT'))return Response.json({files:[
   {id:'pdf1',name:'AFO.pdf',modifiedTime:'2026-10-23T09:00:00Z',mimeType:'application/pdf',version:'2',webViewLink:'https://drive.google.com/file/d/pdf1'}
  ]});
  return Response.json({files:[{id:'doc1',name:'Planejamento',mimeType:'application/vnd.google-apps.document',
   modifiedTime:'2026-10-23T09:00:00Z',version:'5',webViewLink:'https://docs.google.com/document/d/doc1'}],nextPageToken:'NEXT'});
 };
 const data=await fetchDriveDocumentSnapshot('read-token',fake as typeof fetch,true);
 assert.equal(data.documents.length,2);
 assert.match(data.documents[0].text||'',/orçamento/);
 assert.equal(data.documents[1].text,undefined,'PDF sem extração não deve ser considerado indexado');
 assert.equal(calls,3);
});
test('erro na segunda página cancela a varredura completa',async()=>{
 let calls=0;
 const fake=async()=>{
  calls++;
  return calls===1?Response.json({files:[],nextPageToken:'NEXT'}):new Response('falha',{status:503});
 };
 await assert.rejects(()=>fetchDriveDocumentSnapshot('read-token',fake as any),/Erro de consulta/);
 assert.equal(calls,2);
});
test('Notion indexa blocos textuais quando autorizado e não os guarda em caso de falha',async()=>{
 const fake=async (url:string,init:RequestInit)=>{
  assert.equal((init.headers as any).Authorization,'Bearer valid-notion-key');
  if(url.includes('/blocks/'))return Response.json({results:[
   {type:'paragraph',paragraph:{rich_text:[{plain_text:'Conceitos de Direito Administrativo'}]}}
  ]});
  return Response.json({results:[{id:'00000000-1111-2222-3333-444444444444',
   url:'https://www.notion.so/Teste-00000000111122223333444444444444',
   last_edited_time:'2026-10-23T10:00:00Z',
   properties:{Nome:{type:'title',title:[{plain_text:'Resumo de Direito'}]}}}],has_more:false});
 };
 const data=await fetchNotionDocumentSnapshot('valid-notion-key',fake as any,true);
 assert.equal(data.documents[0].title,'Resumo de Direito');
 assert.match(data.documents[0].text||'',/Direito Administrativo/);
 const onlyMetadata=await fetchNotionDocumentSnapshot('valid-notion-key',fake as any,false);
 assert.equal(onlyMetadata.documents[0].text,undefined);
});
test('API de documentos nunca responde sem UID autorizado e flag habilitada',async()=>{
 const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
 const env={ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',LAB_DOCUMENTS_ENABLED:'false',
  LAB_CONNECTORS_ENABLED:'false',LAB_QUOTA:{idFromName:(x:string)=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})}} as any;
 const req=(path:string,site=origin,method='GET')=>new Request('https://worker.invalid/api/lab/documents'+path,
  {method,headers:{Origin:site,Authorization:'Bearer fake','Content-Type':'application/json'}});
 const worker=makeLabChatWorker({verify:async()=> 'owner'});
 assert.equal((await worker.fetch(req(''),env)).status,503);
 assert.equal((await worker.fetch(req('','https://sigma-61328.web.app'),env)).status,403);
 const stranger=makeLabChatWorker({verify:async()=> 'another'});
 assert.equal((await stranger.fetch(req(''),{...env,LAB_DOCUMENTS_ENABLED:'true'})).status,403);
});
