import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buildChatRequest, parseChatReply, resolveModelRoute, providerModel,
 supportsTools, DEFAULT_MODELS, isProviderId
} from '../worker/src/core/providers';
import {makeLabChatWorker} from '../worker/src/chat-lab';

const base = { system: 'Instruções fictícias.', messages: [
 {role:'user' as const,text:'Primeira pergunta'},
 {role:'assistant' as const,text:'Primeira resposta'},
 {role:'user' as const,text:'Segunda pergunta'}
], maxOutputTokens: 111, timeoutMs: 1000 };

test('sem LAB_PROVIDER a rota é Gemini, exatamente como antes',()=>{
 const resolved = resolveModelRoute({GEMINI_API_KEY:'g-key',GEMINI_MODEL:'gemini-fake'});
 assert.equal(resolved.route.provider,'gemini');
 assert.equal(resolved.route.model,'gemini-fake');
 assert.equal(resolved.fellBack,false);
});

test('LAB_PROVIDER desconhecido não liga provedor por acidente',()=>{
 const resolved = resolveModelRoute({LAB_PROVIDER:'inventado',GEMINI_API_KEY:'g-key'});
 assert.equal(resolved.route.provider,'gemini');
});

test('provedor escolhido sem chave cai no Gemini e sinaliza queda',()=>{
 const resolved = resolveModelRoute({LAB_PROVIDER:'deepseek',GEMINI_API_KEY:'g-key'});
 assert.equal(resolved.route.provider,'gemini');
 assert.equal(resolved.fellBack,true);
 assert.equal(resolved.requested,'deepseek');
});

test('provedor escolhido com chave é usado, com modelo padrão',()=>{
 const deepseek = resolveModelRoute({LAB_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'d-key',GEMINI_API_KEY:'g-key'});
 assert.equal(deepseek.route.provider,'deepseek');
 assert.equal(deepseek.route.model,DEFAULT_MODELS.deepseek);
 const anthropic = resolveModelRoute({LAB_PROVIDER:'anthropic',ANTHROPIC_API_KEY:'a-key'});
 assert.equal(anthropic.route.provider,'anthropic');
 assert.equal(anthropic.route.model,DEFAULT_MODELS.anthropic);
 assert.equal(providerModel({ANTHROPIC_MODEL:'claude-custom'},'anthropic'),'claude-custom');
});

test('sem nenhuma chave falha em vez de fingir que chamou um modelo',()=>{
 assert.throws(()=>resolveModelRoute({}),/Nenhum provedor/);
});

test('somente Gemini anuncia suporte a function calling',()=>{
 assert.equal(supportsTools('gemini'),true);
 for(const id of ['deepseek','openai','anthropic'] as const) assert.equal(supportsTools(id),false);
 assert.equal(isProviderId('claude'),false);
});

test('requisição OpenAI-compatible aponta para o endpoint certo do DeepSeek',()=>{
 const built = buildChatRequest({provider:'deepseek',model:'deepseek-flash',key:'d-key'},base);
 assert.equal(built.url,'https://api.deepseek.com/v1/chat/completions');
 const headers = built.init.headers as Record<string,string>;
 assert.equal(headers.Authorization,'Bearer d-key');
 const body = JSON.parse(String(built.init.body));
 assert.equal(body.model,'deepseek-flash');
 assert.equal(body.max_tokens,111);
 assert.deepEqual(body.messages[0],{role:'system',content:'Instruções fictícias.'});
 assert.deepEqual(body.messages.slice(1),[
  {role:'user',content:'Primeira pergunta'},
  {role:'assistant',content:'Primeira resposta'},
  {role:'user',content:'Segunda pergunta'}
 ]);
 assert.equal(body.tools,undefined,'sem tools no formato Gemini');
});

