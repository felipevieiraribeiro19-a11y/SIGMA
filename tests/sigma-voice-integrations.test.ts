import test from 'node:test';
import assert from 'node:assert/strict';
import {actionPayload} from '../worker/src/lab-external-actions';
import {executeApprovedExternalAction} from '../worker/src/core/sigma-action-executors';
import {externalProposal} from '../worker/src/core/external-proposal';
import {readGoogle} from '../worker/src/core/sigma-connectors';
import {makeLabChatWorker} from '../worker/src/chat-lab';
const item=(data:any)=>({id:'013ceaa9-d456-4a17-8000-916ab50c129b',data,status:'in_progress' as const,createdAt:'2026-10-25T00:00:00Z',expiresAt:'2026-10-25T00:10:00Z'});
test('Google Tasks grava prazo e notas na lista padrão sem enviar credenciais ao corpo',async()=>{
 const action=actionPayload({operation:'tasks.create',title:'Revisar contabilidade',content:'Revisar balanços',dueDate:'2026-10-26'});
 let called=0;
 const result=await executeApprovedExternalAction(item(action),'test-token',undefined,(async(url,init)=>{called++;assert.equal(url,'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks');const body=JSON.parse(String(init?.body));assert.equal(body.due,'2026-10-26T00:00:00.000Z');assert.equal(body.notes,'Revisar balanços');assert.ok(!JSON.stringify(body).includes('test-token'));return Response.json({id:'task1'});}) as typeof fetch);
 assert.equal(called,1);assert.equal(result.providerId,'task1');
});
test('Drive cria texto completo em upload multipart e ausência de recibo é incerta',async()=>{
 const data=actionPayload({operation:'drive.note.create',title:'Ideias',content:'Uma ideia com acentuação.\nOutra linha.'});
 const result=await executeApprovedExternalAction(item(data),'test-token',undefined,(async(url,init)=>{assert.match(String(url),/uploadType=multipart/);assert.match(String(init?.body),/Outra linha/);assert.match(String(init?.body),/Ideias.txt/);return Response.json({});}) as typeof fetch);
 assert.equal(result.status,'uncertain');
});
test('Notion preserva conteúdo longo em partes válidas',async()=>{
 const data=actionPayload({operation:'notion.page.create',title:'Ideias',content:'x'.repeat(4000),parentId:'013ceaa9-d456-4a17-8000-916ab50c129b'});
 await executeApprovedExternalAction(item(data),null,'test-notion-key',(async(_url,init)=>{const body=JSON.parse(String(init?.body));const texts=body.children[0].paragraph.rich_text.map((r:any)=>r.text.content);assert.equal(texts.join('').length,4000);assert.ok(texts.every((s:string)=>s.length<=1900));return Response.json({id:'page1'});}) as typeof fetch);
});
test('recusa datas inexistentes, fuso ausente e conteúdo excessivo',()=>{
 assert.throws(()=>actionPayload({operation:'tasks.create',title:'Teste',dueDate:'2026-02-30'}));
 assert.throws(()=>actionPayload({operation:'calendar.create',title:'Teste',start:'2026-10-26T10:00',end:'2026-10-26T11:00'}));
 assert.throws(()=>actionPayload({operation:'drive.note.create',title:'Teste',content:'x'.repeat(4001)}));
});
test('proposta externa exige intenção e jamais executa ao receber ferramenta',async()=>{
 const origin='https://sigma-61328.web.app';let calls=0;
 const env={ALLOWED_ORIGIN:origin,ALLOWED_UID:'owner',FIREBASE_PROJECT_ID:'sigma-61328',GEMINI_API_KEY:'fake',GEMINI_MODEL:'fake',LAB_CHAT_ENABLED:'true',LAB_BRAIN_ENABLED:'true',LAB_WORKSPACE_ENABLED:'true',LAB_CONNECTORS_ENABLED:'true',LAB_ACTIONS_ENABLED:'true',LAB_WORKSPACE:{},LAB_QUOTA:{idFromName:(x:string)=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})}} as any;
 const call={name:'propose_external_action',args:{operation:'drive.note.create',title:'Ideias',content:'Minha ideia'}};
 const worker=makeLabChatWorker({verify:async()=> 'owner',fetch:(async(url)=>{calls++;assert.match(String(url),/generativelanguage/);return Response.json({candidates:[{content:{parts:[{functionCall:call}]}}]});}) as typeof fetch});
 const res=await worker.fetch(new Request('https://worker.test/api/lab/chat',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',text:'Salve minha ideia no Drive'}]})}),env);
 assert.equal(res.status,200);const body=await res.json() as any;assert.equal(body.executed,false);assert.equal(body.externalAction.content,'Minha ideia');assert.equal(calls,1);
 assert.throws(()=>externalProposal(call,'O que é Google Drive?'));
});
test('consulta Tasks limpa texto e não retorna autorização',async()=>{
 const rows=await readGoogle('tasks','test-token',(async()=>Response.json({items:[{id:'a',title:'<Teste>',due:'2026-10-26T00:00:00.000Z'}]})) as typeof fetch);
 assert.equal(rows[0].title,'Teste');assert.equal(rows[0].kind,'tasks');assert.ok(!JSON.stringify(rows).includes('test-token'));
});
