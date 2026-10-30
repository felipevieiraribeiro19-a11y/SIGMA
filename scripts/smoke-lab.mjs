#!/usr/bin/env node
/**
 * Teste de fumaça do Worker de laboratório, depois de publicar.
 *
 * Nunca imprime o token, nunca grava nada em disco e não altera estado:
 * todas as chamadas são leituras ou uma pergunta de chat sem efeito colateral.
 *
 * Uso:
 *   node scripts/smoke-lab.mjs --url https://<worker-lab>.workers.dev
 *   node scripts/smoke-lab.mjs --url ... --token-file /tmp/id-token.txt
 *
 * O token é o valor depois de "Bearer " no cabeçalho Authorization de qualquer
 * requisição /api/lab/* (DevTools > Network > Request Headers).
 */
import {readFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const LOCAL=/^http:\/\/(127\.0\.0\.1|localhost):\d+$/;

function parseArgs(argv){
 const out={url:'',origin:'https://sigma-61328--jarvis-lab-pw5dmfbc.web.app',
  tokenFile:'',chat:'Responda apenas: teste ok.',json:false,timeout:30000};
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--url')out.url=argv[++i]||'';
  else if(a==='--origin')out.origin=argv[++i]||'';
  else if(a==='--token-file')out.tokenFile=argv[++i]||'';
  else if(a==='--chat')out.chat=argv[++i]||'';
  else if(a==='--timeout')out.timeout=Number(argv[++i])||30000;
  else if(a==='--json')out.json=true;
  else if(a==='--help'||a==='-h')out.help=true;
 }
 return out;
}

const mask=(value)=>{
 if(typeof value!=='string'||!value)return '(ausente)';
 return value.length<=8?value.slice(0,2)+'…':value.slice(0,4)+'…'+value.slice(-4);
};

function fail(message){
 console.error('ERRO: '+message);
 process.exit(2);
}

/** Deduz o endereço do Worker a partir do wrangler.chat-lab.toml, quando --url é omitido. */
function urlFromWrangler(){
 const root=join(dirname(fileURLToPath(import.meta.url)),'..');
 const path=join(root,'worker','wrangler.chat-lab.toml');
 if(!existsSync(path))return '';
 const toml=readFileSync(path,'utf8');
 const name=/^name\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
 const account=/^\s*account_id\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
 if(!name)return '';
 // Sem account_id no arquivo, o subdomínio workers.dev padrão é o do titular da conta.
 return account?`https://${name}.${account}.workers.dev`:`https://${name}.felipevieiraribeiro19.workers.dev`;
}

const args=parseArgs(process.argv.slice(2));
if(!args.url)args.url=urlFromWrangler();
if(args.help){
 console.log(readFileSync(new URL(import.meta.url),'utf8').split('*/')[0]);
 process.exit(0);
}
if(!args.url)fail('informe --url com o endereço do Worker de laboratório (não encontrei worker/wrangler.chat-lab.toml).');

let base;
try{base=new URL(args.url);}catch{fail('--url inválida.');}
if(base.protocol!=='https:'&&!LOCAL.test(base.origin))
 fail('use https (ou http apenas em 127.0.0.1/localhost para testes locais).');
if(base.pathname!=='/'||base.search||base.hash)fail('--url deve ser apenas a origem, sem caminho.');

const token=process.env.SIGMA_ID_TOKEN?.trim()||
 (args.tokenFile?readFileSync(args.tokenFile,'utf8').trim():'');
if(args.tokenFile&&!token)fail('arquivo de token vazio.');

const results=[];
const record=(name,ok,detail)=>{results.push({name,ok,detail});};

class NetworkFailure extends Error{}
async function call(path,init={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),args.timeout);
 const started=Date.now();
 try{
  const response=await fetch(base.origin+path,{...init,signal:controller.signal});
  const ms=Date.now()-started;
  const text=await response.text();
  let body=null;
  try{body=text?JSON.parse(text):null;}catch{body=null;}
  return {status:response.status,ms,body,headers:response.headers,raw:text};
 }catch(error){
  if(controller.signal.aborted)
   throw new NetworkFailure('sem resposta em '+args.timeout+' ms');
  throw new NetworkFailure('não foi possível conectar');
 }finally{clearTimeout(timer);}
}

// ---------- 1. Barreiras que não precisam de conta ----------
async function boundaryChecks(){
 const wrong=await call('/api/lab/chat',{
  method:'POST',headers:{Origin:'https://exemplo-invalido.web.app','Content-Type':'application/json'},
  body:JSON.stringify({messages:[{role:'user',text:'teste'}]})
 });
 record('origem não autorizada é recusada',wrong.status===403,
  'HTTP '+wrong.status+(wrong.status===403?'':' (esperado 403)'));

 const preflight=await call('/api/lab/chat',{method:'OPTIONS',headers:{Origin:args.origin}});
 record('preflight CORS responde 204',preflight.status===204,'HTTP '+preflight.status);

 const anonymous=await call('/api/lab/chat',{
  method:'POST',headers:{Origin:args.origin,'Content-Type':'application/json'},
  body:JSON.stringify({messages:[{role:'user',text:'teste'}]})
 });
 record('chamada sem token é recusada',anonymous.status===401||anonymous.status===403,
  'HTTP '+anonymous.status+' '+(anonymous.body?.error||''));

 const missing=await call('/api/lab/rota-inexistente',{headers:{Origin:args.origin}});
 record('rota desconhecida responde 404',missing.status===404,'HTTP '+missing.status);
}