test('requisição OpenAI aponta para a OpenAI e usa o modelo escolhido',()=>{
 const built = buildChatRequest({provider:'openai',model:'gpt-6-luna',key:'o-key'},base);
 assert.equal(built.url,'https://api.openai.com/v1/chat/completions');
 assert.equal(JSON.parse(String(built.init.body)).model,'gpt-6-luna');
});

test('requisição Anthropic usa Messages API com system separado',()=>{
 const built = buildChatRequest({provider:'anthropic',model:'claude-sonnet-4-5',key:'a-key'},base);
 assert.equal(built.url,'https://api.anthropic.com/v1/messages');
 const headers = built.init.headers as Record<string,string>;
 assert.equal(headers['x-api-key'],'a-key');
 assert.equal(headers['anthropic-version'],'2023-06-01');
 assert.equal(headers.Authorization,undefined);
 const body = JSON.parse(String(built.init.body));
 assert.equal(body.system,'Instruções fictícias.');
 assert.equal(body.max_tokens,111);
 assert.equal(body.messages.length,3);
 assert.equal(body.messages[0].role,'user','a Anthropic não aceita system na lista');
});

test('requisição Gemini mantém o formato original',()=>{
 const built = buildChatRequest({provider:'gemini',model:'gemini-fake',key:'g-key'},base);
 assert.match(built.url,/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-fake:generateContent/);
 const body = JSON.parse(String(built.init.body));
 assert.equal(body.contents[0].parts[0].text,'Primeira pergunta');
 assert.equal(body.contents[1].role,'model');
 assert.equal(body.systemInstruction.parts[0].text,'Instruções fictícias.');
});

test('respostas dos três formatos normalizam para o mesmo parts',()=>{
 const gemini = parseChatReply('gemini',{candidates:[{content:{parts:[{text:'Olá'}]}}]});
 assert.deepEqual(gemini.parts,[{text:'Olá'}]);
 const anthropic = parseChatReply('anthropic',{content:[{type:'text',text:'Olá'}]});
 assert.deepEqual(anthropic.parts,[{text:'Olá'}]);
 const openai = parseChatReply('deepseek',{choices:[{message:{content:'Olá'}}]});
 assert.deepEqual(openai.parts,[{text:'Olá'}]);
 const blocks = parseChatReply('openai',{choices:[{message:{content:[{text:'Ol'},{text:'á'}]}}]});
 assert.deepEqual(blocks.parts,[{text:'Olá'}]);
});

test('resposta vazia ou malformada não inventa texto',()=>{
 assert.deepEqual(parseChatReply('deepseek',null).parts,[]);
 assert.deepEqual(parseChatReply('anthropic',{content:[{type:'tool_use'}]}).parts,[]);
 assert.deepEqual(parseChatReply('gemini',{candidates:[{content:{}}]}).parts,[]);
});

test('function call do Gemini continua sendo preservado',()=>{
 const parts = parseChatReply('gemini',{candidates:[{content:{parts:[
  {text:'pensando',thought:true},{functionCall:{name:'propose_task',args:{}}}
 ]}}]}).parts;
 assert.deepEqual(parts,[{text:'pensando',thought:true},{functionCall:{name:'propose_task',args:{}}}]);
});

const allowed='https://sigma-61328--jarvis-lab-pw5dmfbc.web.app';
const labEnv={
 FIREBASE_PROJECT_ID:'sigma-61328',ALLOWED_UID:'uid-test-only',
 ALLOWED_ORIGIN:allowed,LAB_CHAT_ENABLED:'true',
 GEMINI_API_KEY:'g-key',GEMINI_MODEL:'gemini-fake',
 LAB_QUOTA:{idFromName:(s:string)=>s,get:()=>({fetch:async()=>new Response(null,{status:204})})}
} as any;
const chatRequest=()=>new Request('https://lab-worker.invalid/api/lab/chat',{
 method:'POST',
 headers:{Origin:allowed,Authorization:'Bearer fake','Content-Type':'application/json'},
 body:JSON.stringify({messages:[{role:'user',text:'Exemplo fictício: diga oi.'}]})
});

