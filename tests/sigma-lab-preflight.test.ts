import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectLabConfig,inspectLabBundle,LAB_WORKER,LAB_ORIGIN} from '../scripts/sigma-lab-preflight.mjs';

const read=(file:string)=>readFileSync(file,'utf8');
const original=()=>({
 worker:read('worker/wrangler.chat-lab.toml'),
 hosting:read('firebase.lab.json'),
 vite:read('vite.lab.config.ts'),
 workflow:read('.github/workflows/sigma-lab-consolidado-ci.yml')
});

test('pré-voo: Worker, Firebase, CSP e CI fazem referência apenas ao laboratório',()=>{
 const check=inspectLabConfig(original());
 assert.equal(check.worker,LAB_WORKER);
 assert.equal(check.origin,LAB_ORIGIN);
 assert.equal(check.flags,'off');
});

test('pré-voo bloqueia habilitar IA, ações externas e OAuth por engano',()=>{
 const p=original();
 for(const flag of ['LAB_BRAIN_ENABLED','LAB_WORKSPACE_ENABLED','LAB_ACTIONS_ENABLED','GOOGLE_OAUTH_ENABLED']){
  const altered={...p,worker:p.worker.replace(flag+' = "false"',flag+' = "true"')};
  assert.throws(()=>inspectLabConfig(altered),new RegExp(flag));
 }
});
test('pré-voo bloqueia CSP fora de sincronia e destinos de produção',()=>{
 const p=original();
 assert.throws(()=>inspectLabConfig({...p,hosting:p.hosting.replace(LAB_WORKER,'https://unknown.invalid')}));
 assert.throws(()=>inspectLabConfig({...p,hosting:p.hosting.replace('dist-jarvis-lab','dist')}));
 assert.throws(()=>inspectLabConfig({...p,worker:p.worker.replace(LAB_ORIGIN,'https://sigma-61328.web.app')}));
});
test('pré-voo não permite que CI integrado publique ou leia secrets',()=>{
 const p=original();
 assert.throws(()=>inspectLabConfig({...p,workflow:p.workflow+'\nrun: wrangler deploy'}));
 assert.throws(()=>inspectLabConfig({...p,workflow:p.workflow+'\nrun: firebase-tools hosting:channel:deploy'}));
 assert.throws(()=>inspectLabConfig({...p,workflow:p.workflow+'\nvalue: secrets.FIREBASE_KEY'}));
 assert.throws(()=>inspectLabConfig({...p,workflow:p.workflow+'\nid-token: write'}));
});
test('pacote: verifica endpoint LAB sem exigir credenciais nem tocar na nuvem',()=>{
 const root=mkdtempSync(join(tmpdir(),'sigma-preflight-'));
 try{
  mkdirSync(join(root,'assets'));
  writeFileSync(join(root,'index.html'),'<html>LAB</html>');
  writeFileSync(join(root,'assets','bundle.js'),'var api="'+LAB_WORKER+'";');
  assert.deepEqual(inspectLabBundle(root),{files:2,jsFiles:1,labApiConfigured:true});
  writeFileSync(join(root,'assets','bundle.js'),'var api="https://unknown.invalid";');
  assert.throws(()=>inspectLabBundle(root),/Bundle de teste não aponta/);
  writeFileSync(join(root,'assets','bundle.js'),
   'var api="'+LAB_WORKER+'";var old="sigma-cerebro.felipevieiraribeiro19.workers.dev";');
  assert.throws(()=>inspectLabBundle(root),/produção/);
  writeFileSync(join(root,'assets','bundle.js'),'var api="'+LAB_WORKER+'";');
  writeFileSync(join(root,'config.json'),'{"url":"production"}');
  assert.throws(()=>inspectLabBundle(root),/config.json/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
