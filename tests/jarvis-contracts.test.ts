import test from 'node:test';
import assert from 'node:assert/strict';
import {listModelProviders,buildGeminiRequest,DEFAULT_PROVIDER} from '../worker/src/core/models';
import {proposeMemory,isPersistedMemory} from '../worker/src/core/memory-contracts';
import {planAction,mayExecute} from '../worker/src/core/action-contracts';

test('Gemini é a única IA ativa e demais integrações não são simuladas',()=>{
 assert.equal(DEFAULT_PROVIDER,'gemini');
 const providers=listModelProviders();
 assert.deepEqual(providers.filter(p=>p.status==='connected').map(p=>p.id),['gemini']);
 for(const p of providers.filter(p=>p.id!=='gemini'))assert.equal(p.status,'planned');
});

test('chave Gemini nunca aparece na URL e dados são serializados no backend',()=>{
 const call=buildGeminiRequest('gemini-model','private-secret',{contents:[{role:'user',parts:[{text:'olá'}]}]},35000);
 assert.ok(call.url.endsWith('gemini-model:generateContent'));
 assert.ok(!call.url.includes('private-secret'));
 assert.equal((call.init.headers as Record<string,string>)['x-goog-api-key'],'private-secret');
 assert.ok(String(call.init.body).includes('olá'));
});

test('lembranças propostas não equivalem a registros confirmados',()=>{
 const suggestion=proposeMemory('preference','prefere respostas diretas',{sourceId:'chat-1',sourceKind:'conversation',observedAt:'2026-10-21T00:00:00Z'});
 assert.equal(suggestion.requiresUserReview,true);
 assert.equal(isPersistedMemory(suggestion),false);
});
test('ações requerem destino, descrição e bloqueiam escrita mesmo com confirmação antecipada',()=>{
 const proposal=planAction({
  id:'action-1',capabilityId:'integration.calendar.write',summary:'Criar evento',
  target:'Google Calendar pessoal',intendedChange:'Criar evento terça 15h',
  actorUid:'owner',createdAt:'2026-10-21T00:00:00Z',risk:'external-side-effect'
 });
 assert.equal(proposal.status,'proposed');
 assert.equal(mayExecute(proposal,{actionId:'action-1',actorUid:'owner',approved:true,approvedAt:'2026-10-21T00:00:00Z'},{searchConfigured:true,googleConnected:true}),false);
 assert.equal(mayExecute(proposal,{actionId:'outro',actorUid:'owner',approved:true,approvedAt:'2026-10-21T00:00:00Z'},{searchConfigured:true,googleConnected:true}),false);
 assert.throws(()=>planAction({id:'',capabilityId:'x',summary:'s',target:'a',intendedChange:'b',actorUid:'u',createdAt:'now',risk:'write'}));
});
