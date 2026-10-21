import test from 'node:test';
import assert from 'node:assert/strict';
import {
 draftMemory,suggestExplicitMemory,approveMemory,editMemory,deleteMemory,
 searchMemory,InMemoryControlledMemoryRepository
} from '../worker/src/core/memory-engine';

const clock='2026-10-21T15:00:00Z';
const source={sourceId:'turn_001',sourceKind:'conversation' as const,observedAt:clock};
function draft(ownerUid='owner_alpha',proposalId='proposal_001',content='Prefiro conversar em português'){
 return draftMemory({proposalId,ownerUid,kind:'preference',content,source,createdAt:clock});
}
function review(p= draft()){
 return {proposalId:p.proposalId,actorUid:p.ownerUid,approvedContent:p.content,decision:'approve' as const,confirmedAt:clock};
}

test('só comando direto e explícito gera PROPOSTA; não cria registro',async()=>{
 assert.equal(suggestExplicitMemory('Hoje fui ao trabalho',{ownerUid:'owner_alpha',proposalId:'proposal_002',source,createdAt:clock}),null);
 const proposed=suggestExplicitMemory('Lembre que eu gosto de viajar',{ownerUid:'owner_alpha',proposalId:'proposal_002',source,createdAt:clock});
 assert.equal(proposed?.status,'pending-review');
 assert.equal(proposed?.content,'eu gosto de viajar');
 const store=new InMemoryControlledMemoryRepository();
 assert.deepEqual(await store.list('owner_alpha',10),[]);
});

