import test from 'node:test';
import assert from 'node:assert/strict';
import {DurableApprovalStore} from '../worker/src/core/approval-durable';
import {issueApproval,confirmApproval,cancelApproval,consumeApproval} from '../worker/src/core/approval-ledger';

function fakeDurableStorage(){
 const values=new Map<string,unknown>();
 let queued:Promise<unknown>=Promise.resolve();
 const storage={
  async get<T>(key:string){return structuredClone(values.get(key)) as T|undefined},
  async transaction<T>(callback:(tx:{
   get<V>(key:string):Promise<V|undefined>;
   put<V>(key:string,value:V):Promise<void>
  })=>Promise<T>):Promise<T>{
   let release!:()=>void;
   const lock=new Promise<void>(resolve=>{release=resolve});
   const previous=queued;
   queued=previous.then(()=>lock);
   await previous;
   try{
    return await callback({
     get:async<V>(key:string)=>structuredClone(values.get(key)) as V|undefined,
     put:async<V>(key:string,value:V)=>{values.set(key,structuredClone(value))}
    });
   }finally{release()}
  }
 };
 return {storage:storage as unknown as DurableObjectStorage,values};
}
const actorUid='fictional_owner';
const input={
 id:'approval_test_001',actorUid,
 capabilityId:'integration.calendar.write',
 target:'Agenda de testes',
 change:'Criar evento de teste sem dados privados',
 now:100_000,ttlMs:60_000
};
test('não grava dados por simplesmente instanciar; armazena somente após proposta',async()=>{
 const {storage,values}=fakeDurableStorage();
 const adapter=new DurableApprovalStore(storage,actorUid);
 assert.equal(values.size,0);
 const item=await issueApproval(adapter,input);
 assert.equal(values.size,1);
 assert.equal(item.state,'pending');
 assert.equal([...values.keys()][0],'sigma:approvals:v1:'+actorUid+':'+item.id);
});
test('reinstanciar Durable Object não perde proposta; outra conta jamais lê',async()=>{
 const {storage}=fakeDurableStorage();
 const first=new DurableApprovalStore(storage,actorUid);
 const item=await issueApproval(first,input);
 const restarted=new DurableApprovalStore(storage,actorUid);
 assert.deepEqual(await restarted.read(actorUid,item.id),item);
 const foreign=new DurableApprovalStore(storage,'fictional_other');
 await assert.rejects(()=>foreign.read(actorUid,item.id),/outra conta/);
 assert.equal(await foreign.read('fictional_other',item.id),null);
});
test('confirmar e consumir são transações de uso único, inclusive concorrentes',async()=>{
 const {storage}=fakeDurableStorage();
 const adapter=new DurableApprovalStore(storage,actorUid);
 const item=await issueApproval(adapter,input);
 const confirmations=await Promise.allSettled([
  confirmApproval(adapter,{id:item.id,authenticatedUid:actorUid,displayedDigest:item.digest,now:110_000}),
  confirmApproval(adapter,{id:item.id,authenticatedUid:actorUid,displayedDigest:item.digest,now:110_000})
 ]);
 assert.equal(confirmations.filter(x=>x.status==='fulfilled').length,1);
 const fresh=new DurableApprovalStore(storage,actorUid);
 const uses=await Promise.allSettled([
  consumeApproval(adapter,{id:item.id,authenticatedUid:actorUid,capabilityId:item.capabilityId,now:112_000}),
  consumeApproval(fresh,{id:item.id,authenticatedUid:actorUid,capabilityId:item.capabilityId,now:112_000})
 ]);
 assert.equal(uses.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await adapter.read(actorUid,item.id))?.state,'consumed');
});
test('cancelar em um reinício impede aprovação antiga no outro',async()=>{
 const {storage}=fakeDurableStorage();
 const adapter=new DurableApprovalStore(storage,actorUid);
 const item=await issueApproval(adapter,input);
 const second=new DurableApprovalStore(storage,actorUid);
 assert.equal(await cancelApproval(second,{id:item.id,authenticatedUid:actorUid,now:115_000}),true);
 await assert.rejects(()=>confirmApproval(adapter,{id:item.id,authenticatedUid:actorUid,displayedDigest:item.digest,now:117_000}),/já foi decidida/);
 assert.equal((await adapter.read(actorUid,item.id))?.state,'cancelled');
});
test('replay de identificador após consumo ou cancelamento falha',async()=>{
 const {storage}=fakeDurableStorage();
 const adapter=new DurableApprovalStore(storage,actorUid);
 const item=await issueApproval(adapter,input);
 await confirmApproval(adapter,{id:item.id,authenticatedUid:actorUid,displayedDigest:item.digest,now:110_000});
 await consumeApproval(adapter,{id:item.id,authenticatedUid:actorUid,capabilityId:item.capabilityId,now:115_000});
 await assert.rejects(()=>issueApproval(new DurableApprovalStore(storage,actorUid),input),/já utilizado/);
});
test('tempo é checado também dentro da transação de armazenamento',async()=>{
 const {storage}=fakeDurableStorage();
 const adapter=new DurableApprovalStore(storage,actorUid);
 const item=await issueApproval(adapter,input);
 assert.equal(await adapter.transition(actorUid,item.id,'pending','approved',160_000),null);
 assert.equal(await adapter.transition(actorUid,item.id,'pending','approved',99_000),null);
 assert.equal((await adapter.read(actorUid,item.id))?.state,'pending');
 await assert.rejects(()=>adapter.transition(actorUid,item.id,'pending','consumed',110_000),/proibida/);
});
test('aprovação não abre rota HTTP nem conta com servidor de dados reais',async()=>{
 const {storage}=fakeDurableStorage();
 new DurableApprovalStore(storage,actorUid);
 const fs=await import('node:fs');
 const worker=fs.readFileSync('worker/src/index.ts','utf8');
 assert.doesNotMatch(worker,/\/api\/approvals\b|\/api\/memory\/approve/);
 assert.doesNotMatch(worker,/new DurableApprovalStore/);
});
