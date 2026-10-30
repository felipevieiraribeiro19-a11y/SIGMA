import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildReadOnlyActionPreview} from '../worker/src/core/review-api';
import {REVIEW_DEMOS} from '../src/ActionReviewCenter';
import {readableLabAuthError,classifyLabAuthInternalError,safeLabCspDiagnostic} from '../src/jarvis-lab-auth';

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
 assert.match(auth,/initializeAuth/);
 assert.match(auth,/browserLocalPersistence/);
 assert.match(auth,/browserSessionPersistence/);
 assert.match(auth,/inMemoryPersistence/);
 assert.match(auth,/persistence:\s*\[browserLocalPersistence,browserSessionPersistence,inMemoryPersistence\]/);
 assert.match(auth,/onAuthStateChanged\(instance,onUser\)/);
 assert.doesNotMatch(auth,/prompt:'select_account'/);
 assert.doesNotMatch(auth,/\bgetAuth\(/);
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
});

test('HTML offline é gerado sem publicar e com bloqueio de login local',()=>{
 const generator=readFileSync('scripts/build-jarvis-offline.mjs','utf8');
 assert.match(generator,/SIGMA_Jarvis_Demonstracao_Offline\.html/);
 assert.match(generator,/Arquivo offline: login indisponível/);
 assert.match(generator,/Detalhes validados localmente/);
 assert.match(generator,/Confirmar execução \(indisponível\)/);
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

test('erros de login apresentam somente códigos públicos e orientam Safari',()=>{
 assert.match(readableLabAuthError({code:'auth/internal-error'}),/auth\/internal-error.*Diagnóstico/);
 assert.match(readableLabAuthError({code:'auth/unauthorized-domain'}),/Firebase Authentication.*auth\/unauthorized-domain/);
 assert.match(readableLabAuthError({code:'auth/popup-blocked'}),/Safari.*auth\/popup-blocked/);
 assert.match(readableLabAuthError({code:'auth/web-storage-unsupported'}),/Safari.*auth\/web-storage-unsupported/);
 assert.match(readableLabAuthError({code:'auth/network-request-failed'}),/Safari.*auth\/network-request-failed/);
 assert.equal(readableLabAuthError({code:'auth/secreto?token=ABCD'}).includes('ABCD'),false);
 assert.equal(readableLabAuthError({message:'sensitive email example@secret.com'}).includes('example@secret.com'),false);
});

test('diagnóstico de auth/internal-error mostra somente categorias públicas',()=>{
 const issue={code:'auth/internal-error',
  message:'Invalid IdP response/credential: https://example.invalid/handler?code=SECRET_VALUE'};
 const message=readableLabAuthError(issue);
 assert.match(message,/Retorno do provedor Google inválido/);
 assert.doesNotMatch(message,/SECRET_VALUE|example\\.invalid/);
 assert.match(classifyLabAuthInternalError({customData:{originalError:{message:'Database is closing'}}}),/Armazenamento do Safari/);
 assert.match(classifyLabAuthInternalError({message:'redirect_uri_mismatch'}),/URI de retorno OAuth/);
 assert.match(classifyLabAuthInternalError({message:'no useful details'}),/Causa interna ainda não identificada/);
});

test('CSP do lab permite OAuth Google/Firebase somente em origens explicitamente declaradas',()=>{
 const cfg=JSON.parse(readFileSync('firebase.lab.json','utf8'));
 const csp=cfg.hosting.headers[0].headers.find((x:{key:string})=>x.key==='Content-Security-Policy')?.value;
 assert.equal(typeof csp,'string');
 assert.match(csp,/default-src 'none'/);
 assert.match(csp,/script-src [^;]*https:\/\/apis\.google\.com/);
 assert.match(csp,/connect-src [^;]*https:\/\/accounts\.google\.com/);
 assert.match(csp,/connect-src [^;]*https:\/\/www\.googleapis\.com/);
 assert.match(csp,/connect-src [^;]*https:\/\/sigma-61328\.firebaseapp\.com/);
 assert.match(csp,/frame-src [^;]*https:\/\/sigma-61328\.firebaseapp\.com/);
 assert.doesNotMatch(csp,/\*\.google|https:\/\/\*\.workers\.dev/);
 assert.match(csp,/form-action 'none'/);
});

test('mensagens de bloqueio CSP removem parâmetros, tokens e domínios não reconhecidos',()=>{
 const safe=safeLabCspDiagnostic('connect-src','https://accounts.google.com/o/oauth2?code=SECRET_TOKEN');
 assert.match(safe,/connect-src.*accounts\.google\.com/);
 assert.doesNotMatch(safe,/SECRET_TOKEN|\/o\/oauth2/);
 const unknown=safeLabCspDiagnostic('script-src','https://unauthorized.example.com/?state=SECRET');
 assert.equal(unknown.includes('SECRET'),false);
 assert.equal(unknown.includes('unauthorized.example.com'),false);
 assert.match(unknown,/recurso externo/);
 assert.equal(safeLabCspDiagnostic('report-uri','https://accounts.google.com?token=secret'), '');
});

test('auth mantém sessão do Google apenas com Firebase, sem guardar chat ou memória no navegador',()=>{
 const auth=readFileSync('src/jarvis-lab-auth.ts','utf8');
 const lab=readFileSync('src/jarvis-lab.tsx','utf8');
 assert.match(auth,/persistence:\s*\[browserLocalPersistence,browserSessionPersistence,inMemoryPersistence\]/);
 assert.match(auth,/onAuthStateChanged\(instance,onUser\)/);
 assert.match(auth,/signOut\(auth\)/);
 assert.doesNotMatch(auth,/setDoc|saveChat|localStorage\.setItem|sessionStorage\.setItem/);
 assert.match(lab,/não a navegação privada/);
 assert.match(lab,/Restaurando sessão Google/);
 assert.match(lab,/Google conectado/);
});
