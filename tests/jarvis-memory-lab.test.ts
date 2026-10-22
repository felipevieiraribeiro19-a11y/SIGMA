import test from 'node:test';
import assert from 'node:assert/strict';
import {LabMemoryStore,LAB_MEMORY_LIMIT} from '../worker/src/lab-memory';
import {makeLabChatWorker} from '../worker/src/chat-lab';

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
test('memória é vazia por padrão, criada apenas por POST explícito',async()=>{
 const store=memoryStore();
 assert.deepEqual((await ask(store,'GET')).data,{entries:[]});
 const created=await ask(store,'POST','/entries',{text:'  Exemplo fictício para teste   '});
 assert.equal(created.status,201);
 const entry=created.data.entry as {id:string;text:string};
 assert.equal(entry.text,'Exemplo fictício para teste');
 assert.match(entry.id,/^[0-9a-f-]{36}$/);
 const found=await ask(store,'GET');
 assert.equal(found.data.entries.length,1);
});
test('editar e apagar registro; excluir todas as memórias',async()=>{
 const store=memoryStore();
 const created=await ask(store,'POST','/entries',{text:'Valor fictício antigo'});
 const id=created.data.entry.id as string;
 const changed=await ask(store,'PATCH','/entries/'+id,{text:'Valor fictício corrigido'});
 assert.equal(changed.status,200);
 assert.equal(changed.data.entry.text,'Valor fictício corrigido');
 assert.equal((await ask(store,'DELETE','/entries/'+id)).status,200);
 assert.deepEqual((await ask(store,'GET')).data,{entries:[]});
 await ask(store,'POST','/entries',{text:'Outro exemplo'});
 assert.deepEqual((await ask(store,'DELETE')).data,{deletedAll:true});
 assert.deepEqual((await ask(store,'GET')).data,{entries:[]});
});
test('memória não aceita múltiplos campos, textos inválidos nem IDs arbitrários',async()=>{
 const store=memoryStore();
 for(const body of [{text:'ok'},{text:'válido',uid:'outra-pessoa'},{text:'a'.repeat(501)}]){
  assert.equal((await ask(store,'POST','/entries',body)).status,400);
 }
 assert.equal((await ask(store,'PATCH','/entries/../../bad',{text:'item válido'})).status,404);
 assert.equal((await ask(store,'DELETE','/entries/not-a-uuid')).status,404);
});
test('cota de registros é aplicada ao gravar 31a memória',async()=>{
 const store=memoryStore();
 for(let i=0;i<LAB_MEMORY_LIMIT;i++)
  assert.equal((await ask(store,'POST','/entries',{text:'Registro fictício '+i})).status,201);
 assert.equal((await ask(store,'POST','/entries',{text:'Excedente fictício'})).status,409);
});
const origin='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const sampleEnv={
 FIREBASE_PROJECT_ID:'sigma-61328',ALLOWED_UID:'uid-lab-test',
 ALLOWED_ORIGIN:origin,LAB_CHAT_ENABLED:'true',LAB_WEB_ENABLED:'false',
 LAB_MEMORY_ENABLED:'true',GEMINI_API_KEY:'fake',GEMINI_MODEL:'fake',
 LAB_QUOTA:{idFromName:(id:string)=>id,get:()=>({fetch:async()=>new Response(null,{status:204})})},
 LAB_MEMORY:{idFromName:(id:string)=>id,get:()=>({fetch:(req:Request)=>memoryStoreInstance.fetch(req)})}
} as any;
const memoryStoreInstance=memoryStore();
function req(method:string,path='/api/lab/memory',site=origin,text?:unknown){
 return new Request('https://lab-worker.example'+path,{method,headers:{
  Origin:site,Authorization:'Bearer fake-token',
  ...(text===undefined?{}:{'Content-Type':'application/json'})
 },...(text===undefined?{}:{body:JSON.stringify(text)})});
}
test('rota memória falha fechada enquanto flag desativada',async()=>{
 let verifications=0;
 const worker=makeLabChatWorker({verify:async()=>{verifications++;return sampleEnv.ALLOWED_UID;}});
 const response=await worker.fetch(req('GET'),{...sampleEnv,LAB_MEMORY_ENABLED:'false'});
 assert.equal(response.status,503);assert.equal(verifications,0);
});
test('rota memória bloqueia origem de produção e outro UID antes de escrever',async()=>{
 const worker=makeLabChatWorker({verify:async()=>sampleEnv.ALLOWED_UID});
 assert.equal((await worker.fetch(req('POST','/api/lab/memory','https://sigma-61328.web.app',{text:'ficção'}),sampleEnv)).status,403);
 const wrong=makeLabChatWorker({verify:async()=> 'outro-uid'});
 assert.equal((await wrong.fetch(req('POST','/api/lab/memory',origin,{text:'ficção'}),sampleEnv)).status,403);
});
test('rota memória do Worker aceita somente usuário autorizado e operação explícita',async()=>{
 const worker=makeLabChatWorker({verify:async()=>sampleEnv.ALLOWED_UID});
 assert.equal((await worker.fetch(req('GET'),sampleEnv)).status,200);
 const created=await worker.fetch(req('POST','/api/lab/memory',origin,{text:'Memória fictícia manual'}),sampleEnv);
 assert.equal(created.status,201);
 const data=await created.json() as {entry:{id:string;text:string}};
 assert.equal(data.entry.text,'Memória fictícia manual');
 assert.equal((await worker.fetch(req('DELETE','/api/lab/memory/'+data.entry.id),sampleEnv)).status,200);
});
test('não existe captura automática de mensagem ou integração Firestore neste contrato',async()=>{
 const worker=makeLabChatWorker({verify:async()=>sampleEnv.ALLOWED_UID,fetch:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Olá'}]}}]}),{status:200})});
 const response=await worker.fetch(req('POST','/api/lab/chat',origin,{messages:[{role:'user',text:'Quero falar de qualquer assunto.'}]}),sampleEnv);
 assert.equal(response.status,200);
 assert.deepEqual((await ask(memoryStoreInstance,'GET')).data,{entries:[]});
});
