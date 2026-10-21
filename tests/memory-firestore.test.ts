import test from 'node:test';
import assert from 'node:assert/strict';
import {firebasePersonalMemoryRepository} from '../worker/src/core/memory-firestore';
import {approveMemory,deleteMemory,draftMemory,editMemory} from '../worker/src/core/memory-engine';

const project='sigma-test-project',uid='owner_alpha';
const time='2026-10-21T15:00:00Z';
const evidence={sourceId:'turn_001',sourceKind:'conversation' as const,observedAt:time};
type Doc={name:string;fields:Record<string,any>;updateTime:string};
function firestoreMock(){
 const docs=new Map<string,Doc>();let timeSeq=0;const requests:{url:string;method:string;body:any}[]=[];
 const transport=(async(url:string,init:RequestInit)=>{
  assert.ok(url.startsWith('https://firestore.googleapis.com/v1/'),'outbound requests restricted to Firestore');
  assert.equal((init.headers as Record<string,string>).Authorization,'Bearer fake-id-token');
  const body=init.body?JSON.parse(String(init.body)):undefined;
  requests.push({url,method:init.method||'',body});
  if(init.method==='GET'){
   const item=docs.get(url.slice('https://firestore.googleapis.com/v1/'.length));
   return item?Response.json(item):new Response(null,{status:404});
  }
  if(url.endsWith(':runQuery')){
   const prefix=url.slice('https://firestore.googleapis.com/v1/'.length).replace(':runQuery','')+'/personalMemories/';
   return Response.json([...docs.entries()].filter(([key])=>key.startsWith(prefix)).map(([,document])=>({document})));
  }
  if(url.endsWith(':commit')){
   const write=body.writes[0];
   const path=write.update.name;
   const previous=docs.get(path);
   if(write.currentDocument.exists===false&&previous)return new Response(null,{status:409});
   if(write.currentDocument.updateTime&&(!previous||previous.updateTime!==write.currentDocument.updateTime))return new Response(null,{status:412});
   timeSeq++;
   docs.set(path,{name:path,fields:write.update.fields,updateTime:'2026-10-21T15:00:'+String(timeSeq).padStart(2,'0')+'Z'});
   return Response.json({writeResults:[{updateTime:docs.get(path)!.updateTime}]});
  }
  assert.fail('URL ou método inesperado');
 }) as typeof fetch;
 return {repository:firebasePersonalMemoryRepository(project,uid,{kind:'trusted-server-oauth',accessToken:'fake-id-token'},transport),requests,docs};
}
function proposal(){
 return draftMemory({proposalId:'memory_001',ownerUid:uid,kind:'preference',content:'Prefiro notícias com fontes oficiais',source:evidence,createdAt:time});
}
const approval={proposalId:'memory_001',actorUid:uid,approvedContent:'Prefiro notícias com fontes oficiais',decision:'approve' as const,confirmedAt:time};

test('adaptador existe mas não consulta Firebase quando apenas construído',()=>{
 const {requests}=firestoreMock();assert.deepEqual(requests,[]);
});
test('salva somente depois da confirmação e lê a origem da memória',async()=>{
 const {repository,requests}=firestoreMock();
 assert.equal(requests.length,0);
 const saved=await approveMemory(proposal(),approval,repository);
 assert.equal(saved.status,'saved');
 assert.equal(requests.length,1);
 const persisted=await repository.get(uid,'memory_001');
 assert.equal(persisted?.content,approval.approvedContent);
 assert.equal(persisted?.provenance[0].sourceId,'turn_001');
 assert.equal(persisted?.revision,1);
 assert.equal(requests[0].body.writes[0].currentDocument.exists,false);
});
test('repetição não duplica memória, mesmo após receber confirmação novamente',async()=>{
 const {repository}=firestoreMock();const p=proposal();
 assert.equal((await approveMemory(p,approval,repository)).status,'saved');
 assert.equal((await approveMemory(p,approval,repository)).status,'already-saved');
 assert.equal((await repository.list(uid,100)).length,1);
});
test('atualização exige revisão e usa a versão do servidor na transação',async()=>{
 const {repository,requests}=firestoreMock();await approveMemory(proposal(),approval,repository);
 const next=await editMemory(repository,{id:'memory_001',actorUid:uid,expectedRevision:1,approvedContent:'Prefiro notícias de fontes públicas',confirmedAt:'2026-10-21T15:30:00Z'});
 assert.equal(next.revision,2);
 assert.equal((await repository.get(uid,'memory_001'))?.content,'Prefiro notícias de fontes públicas');
 const commit=requests.findLast(r=>r.url.endsWith(':commit'))!;
 assert.ok(commit.body.writes[0].currentDocument.updateTime);
 await assert.rejects(()=>editMemory(repository,{id:'memory_001',actorUid:uid,expectedRevision:1,approvedContent:'conflito',confirmedAt:time}),/mudou/);
});
test('exclusão sobrescreve todos os campos pessoais e impede retry da aprovação antiga',async()=>{
 const {repository,docs,requests}=firestoreMock();await approveMemory(proposal(),approval,repository);
 await deleteMemory(repository,{id:'memory_001',actorUid:uid,expectedRevision:1,decision:'delete',confirmedAt:time});
 assert.equal(await repository.get(uid,'memory_001'),null);
 assert.deepEqual(await repository.list(uid,200),[]);
 const deleted=[...docs.values()][0];
 assert.deepEqual(Object.keys(deleted.fields).sort(),['deleted','revision']);
 assert.equal(JSON.stringify(deleted.fields).includes('fontes'),false);
 assert.equal(JSON.stringify(deleted.fields).includes('owner_alpha'),false);
 await assert.rejects(()=>approveMemory(proposal(),approval,repository),/Identificador já utilizado/);
 const writes=requests.filter(r=>r.url.endsWith(':commit'));
 assert.equal(writes.length,3);
});
test('operações cruzando usuários bloqueiam antes de enviar pedido ao Firestore',async()=>{
 const {repository,requests}=firestoreMock();
 await assert.rejects(()=>repository.get('intruder_001','memory_001'),/Conta não autorizada/);
 await assert.rejects(()=>repository.list('intruder_001',10),/Conta não autorizada/);
 await assert.rejects(()=>repository.deleteIfRevision('intruder_001','memory_001',1),/Conta não autorizada/);
 assert.equal(requests.length,0);
});
test('projeto, UID e token precisam ser válidos',()=>{
 assert.throws(()=>firebasePersonalMemoryRepository('bad!project',uid,{kind:'trusted-server-oauth',accessToken:'fake'}));
 assert.throws(()=>firebasePersonalMemoryRepository(project,'x',{kind:'trusted-server-oauth',accessToken:'fake'}));
 assert.throws(()=>firebasePersonalMemoryRepository(project,uid,{kind:'trusted-server-oauth',accessToken:'with newline\n'}));
 assert.throws(()=>firebasePersonalMemoryRepository(project,uid,{kind:'client-firebase-id-token',accessToken:'fake'} as any));
});
