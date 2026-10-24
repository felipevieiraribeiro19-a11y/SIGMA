import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBetaInventory,type MainBetaSnapshot,type LabBetaSnapshot} from '../src/beta-data-inventory';

const stamp='2026-10-24T12:00:00.000Z';
const main=():MainBetaSnapshot=>({uid:'test-owner-123',turns:[
 {id:'same-id',userText:'Hoje estudei Contabilidade',assistantText:'Entendi.',createdAt:stamp}
]});
const lab=():LabBetaSnapshot=>({uid:'test-owner-123',
 memories:[{id:'same-id',text:'Prefiro revisar à noite',createdAt:stamp,updatedAt:stamp}],
 projects:[{id:'project-1',title:'Teste SIGMA',status:'active',createdAt:stamp,updatedAt:stamp}],
 entries:[
  {id:'task-1',kind:'task',title:'Revisar meu planejamento',createdAt:stamp,updatedAt:stamp,done:false},
  {id:'study-1',kind:'study',title:'Contabilidade',createdAt:stamp,updatedAt:stamp,done:false}
 ]
});

test('combina inventários por UID, preservando origem e identificadores',()=>{
 const result=buildBetaInventory(main(),lab());
 assert.equal(result.ownerUid,'test-owner-123');
 assert.equal(result.records.length,5);
 assert.equal(result.counts.conversations,1);
 assert.equal(result.counts.memories,1);
 assert.equal(result.counts.projects,1);
 assert.equal(result.counts.tasks,1);
 assert.equal(result.counts.studies,1);
 assert.equal(result.records.filter(x=>x.sourceId==='same-id').length,2);
 assert.notEqual(result.records.find(x=>x.kind==='conversation')?.key,
  result.records.find(x=>x.kind==='memory')?.key);
 assert.equal(result.records.find(x=>x.kind==='task')?.status,'pending');
 assert.equal(result.readOnly,true);
 assert.equal(result.migrationPerformed,false);
});

test('não aceita misturar contas Firebase distintas',()=>{
 const foreign=lab();foreign.uid='other-user-999';
 assert.throws(()=>buildBetaInventory(main(),foreign),/mesma conta/);
});

test('não interpreta fonte ausente como coleção vazia',()=>{
 const broken=lab() as unknown as Record<string,unknown>;
 delete broken.entries;
 assert.throws(()=>buildBetaInventory(main(),broken as LabBetaSnapshot),/incompleta ou inválida/);
});

test('rejeita duplicação dentro da mesma origem e categoria',()=>{
 const data=lab();data.entries.push({...data.entries[0]});
 assert.throws(()=>buildBetaInventory(main(),data),/duplicado/);
});

test('não mistura nem modifica registros de origem',()=>{
 const a=main(),b=lab();
 const beforeA=JSON.stringify(a),beforeB=JSON.stringify(b);
 const result=buildBetaInventory(a,b);
 assert.equal(JSON.stringify(a),beforeA);
 assert.equal(JSON.stringify(b),beforeB);
 assert.ok(result.records.every(r=>!('notes' in r)&&!('amount' in r)&&!('assistantText' in r)));
});

test('erro em registro impede inventário parcial enganoso',()=>{
 const data=lab();data.entries[0].createdAt='data-inválida';
 assert.throws(()=>buildBetaInventory(main(),data),/inválido/);
});

test('registros de texto idêntico em fontes distintas não são apagados',()=>{
 const a=main();a.turns[0].userText='Mesma descrição';
 const b=lab();b.memories[0].text='Mesma descrição';
 const result=buildBetaInventory(a,b);
 assert.equal(result.records.filter(x=>x.title==='Mesma descrição').length,2);
});
