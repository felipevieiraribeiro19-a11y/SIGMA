import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readBetaInventory} from '../src/beta-data-reader';

const main='https://sigma-cerebro.felipevieiraribeiro19.workers.dev';
const lab='https://sigma-jarvis-cerebro-lab.felipevieiraribeiro19.workers.dev';
const now='2026-10-24T12:00:00.000Z';
const uid='test-owner-123';
const token='mocked-firebase-id-token-long-enough';
const sources:Record<string,unknown>={
 [main+'/api/history']:{turns:[{id:'turn-1',userText:'Olá SIGMA',assistantText:'Olá!',createdAt:now}]},
 [lab+'/api/lab/memory']:{entries:[{id:'mem-1',text:'Gosto de estudar',createdAt:now,updatedAt:now}]},
 [lab+'/api/lab/workspace']:{entries:[{id:'task-1',kind:'task',title:'Revisar',createdAt:now,updatedAt:now,done:false}]},
 [lab+'/api/lab/workspace/projects']:{projects:[{id:'project-1',title:'Teste SIGMA',status:'active',createdAt:now,updatedAt:now}]}
};
function transport(overrides:Record<string,unknown>={}):typeof fetch{
 return (async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  assert.equal(init?.method,'GET');
  assert.equal(init?.cache,'no-store');
  assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+token);
  if(!(url in {...sources,...overrides}))return new Response('Not found',{status:404});
  return new Response(JSON.stringify(({...sources,...overrides})[url]),{
   status:200,headers:{'Content-Type':'application/json'}
  });
 }) as typeof fetch;
}
const options=()=>({uid,idToken:token,mainApiBase:main,labApiBase:lab,transport:transport()});

test('consulta as duas APIs com token e sem escrita',async()=>{
 const inventory=await readBetaInventory(options());
 assert.equal(inventory.records.length,4);
 assert.equal(inventory.counts.conversations,1);
 assert.equal(inventory.counts.memories,1);
 assert.equal(inventory.counts.tasks,1);
 assert.equal(inventory.counts.projects,1);
 assert.equal(inventory.migrationPerformed,false);
});

test('falha fechada quando uma das fontes está indisponível',async()=>{
 const opts=options();
 opts.transport=transport({[lab+'/api/lab/memory']:{invalid:true}});
 await assert.rejects(readBetaInventory(opts),/incompletos/);
});

test('recusa mesma origem para os dois bancos',async()=>{
 const opts=options();
 opts.labApiBase=main;
 await assert.rejects(readBetaInventory(opts),/distintas/);
});

test('recusa API fora de HTTPS workers.dev',async()=>{
 const opts=options();
 opts.mainApiBase='http://localhost:8787';
 await assert.rejects(readBetaInventory(opts),/não autorizada/);
});

test('recusa ausência de autenticação',async()=>{
 const opts=options();
 opts.idToken='';
 await assert.rejects(readBetaInventory(opts),/Autenticação/);
});