test('chat do laboratório usa DeepSeek quando LAB_PROVIDER pede',async()=>{
 const worker=makeLabChatWorker({
  verify:async()=>labEnv.ALLOWED_UID,
  fetch:(async(input:RequestInfo|URL,init?:RequestInit)=>{
   assert.equal(String(input),'https://api.deepseek.com/v1/chat/completions');
   assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer d-key');
   return new Response(JSON.stringify({choices:[{message:{content:'Olá do DeepSeek (mock).'}}]}),{status:200});
  }) as typeof fetch
 });
 const response=await worker.fetch(chatRequest(),{...labEnv,LAB_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'d-key'});
 assert.equal(response.status,200);
 const body=await response.json() as any;
 assert.equal(body.text,'Olá do DeepSeek (mock).');
 assert.equal(body.provider,'deepseek');
 assert.equal(body.toolProposalsDisabled,true,'propostas exigem function calling do Gemini');
});

test('chat do laboratório usa Claude quando LAB_PROVIDER pede',async()=>{
 const worker=makeLabChatWorker({
  verify:async()=>labEnv.ALLOWED_UID,
  fetch:(async(input:RequestInfo|URL,init?:RequestInit)=>{
   assert.equal(String(input),'https://api.anthropic.com/v1/messages');
   assert.equal((init?.headers as Record<string,string>)['anthropic-version'],'2023-06-01');
   return new Response(JSON.stringify({content:[{type:'text',text:'Olá do Claude (mock).'}]}),{status:200});
  }) as typeof fetch
 });
 const response=await worker.fetch(chatRequest(),{...labEnv,LAB_PROVIDER:'anthropic',ANTHROPIC_API_KEY:'a-key'});
 const body=await response.json() as any;
 assert.equal(body.text,'Olá do Claude (mock).');
 assert.equal(body.provider,'anthropic');
});

test('sem LAB_PROVIDER o chat continua chamando o Gemini',async()=>{
 const worker=makeLabChatWorker({
  verify:async()=>labEnv.ALLOWED_UID,
  fetch:(async(input:RequestInfo|URL)=>{
   assert.match(String(input),/generativelanguage\.googleapis\.com/);
   return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Olá do Gemini (mock).'}]}}]}),{status:200});
  }) as typeof fetch
 });
 const response=await worker.fetch(chatRequest(),labEnv);
 const body=await response.json() as any;
 assert.equal(body.text,'Olá do Gemini (mock).');
 assert.equal(body.provider,'gemini');
 assert.equal(body.toolProposalsDisabled,undefined);
});

test('resposta avisa quando o provedor pedido caiu para o Gemini', async () => {
 const worker = makeLabChatWorker({
  verify: async () => labEnv.ALLOWED_UID,
  fetch: (async (input: RequestInfo | URL) => {
   assert.match(String(input), /generativelanguage\.googleapis\.com/,
    'sem chave do DeepSeek, a chamada sai para o Gemini');
   return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Olá (mock).' }] } }] }), { status: 200 });
  }) as typeof fetch
 });
 // LAB_PROVIDER pede deepseek, mas DEEPSEEK_API_KEY não existe.
 const response = await worker.fetch(chatRequest(), { ...labEnv, LAB_PROVIDER: 'deepseek' });
 const body = await response.json() as any;
 assert.equal(body.provider, 'gemini');
 assert.deepEqual(body.modelFallback, { requested: 'deepseek', used: 'gemini' });
});

test('sem queda, a resposta não menciona fallback', async () => {
 const worker = makeLabChatWorker({
  verify: async () => labEnv.ALLOWED_UID,
  fetch: (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })) as typeof fetch
 });
 const response = await worker.fetch(chatRequest(), { ...labEnv, LAB_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'd-key' });
 const body = await response.json() as any;
 assert.equal(body.provider, 'deepseek');
 assert.equal(body.modelFallback, undefined);
});
