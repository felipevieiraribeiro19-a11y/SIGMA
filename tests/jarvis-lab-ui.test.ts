import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildReadOnlyActionPreview} from '../worker/src/core/review-api';
import {REVIEW_DEMOS} from '../src/ActionReviewCenter';

test('laboratório usa somente Auth e exemplos fictícios; sem gravação pessoal',()=>{
 const lab=readFileSync('src/jarvis-lab.tsx','utf8');
 const auth=readFileSync('src/jarvis-lab-auth.ts','utf8');
 const sample=lab+'\n'+auth;
 assert.match(lab,/MemoryCenter/);
 assert.match(lab,/ActionReviewCenter/);
 assert.match(lab,/localFictionalPreview/);
 assert.match(lab,/location\.protocol==='file:'/);
 assert.match(lab,/disabled=\{openedAsFile\|\|!authReady\|\|loggingIn\}/);
 assert.match(lab,/executa tarefas reais|execução sempre bloqueada/);
 assert.match(auth,/browserSessionPersistence/);
 assert.match(auth,/signInWithPopup/);
 assert.doesNotMatch(sample,/\b(getFirestore|setDoc|addDoc|deleteDoc|updateDoc|verifyDatabase|sendChat|loadHistory|X-Google-Token)\b/);
 assert.doesNotMatch(sample,/workers\.dev|sigma-cerebro|\bfetch\s*\(/i);
 assert.doesNotMatch(sample,/\b(localStorage|indexedDB|sessionStorage)\b/);
});

test('demonstração offline continua negativa quanto à persistência e execução',()=>{
 for(const sample of REVIEW_DEMOS){
  const result=buildReadOnlyActionPreview({utterance:sample.utterance,params:sample.params},{
   googleConnected:false,searchConfigured:false
  },Date.parse('2026-10-21T15:00:00Z'));
  assert.equal(result.preview.status,'ready-for-review');
  assert.equal(result.authorizedForExecution,false);
  assert.equal(result.persisted,false);
  assert.equal(result.preview.executionEnabled,false);
 }
});

test('configuração de hosting é dedicada à página isolada, sem DB e sem backend',()=>{
 const settings=JSON.parse(readFileSync('firebase.lab.json','utf8')) as any;
 assert.equal(settings.hosting.public,'dist-jarvis-lab');
 assert.equal(settings.firestore,undefined);
 assert.equal(settings.functions,undefined);
 assert.equal(settings.hosting.rewrites.length,1);
 assert.equal(settings.hosting.rewrites[0].destination,'/index.html');
 const vite=readFileSync('vite.lab.config.ts','utf8');
 assert.match(vite,/publicDir:false/);
 assert.match(vite,/jarvis-lab\.html/);
 assert.match(vite,/dist-jarvis-lab/);
 const workflow=readFileSync('.github/workflows/sigma-jarvis-lab-build.yml','utf8');
 assert.doesNotMatch(workflow,/firebase-tools|wrangler deploy|hosting:channel:deploy|workload_identity_provider/);
 const manual=readFileSync('.github/workflows/sigma-jarvis-lab-preview-manual.yml','utf8');
 assert.match(manual,/workflow_dispatch:/);
 assert.doesNotMatch(manual,/^  (push|pull_request):/m);
 assert.match(manual,/PUBLICAR-APENAS-LAB/);
 assert.match(manual,/hosting:channel:deploy jarvis-lab/);
 assert.match(manual,/--config firebase\.lab\.json/);
 assert.match(manual,/sigma-github-deploy@sigma-61328\.iam\.gserviceaccount\.com/);
});

test('HTML offline é gerado sem publicar e com bloqueio de login local',()=>{
 const generator=readFileSync('scripts/build-jarvis-offline.mjs','utf8');
 const workflow=readFileSync('.github/workflows/sigma-jarvis-lab-build.yml','utf8');
 assert.match(generator,/SIGMA_Jarvis_Demonstracao_Offline\.html/);
 assert.match(generator,/Arquivo offline: login indisponível/);
 assert.match(generator,/Detalhes validados localmente/);
 assert.match(generator,/Confirmar execução \(indisponível\)/);
 assert.match(workflow,/node scripts\/build-jarvis-offline\.mjs/);
 assert.match(workflow,/sigma-jarvis-lab-html-unico/);
 assert.doesNotMatch(workflow,/hosting:channel:deploy|firebase-tools|wrangler deploy/);
});

test('interface mantém execução de ações indisponível mesmo no laboratório',()=>{
 const panel=readFileSync('src/ActionReviewCenter.tsx','utf8');
 assert.match(panel,/Confirmar execução \(indisponível\)/);
 assert.match(panel,/disabled title="Execução bloqueada/);
 assert.match(panel,/mode==='offline'/);
 assert.match(panel,/Detalhes validados localmente/);
 assert.match(panel,/Detalhes validados pelo backend/);
 const lab=readFileSync('src/jarvis-lab.tsx','utf8');
 assert.match(lab,/mode="offline"/);
});