// ---------- 2. Autenticado ----------
async function oauthStatus(){
 const auth={'Authorization':'Bearer '+token,Origin:args.origin};
 const status=await call('/api/lab/oauth/status',{headers:auth});
 if(status.status===503){
  record('cofre OAuth',false,'HTTP 503 — GOOGLE_OAUTH_ENABLED=false ou segredos ausentes');
  return false;
 }
 if(status.status!==200){
  record('cofre OAuth',false,'HTTP '+status.status+' '+(status.body?.error||''));
  return false;
 }
 const connections=status.body?.connections||{};
 const parts=Object.entries(connections).map(([preset,value])=>{
  const info=value||{};
  return preset+': '+(info.needsReauthorization?'precisa reconectar':info.connected?'conectado':'não conectado');
 });
 record('cofre OAuth responde',true,parts.join(' | ')||'sem presets');
 const calendar=connections.calendar||{};
 return calendar.connected===true;
}

async function chatCheck(){
 const payload={messages:[{role:'user',text:args.chat}]};
 const response=await call('/api/lab/chat',{
  method:'POST',
  headers:{Authorization:'Bearer '+token,Origin:args.origin,'Content-Type':'application/json'},
  body:JSON.stringify(payload)
 });
 if(response.status===401){
  record('chat',false,'HTTP 401 — token inválido ou expirado. Copie um token novo.');
  return null;
 }
 if(response.status<200||response.status>=300){
  record('chat',false,'HTTP '+response.status+' '+(response.body?.error||response.raw.slice(0,120)));
  return null;
 }
 const body=response.body||{};
 const provider=body.provider||'(não informado)';
 const length=typeof body.text==='string'?body.text.length:0;
 record('chat responde',length>0,
  provider+' · '+response.ms+' ms · '+length+' caracteres'+
  (body.toolProposalsDisabled?' · propostas de tarefa desligadas':''));
 return {provider,ms:response.ms,length,
  toolsDisabled:body.toolProposalsDisabled===true,
  usedMemory:body.memory?.consulted===true?body.memory.count:0};
}

async function integrationsCheck(){
 const response=await call('/api/lab/integrations/calendar',{
  headers:{Authorization:'Bearer '+token,Origin:args.origin}
 });
 if(response.status===503){
  record('integração calendar',false,'HTTP 503 — LAB_CONNECTORS_ENABLED=false');
  return;
 }
 if(response.status===200){
  const items=Array.isArray(response.body?.items)?response.body.items.length:0;
  record('integração calendar (via cofre, sem token de sessão)',true,items+' itens · '+response.ms+' ms');
  return;
 }
 record('integração calendar',false,'HTTP '+response.status+' '+(response.body?.error||''));
}

function report(summary){
 const failures=results.filter(r=>!r.ok);
 if(args.json){
  console.log(JSON.stringify({url:base.origin,ok:failures.length===0,checks:results,summary},null,2));
 }else{
  console.log('Teste de fumaça — '+base.origin);
  console.log('Origem usada: '+args.origin);
  console.log('Token: '+mask(token)+(token?'':' (nenhum: apenas barreiras)'));
  console.log('');
  const width=Math.max(...results.map(r=>r.name.length));
  for(const r of results){
   console.log((r.ok?'  ok  ':' FALHA ')+r.name.padEnd(width)+'  '+r.detail);
  }
  if(summary)console.log('\nProvedor em uso: '+summary.provider+
   ' | resposta em '+summary.ms+' ms'+
   (summary.usedMemory?' | '+summary.usedMemory+' memória(s) consultada(s)':''));
  console.log('\n'+(failures.length?failures.length+' verificação(ões) falharam':'todas as verificações passaram'));
 }
 process.exit(failures.length?1:0);
}

try{
 await boundaryChecks();
}catch(error){
 if(error instanceof NetworkFailure){
  console.error('ERRO: '+base.origin+' — '+error.message+'.');
  console.error('Confira se o Worker está publicado e se o endereço está correto.');
  process.exit(2);
 }
 throw error;
}
let summary=null;
if(token){
 try{
  const calendarConnected=await oauthStatus();
  summary=await chatCheck();
  if(calendarConnected)await integrationsCheck();
 }catch(error){
  if(error instanceof NetworkFailure){
   console.error('ERRO: conexão interrompida com '+base.origin+' — '+error.message+'.');
   process.exit(2);
  }
  throw error;
 }
}else if(!args.json){
 console.log('Sem token: apenas as barreiras foram verificadas. Para checar provedor e cofre,');
 console.log('passe --token-file com um ID token copiado do navegador.');
}
report(summary);
