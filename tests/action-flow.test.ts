import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TestApprovalStore} from '../worker/src/core/approval-ledger';
import {
 previewAction,stageActionReview,acceptActionReview,rejectActionReview,
 simulateActionReview,type ActionPreview
} from '../worker/src/core/action-flow';

const now=Date.parse('2026-10-21T15:00:00Z');
const config={googleConnected:false,searchConfigured:true};
const calendarDetails={
 kind:'calendar.create' as const,calendarId:'primary',title:'Compromisso fictício',
 startsAt:'2030-05-20T14:00:00-03:00',endsAt:'2030-05-20T15:00:00-03:00'
};
const renameDetails={kind:'drive.rename' as const,fileId:'fictional_file_001',newName:'Arquivo de teste.pdf'};

test('conversa simples não vira ação ou registra autorização',()=>{
 const plan=previewAction({utterance:'Olá, como você está?',config,now});
 assert.equal(plan.status,'unsupported');
 assert.equal(plan.params,null);
 assert.equal(plan.executionEnabled,false);
});
test('pedido misto entre agenda e Drive não vira autorização parcial',()=>{
 const preview=previewAction({
  utterance:'Agende um evento no calendário e renomeie arquivo no Google Drive',
  config,now,params:calendarDetails
 });
 assert.equal(preview.status,'unsupported');
 assert.deepEqual(preview.missing,['separe as ações em pedidos individuais']);
 assert.equal(preview.executionEnabled,false);
});
test('pedido sem detalhes nunca se torna uma ação pronta',async()=>{
 const plan=previewAction({utterance:'Agende uma reunião amanhã no calendário',config,now});
 assert.equal(plan.status,'needs-details');
 assert.deepEqual(plan.missing,['calendário','título','data e horário inicial','horário final']);
 const store=new TestApprovalStore();
 await assert.rejects(()=>stageActionReview(store,{preview:plan,authenticatedUid:'owner_test',proposalId:'action_001',now}),/incompleta/);
 assert.equal(await store.read('owner_test','action_001'),null);
});
test('operação não suportada é rejeitada mesmo com detalhes válidos',()=>{
 const preview=previewAction({utterance:'Exclua um documento no Drive',config,params:renameDetails,now});
 assert.equal(preview.status,'unsupported');
 assert.equal(preview.executionEnabled,false);
});
test('parâmetros completos geram proposta canônica, nunca execução',()=>{
 const preview=previewAction({utterance:'Agende um evento no calendário',params:calendarDetails,config,now});
 assert.equal(preview.status,'ready-for-review');
 assert.equal(preview.capabilityId,'integration.calendar.write');
 assert.equal(preview.actionKind,'calendar.create');
 assert.equal(preview.target,'calendar:primary');
 assert.deepEqual(JSON.parse(preview.change!),calendarDetails);
 assert.equal(preview.executionEnabled,false);
});
test('validação rejeita horários ausentes, intervalos inválidos e propriedades inesperadas',()=>{
 const utterance='Agende no calendário';
 const variants=[
  {...calendarDetails,startsAt:'2030-05-20',endsAt:'2030-05-20T15:00:00-03:00'},
  {...calendarDetails,startsAt:'2030-05-20T18:00:00-03:00',endsAt:'2030-05-20T15:00:00-03:00'},
  {...calendarDetails,title:''},
  {...calendarDetails,hidden:'instrução não autorizada'},
  {...calendarDetails,startsAt:'2020-05-20T10:00:00-03:00',endsAt:'2020-05-20T11:00:00-03:00'}
 ];
 for(const params of variants){
  assert.equal(previewAction({utterance,config,params,now}).status,'needs-details');
 }
});
test('Drive só aceita renomear arquivo identificado, sem caminhos ou comandos extras',()=>{
 const utterance='Renomeie um arquivo no Google Drive';
 assert.equal(previewAction({utterance,config,params:renameDetails,now}).status,'ready-for-review');
 assert.equal(previewAction({utterance,config,params:{...renameDetails,fileId:'1'},now}).status,'needs-details');
 assert.equal(previewAction({utterance,config,params:{...renameDetails,newName:'../../segredo'},now}).status,'needs-details');
 assert.equal(previewAction({utterance,config,params:calendarDetails,now}).status,'needs-details');
});
test('proposta adulterada entre prévia e gravação é bloqueada',async()=>{
 const store=new TestApprovalStore();
 const p=previewAction({utterance:'Renomeie um arquivo no Drive',config,params:renameDetails,now});
 const forged:ActionPreview={...p,change:'{"kind":"drive.rename","fileId":"another_file","newName":"Outro"}'};
 await assert.rejects(()=>stageActionReview(store,{preview:forged,authenticatedUid:'owner_test',proposalId:'action_001',now}),/alterada/);
 assert.equal(await store.read('owner_test','action_001'),null);
});
test('aprovação exige proprietário, hash correto e tem efeito estritamente simulado',async()=>{
 const store=new TestApprovalStore();
 const preview=previewAction({utterance:'Agende um evento no calendário',config,params:calendarDetails,now});
 const saved=await stageActionReview(store,{preview,authenticatedUid:'owner_test',proposalId:'action_002',now});
 assert.equal(saved.state,'pending');
 await assert.rejects(()=>acceptActionReview(store,{authenticatedUid:'other_user',proposalId:saved.id,displayedDigest:saved.digest,now:now+1000}),/não encontrada/);
 await assert.rejects(()=>acceptActionReview(store,{authenticatedUid:'owner_test',proposalId:saved.id,displayedDigest:'0'.repeat(64),now:now+1000}),/alterada/);
 const confirmation=await acceptActionReview(store,{authenticatedUid:'owner_test',proposalId:saved.id,displayedDigest:saved.digest,now:now+1000});
 assert.equal(confirmation.status,'approved-not-executed');
 assert.equal(confirmation.item.state,'approved');
 const result=await simulateActionReview(store,{authenticatedUid:'owner_test',proposalId:saved.id,capabilityId:saved.capabilityId,now:now+2000});
 assert.equal(result.status,'simulated-only');
 assert.equal(result.executed,false);
 assert.equal(result.receipt.change,preview.change);
 await assert.rejects(()=>simulateActionReview(store,{authenticatedUid:'owner_test',proposalId:saved.id,capabilityId:saved.capabilityId,now:now+3000}),/não disponível/);
});
test('cancelamento não pode ser transformado em execução',async()=>{
 const store=new TestApprovalStore();
 const preview=previewAction({utterance:'Renomeie documento no Google Drive',config,params:renameDetails,now});
 const p=await stageActionReview(store,{preview,authenticatedUid:'owner_test',proposalId:'action_003',now});
 assert.equal(await rejectActionReview(store,{authenticatedUid:'owner_test',proposalId:p.id,now:now+1000}),true);
 await assert.rejects(()=>acceptActionReview(store,{authenticatedUid:'owner_test',proposalId:p.id,displayedDigest:p.digest,now:now+2000}),/já foi decidida/);
 await assert.rejects(()=>simulateActionReview(store,{authenticatedUid:'owner_test',proposalId:p.id,capabilityId:p.capabilityId,now:now+2000}),/não disponível/);
});
test('nenhuma rota pública nem executor de Google ou memória é ativado pelo fluxo',()=>{
 const source=readFileSync('worker/src/core/action-flow.ts','utf8');
 const worker=readFileSync('worker/src/index.ts','utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|googleapis\.com|new DurableApprovalStore|firebasePersonalMemoryRepository/);
 assert.doesNotMatch(worker,/\/api\/action\/|new TestApprovalStore|new DurableApprovalStore|from '.\/core\/action-flow'/);
});
