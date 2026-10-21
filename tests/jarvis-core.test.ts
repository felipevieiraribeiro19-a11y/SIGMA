import test from 'node:test';
import assert from 'node:assert/strict';
import {listCapabilities,findCapability} from '../worker/src/core/capabilities';
import {authorizeOperation} from '../worker/src/core/authorization';
import {SIGMA_IDENTITY} from '../worker/src/core/identity';
import {makeWorker,type Env} from '../worker/src/index';

const disconnected={searchConfigured:false,googleConnected:false};

test('o Jarvis não define concurso ou finanças como centro do produto',()=>{
 assert.match(SIGMA_IDENTITY,/assistente pessoal geral/);
 assert.match(SIGMA_IDENTITY,/Nenhum assunto é seu foco obrigatório/);
 assert.match(SIGMA_IDENTITY,/NÃO deve afirmar que registrou/);
});

test('capacidades existentes, experimentais e futuras são declaradas sem fingir implementação',()=>{
 const list=listCapabilities(disconnected);
 assert.ok(list.length>=12);
 assert.equal(findCapability('research.web',disconnected)?.status,'not-configured');
 assert.equal(findCapability('integration.calendar.read',disconnected)?.status,'not-configured');
 assert.equal(findCapability('memory.profile',disconnected)?.status,'planned');
 assert.equal(findCapability('agency.proactive',disconnected)?.status,'planned');
 assert.equal(findCapability('integration.calendar.write',disconnected)?.risk,'external-side-effect');
 assert.equal(new Set(list.map(c=>c.id)).size,list.length);
});

test('search e Google ficam disponíveis somente após configuração / autorização',()=>{
 assert.equal(findCapability('research.web',{searchConfigured:true,googleConnected:false})?.status,'available');
 assert.equal(findCapability('integration.calendar.read',{searchConfigured:false,googleConnected:true})?.status,'preview');
 assert.equal(findCapability('integration.drive.list',{searchConfigured:false,googleConnected:true})?.status,'preview');
});

test('não há ações de escrita: nem com confirmação prematura',()=>{
 for(const id of ['integration.calendar.write','integration.drive.write','agency.actions','agency.proactive','memory.profile']){
  const result=authorizeOperation({capabilityId:id,ownerAuthenticated:true,oauthGranted:true,confirmed:true},{searchConfigured:true,googleConnected:true});
  assert.equal(result.allowed,false,id);
 }
});
test('nenhuma ferramenta funciona sem autenticação do dono',()=>{
 for(const id of listCapabilities({searchConfigured:true,googleConnected:true}).map(x=>x.id)){
  const result=authorizeOperation({capabilityId:id,ownerAuthenticated:false,oauthGranted:true,confirmed:true},{searchConfigured:true,googleConnected:true});
  assert.equal(result.reason,'not-authenticated');
 }
});
test('leitura do Google requer OAuth e ferramentas desconhecidas são bloqueadas',()=>{
 assert.equal(authorizeOperation({capabilityId:'integration.calendar.read',ownerAuthenticated:true,oauthGranted:false,confirmed:false},{searchConfigured:true,googleConnected:true}).reason,'needs-oauth');
 assert.equal(authorizeOperation({capabilityId:'integration.calendar.read',ownerAuthenticated:true,oauthGranted:true,confirmed:false},{searchConfigured:true,googleConnected:true}).reason,'ok');
 assert.equal(authorizeOperation({capabilityId:'integration.drive.list',ownerAuthenticated:true,oauthGranted:true,confirmed:false},{searchConfigured:true,googleConnected:true}).allowed,true);
 assert.equal(authorizeOperation({capabilityId:'arbitrary.exec',ownerAuthenticated:true,oauthGranted:true,confirmed:true},{searchConfigured:true,googleConnected:true}).reason,'unknown-capability');
});

test('catálogo autenticado reflete capacidades, sem ativar escritas',async()=>{
 const origin='https://sigma.example';
 const env={ALLOWED_ORIGINS:origin,ALLOWED_UID:'owner',FIREBASE_PROJECT_ID:'sigma-test',GEMINI_MODEL:'model-test',GEMINI_API_KEY:'fake',TAVILY_API_KEY:'test-only',QUOTA:{}} as unknown as Env;
 const w=makeWorker({verify:async()=> 'owner',memory:{recent:async()=>[],save:async()=>{assert.fail('não deve gravar')}},fetch:async()=>{assert.fail('não deve consultar provedores')}}); 
 const req=new Request('https://api.example/api/capabilities',{headers:{Origin:origin,Authorization:'Bearer fake'}});
 const res=await w.fetch(req,env);
 assert.equal(res.status,200);
 const body=await res.json() as {capabilities:Array<{id:string;status:string}>;writesEnabled:boolean};
 assert.equal(body.writesEnabled,false);
 assert.equal(body.capabilities.find(c=>c.id==='research.web')?.status,'available');
 assert.equal(body.capabilities.find(c=>c.id==='integration.drive.write')?.status,'planned');
});
test('catálogo não pode ser consultado sem uma origem autorizada',async()=>{
 const env={ALLOWED_ORIGINS:'https://sigma.example',ALLOWED_UID:'owner',FIREBASE_PROJECT_ID:'sigma-test',GEMINI_MODEL:'model-test',GEMINI_API_KEY:'fake',QUOTA:{}} as unknown as Env;
 const w=makeWorker({verify:async()=>{assert.fail('não deve autenticar')}}); 
 const req=new Request('https://api.example/api/capabilities',{headers:{Origin:'https://other.example',Authorization:'Bearer fake'}});
 const res=await w.fetch(req,env);
 assert.equal(res.status,403);
});
