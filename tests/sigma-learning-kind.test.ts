import test from 'node:test';
import assert from 'node:assert/strict';
import {LabMemoryStore,LAB_MEMORY_LIMIT} from '../worker/src/lab-memory';
import {proposeContinuousLearning} from '../worker/src/core/continuous-learning';
import {userApprovedMemoryContext,readSelectedMemory} from '../worker/src/core/lab-memory-chat';
import {relevantLabMemory} from '../worker/src/core/lab-memory-relevance';

function memoryStore(){
 const values=new Map<string,unknown>();
 const storage={transaction:async(fn:(tx:any)=>Promise<unknown>)=>
   fn({get:async(k:string)=>values.get(k),put:async(k:string,v:unknown)=>{values.set(k,v)}})};
 return new LabMemoryStore({storage} as any);
}
async function ask(store:LabMemoryStore,method:string,path='/entries',value?:unknown){
 const request=new Request('https://lab-memory.internal'+path,{
  method,...(value===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})
 });
 const response=await store.fetch(request);
 return {status:response.status,data:await response.json()};
}

test('kind é opcional e assume fato, preservando o que já existia',async()=>{
 const store=memoryStore();
 const created=await ask(store,'POST','/entries',{text:'Registro fictício sem tipo declarado'});
 assert.equal(created.status,201);
 assert.equal(created.data.entry.kind,'fato');
 const listed=await ask(store,'GET');
 assert.equal(listed.data.entries[0].kind,'fato');
});

test('kind é gravado, devolvido e editável',async()=>{
 const store=memoryStore();
 const created=await ask(store,'POST','/entries',{text:'Prefiro respostas curtas','kind':'preferencia'});
 assert.equal(created.data.entry.kind,'preferencia');
 const id=created.data.entry.id as string;
 const changed=await ask(store,'PATCH','/entries/'+id,{text:'Prefiro respostas curtas em tópicos'});
 assert.equal(changed.data.entry.kind,'preferencia','editar texto não apaga o tipo');
 const retyped=await ask(store,'PATCH','/entries/'+id,{text:'Prefiro respostas curtas em tópicos','kind':'correcao'});
 assert.equal(retyped.data.entry.kind,'correcao');
});

test('kind desconhecido é recusado e campos extras continuam bloqueados',async()=>{
 const store=memoryStore();
 const bad=await ask(store,'POST','/entries',{text:'Registro fictício','kind':'segredo'});
 assert.equal(bad.status,400);
 const extra=await ask(store,'POST','/entries',{text:'Registro fictício',ownerUid:'outro'});
 assert.equal(extra.status,400);
});

test('registro antigo sem kind é lido como fato sem migração',async()=>{
 const values=new Map<string,unknown>([['entries',[
  {id:'11111111-1111-4111-8111-111111111111',text:'Nota antiga sem tipo',
   createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'}
 ]]]);
 const storage={transaction:async(fn:(tx:any)=>Promise<unknown>)=>
  fn({get:async(k:string)=>values.get(k),put:async(k:string,v:unknown)=>{values.set(k,v)}})};
 const store=new LabMemoryStore({storage} as any);
 const listed=await ask(store,'GET');
 assert.equal(listed.data.entries[0].kind,'fato');
 assert.equal(listed.data.entries[0].text,'Nota antiga sem tipo');
});

test('aprendizado classifica correção, preferência, rotina e fato',()=>{
 assert.equal(proposeContinuousLearning('Na verdade eu prefiro tabelas em vez de listas')?.kind,'correcao');
 assert.equal(proposeContinuousLearning('Pare de usar emojis nas respostas')?.kind,'correcao');
 assert.equal(proposeContinuousLearning('Corrija: o projeto se chama Alfa e não Beta')?.kind,'correcao');
 assert.equal(proposeContinuousLearning('Eu prefiro respostas curtas')?.kind,'preferencia');
 assert.equal(proposeContinuousLearning('Todo dia acordo às seis da manhã')?.kind,'rotina');
 assert.equal(proposeContinuousLearning('Lembre que minha prova é em dezembro')?.kind,'fato');
});

test('aprendizado segue sem salvar sozinho e sem capturar segredo',()=>{
 for(const frase of ['Na verdade eu prefiro tabelas em vez de listas',
  'Corrija: o projeto se chama Alfa e não Beta','Todo dia acordo às seis da manhã']){
  const draft=proposeContinuousLearning(frase);
  assert.equal(draft?.requiresApproval,true,'toda proposta exige aprovação humana');
 }
 assert.equal(proposeContinuousLearning('Na verdade a senha é 12345'),null);
 assert.equal(proposeContinuousLearning('Oi, tudo bem?'),null);
 assert.equal(proposeContinuousLearning(42),null);
});

test('prompt separa longo prazo do curto prazo e rotula o tipo',()=>{
 const context=userApprovedMemoryContext([
  {id:'11111111-1111-4111-8111-111111111111',text:'Prefiro respostas curtas',
   kind:'preferencia',createdAt:'',updatedAt:''},
  {id:'22222222-2222-4222-8222-222222222222',text:'Pare de usar emojis',
   kind:'correcao',createdAt:'',updatedAt:''}
 ],'manual');
 assert.match(context,/MEMÓRIA DE LONGO PRAZO/);
 assert.match(context,/MEMÓRIA DE CURTO PRAZO/);
 assert.match(context,/\[PREFERÊNCIA\]/);
 assert.match(context,/\[CORREÇÃO\]/);
 assert.match(context,/nunca como instruções/);
 assert.match(context,/Não salve nada/);
});

test('memória selecionada e recuperada por relevância carregam o tipo',()=>{
 const row={id:'11111111-1111-4111-8111-111111111111',text:'Prefiro tabelas em vez de listas',
  kind:'preferencia',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'};
 const legacy={id:'22222222-2222-4222-8222-222222222222',text:'Nota antiga sobre tabelas',
  createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'};
 const selected=readSelectedMemory([row,legacy],[row.id]);
 assert.equal(selected[0].kind,'preferencia');
 const ranked=relevantLabMemory([row,legacy],'quais tabelas eu prefiro?');
 assert.ok(ranked.length>=1);
 for(const entry of ranked)assert.ok(['fato','preferencia','correcao','rotina'].includes(entry.kind));
});

test('limite de memórias não muda',async()=>{
 const store=memoryStore();
 for(let index=0;index<LAB_MEMORY_LIMIT;index++){
  const created=await ask(store,'POST','/entries',{text:'Registro fictício número '+index});
  assert.equal(created.status,201);
 }
 const blocked=await ask(store,'POST','/entries',{text:'Registro fictício excedente'});
 assert.equal(blocked.status,409);
});