test('rejeição manual não salva nenhum conteúdo',async()=>{
 const store=new InMemoryControlledMemoryRepository(),p=draft();
 const result=await approveMemory(p,{...review(p),decision:'reject'},store);
 assert.equal(result.status,'rejected');
 assert.equal(await store.get(p.ownerUid,p.proposalId),null);
});
test('aprovação explícita produz memória confirmada com origem e revisão',async()=>{
 const store=new InMemoryControlledMemoryRepository(),p=draft();
 const saved=await approveMemory(p,review(p),store);
 assert.equal(saved.status,'saved');
 assert.equal(saved.item?.ownerUid,'owner_alpha');
 assert.equal(saved.item?.verification,'confirmed');
 assert.equal(saved.item?.provenance[0].sourceId,'turn_001');
 assert.equal(saved.item?.revision,1);
 assert.equal((await store.list('owner_alpha',10)).length,1);
});
test('conteúdo alterado após proposta ou aprovação de outro usuário é recusado',async()=>{
 const store=new InMemoryControlledMemoryRepository(),p=draft();
 await assert.rejects(()=>approveMemory(p,{...review(p),approvedContent:'Outra coisa'},store),/conteúdo/);
 await assert.rejects(()=>approveMemory(p,{...review(p),actorUid:'intruder_001'},store),/outra conta/);
 await assert.rejects(()=>approveMemory(p,{...review(p),proposalId:'proposal_999'},store),/proposta/);
 assert.deepEqual(await store.list('owner_alpha',10),[]);
});
test('repetir confirmação não duplica; reutilizar ID para dado diferente falha',async()=>{
 const store=new InMemoryControlledMemoryRepository(),p=draft();
 assert.equal((await approveMemory(p,review(p),store)).status,'saved');
 assert.equal((await approveMemory(p,review(p),store)).status,'already-saved');
 const different=draft(p.ownerUid,p.proposalId,'Conteúdo conflitante');
 await assert.rejects(()=>approveMemory(different,review(different),store),/Identificador já utilizado/);
 assert.equal((await store.list('owner_alpha',10)).length,1);
});
test('editar exige versão correta, origem rastreável e atualização confirmada',async()=>{
 const store=new InMemoryControlledMemoryRepository(),p=draft();await approveMemory(p,review(p),store);
 const next=await editMemory(store,{id:p.proposalId,actorUid:p.ownerUid,expectedRevision:1,approvedContent:'Prefiro respostas curtas',confirmedAt:'2026-10-21T15:10:00Z'});
 assert.equal(next.revision,2);
 assert.equal(next.content,'Prefiro respostas curtas');
 assert.equal(next.provenance.length,2);
 assert.equal(next.provenance[1].sourceKind,'user-confirmation');
 await assert.rejects(()=>editMemory(store,{id:p.proposalId,actorUid:p.ownerUid,expectedRevision:1,approvedContent:'Texto antigo',confirmedAt:clock}),/mudou/);
 assert.equal((await store.get(p.ownerUid,p.proposalId))?.content,'Prefiro respostas curtas');
});
test('não existe leitura, edição ou exclusão cruzando contas',async()=>{
 const store=new InMemoryControlledMemoryRepository(),p=draft();await approveMemory(p,review(p),store);
 assert.equal(await store.get('other_account',p.proposalId),null);
 assert.deepEqual(await searchMemory(store,'other_account','português'),[]);
 await assert.rejects(()=>editMemory(store,{id:p.proposalId,actorUid:'other_account',expectedRevision:1,approvedContent:'ataque',confirmedAt:clock}),/não encontrada/);
 await assert.rejects(()=>deleteMemory(store,{id:p.proposalId,actorUid:'other_account',expectedRevision:1,decision:'delete',confirmedAt:clock}),/não encontrada/);
 assert.equal((await store.list(p.ownerUid,10)).length,1);
});
test('exclusão confirmada remove conteúdo e impede restauração por retry antigo',async()=>{
 const store=new InMemoryControlledMemoryRepository(),p=draft();await approveMemory(p,review(p),store);
 await deleteMemory(store,{id:p.proposalId,actorUid:p.ownerUid,expectedRevision:1,decision:'delete',confirmedAt:'2026-10-21T15:20:00Z'});
 assert.equal(await store.get(p.ownerUid,p.proposalId),null);
 assert.deepEqual(await searchMemory(store,p.ownerUid,'português'),[]);
 await assert.rejects(()=>approveMemory(p,review(p),store),/Identificador já utilizado/);
});
test('exclusão sem confirmação explícita ou com versão antiga é recusada',async()=>{
 const store=new InMemoryControlledMemoryRepository(),p=draft();await approveMemory(p,review(p),store);
 await assert.rejects(()=>deleteMemory(store,{id:p.proposalId,actorUid:p.ownerUid,expectedRevision:1,decision:'cancel' as 'delete',confirmedAt:clock}),/confirmada/);
 await assert.rejects(()=>deleteMemory(store,{id:p.proposalId,actorUid:p.ownerUid,expectedRevision:5,decision:'delete',confirmedAt:clock}),/mudou/);
 assert.equal((await store.list(p.ownerUid,10)).length,1);
});
test('busca lexical oferece evidência original, tolera acentos e limita respostas',async()=>{
 const store=new InMemoryControlledMemoryRepository();
 const a=draft('owner_alpha','proposal_001','Gosto de conversar em português brasileiro');
 const b=draft('owner_alpha','proposal_002','Tenho um projeto de robótica');
 await approveMemory(a,review(a),store);await approveMemory(b,review(b),store);
 const hits=await searchMemory(store,'owner_alpha','conversar portugues',1);
 assert.equal(hits.length,1);
 assert.equal(hits[0].id,'proposal_001');
 assert.equal(hits[0].source.sourceId,'turn_001');
 assert.equal(hits[0].matchScore,2);
 assert.deepEqual(await searchMemory(store,'owner_alpha','meteorologia'),[]);
});
test('entradas inválidas são rejeitadas e não há armazenamento oculto',async()=>{
 assert.throws(()=>draftMemory({proposalId:'x',ownerUid:'owner_alpha',kind:'fact',content:'Olá',source,createdAt:clock}),/Identificador/);
 assert.throws(()=>draftMemory({proposalId:'proposal_123',ownerUid:'owner_alpha',kind:'fact',content:' ',source,createdAt:clock}),/vazia/);
 assert.throws(()=>draftMemory({proposalId:'proposal_123',ownerUid:'owner_alpha',kind:'fact',content:'x'.repeat(1001),source,createdAt:clock}),/longa/);
 assert.throws(()=>draftMemory({proposalId:'proposal_123',ownerUid:'owner_alpha',kind:'fact',content:'Olá',source:{...source,observedAt:'invalido'},createdAt:clock}),/Data/);
});
