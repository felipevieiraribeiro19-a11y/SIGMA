import test from 'node:test';
import assert from 'node:assert/strict';
import {TestApprovalStore,issueApproval,confirmApproval,cancelApproval,consumeApproval,fingerprint} from '../worker/src/core/approval-ledger';

const input={
 id:'consent_0001',actorUid:'owner_fictional',capabilityId:'integration.calendar.write',
 target:'Agenda de teste',change:'Criar evento fictício às 15h',now:100_000,ttlMs:60_000
};
test('proposta é pendente, não grava informação pessoal nem executa tarefas',async()=>{
 const store=new TestApprovalStore(),p=await issueApproval(store,input);
 assert.equal(p.state,'pending');
 assert.equal(p.expiresAt,160000);
 assert.match(p.digest,/^[0-9a-f]{64}$/);
 assert.equal((await store.read(input.actorUid,input.id))?.state,'pending');
 await assert.rejects(()=>consumeApproval(store,{id:p.id,authenticatedUid:p.actorUid,capabilityId:p.capabilityId,now:110_000}),/não disponível/);
});
test('impressão digital corresponde apenas à proposta exata',async()=>{
 const store=new TestApprovalStore(),p=await issueApproval(store,input);
 const otherHash=await fingerprint({...p,change:'Cancelar outro evento'});
 assert.notEqual(otherHash,p.digest);
 await assert.rejects(()=>confirmApproval(store,{id:p.id,authenticatedUid:p.actorUid,displayedDigest:otherHash,now:110_000}),/alterada/);
 assert.equal((await store.read(input.actorUid,input.id))?.state,'pending');
});
test('confirmação só funciona para proprietário autenticado',async()=>{
 const store=new TestApprovalStore(),p=await issueApproval(store,input);
 await assert.rejects(()=>confirmApproval(store,{id:p.id,authenticatedUid:'other_user',displayedDigest:p.digest,now:110_000}),/não encontrada/);
 assert.equal((await store.read(input.actorUid,input.id))?.state,'pending');
});
test('aprovação correta só pode ser consumida uma vez para ferramenta original',async()=>{
 const store=new TestApprovalStore(),p=await issueApproval(store,input);
 await confirmApproval(store,{id:p.id,authenticatedUid:p.actorUid,displayedDigest:p.digest,now:110_000});
 await assert.rejects(()=>confirmApproval(store,{id:p.id,authenticatedUid:p.actorUid,displayedDigest:p.digest,now:111_000}),/já foi decidida/);
 await assert.rejects(()=>consumeApproval(store,{id:p.id,authenticatedUid:p.actorUid,capabilityId:'integration.drive.write',now:112_000}),/Ferramenta diferente/);
 const receipt=await consumeApproval(store,{id:p.id,authenticatedUid:p.actorUid,capabilityId:p.capabilityId,now:112_000});
 assert.equal(receipt.change,p.change);
 assert.equal(receipt.actorUid,p.actorUid);
 assert.equal(receipt.consumedAt,112_000);
 await assert.rejects(()=>consumeApproval(store,{id:p.id,authenticatedUid:p.actorUid,capabilityId:p.capabilityId,now:113_000}),/não disponível/);
});
test('proposta expirada não pode ser aprovada nem consumida',async()=>{
 const store=new TestApprovalStore(),p=await issueApproval(store,input);
 await assert.rejects(()=>confirmApproval(store,{id:p.id,authenticatedUid:p.actorUid,displayedDigest:p.digest,now:160_000}),/expirada/);
 await confirmApproval(store,{id:p.id,authenticatedUid:p.actorUid,displayedDigest:p.digest,now:130_000});
 await assert.rejects(()=>consumeApproval(store,{id:p.id,authenticatedUid:p.actorUid,capabilityId:p.capabilityId,now:160_000}),/expirada/);
});
test('cancelamento impede execução e não pode ser revertido com aprovação antiga',async()=>{
 const store=new TestApprovalStore(),p=await issueApproval(store,input);
 assert.equal(await cancelApproval(store,{id:p.id,authenticatedUid:p.actorUid,now:120_000}),true);
 assert.equal(await cancelApproval(store,{id:p.id,authenticatedUid:p.actorUid,now:121_000}),false);
 await assert.rejects(()=>confirmApproval(store,{id:p.id,authenticatedUid:p.actorUid,displayedDigest:p.digest,now:122_000}),/já foi decidida/);
 await assert.rejects(()=>consumeApproval(store,{id:p.id,authenticatedUid:p.actorUid,capabilityId:p.capabilityId,now:122_000}),/não disponível/);
});
test('identificadores não são reutilizados e TTL tem teto',async()=>{
 const store=new TestApprovalStore();
 await issueApproval(store,input);
 await assert.rejects(()=>issueApproval(store,input),/já utilizado/);
 await assert.rejects(()=>issueApproval(store,{...input,id:'new_approval',ttlMs:9999999}),/Validade/);
 await assert.rejects(()=>issueApproval(store,{...input,id:'new_approval',change:''}),/Detalhes/);
});
test('confirmações concorrentes são atômicas na implementação de testes',async()=>{
 const store=new TestApprovalStore(),p=await issueApproval(store,input);
 const confirm={id:p.id,authenticatedUid:p.actorUid,displayedDigest:p.digest,now:140_000};
 const results=await Promise.allSettled([confirmApproval(store,confirm),confirmApproval(store,confirm)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const uses=await Promise.allSettled([
  consumeApproval(store,{id:p.id,authenticatedUid:p.actorUid,capabilityId:p.capabilityId,now:141_000}),
  consumeApproval(store,{id:p.id,authenticatedUid:p.actorUid,capabilityId:p.capabilityId,now:141_000})
 ]);
 assert.equal(uses.filter(x=>x.status==='fulfilled').length,1);
});
