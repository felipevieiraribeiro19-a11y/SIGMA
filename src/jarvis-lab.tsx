import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {User} from 'firebase/auth';
import {MemoryCenter} from './MemoryCenter';
import {ActionReviewCenter} from './ActionReviewCenter';
import {buildReadOnlyActionPreview} from '../worker/src/core/review-api';
import type {ActionPreviewRequest,ActionPreviewResult} from './services';
import {prepareLabAuth,loginLab,logoutLab,readableLabAuthError} from './jarvis-lab-auth';
import './jarvis-lab.css';

/**
 * ISOLATED BROWSER LAB:
 *  - Firebase Auth is optional and never used to read documents or chat history.
 *  - Every preview runs locally through deterministic validation with fake input.
 *  - No calls to SIGMA Worker, Gemini, Calendar, Drive or Firestore.
 */
export function localFictionalPreview(request:ActionPreviewRequest):Promise<ActionPreviewResult>{
 const result=buildReadOnlyActionPreview(
  request,{googleConnected:false,searchConfigured:false},Date.now()
 );
 return Promise.resolve(result);
}

export function JarvisLab(){
 const [user,setUser]=useState<User|null>(null);
 const [authReady,setAuthReady]=useState(false);
 const [authError,setAuthError]=useState('');
 const [loggingIn,setLoggingIn]=useState(false);
 const [showMemory,setShowMemory]=useState(false);
 const [showActions,setShowActions]=useState(false);
 useEffect(()=>{
  let alive=true;let unsubscribe=()=>{};
  prepareLabAuth(u=>{if(alive){setUser(u);setAuthReady(true);}})
   .then(fn=>{if(alive)unsubscribe=fn;else fn();})
   .catch(e=>{if(alive){setAuthReady(true);setAuthError(readableLabAuthError(e));}});
  return ()=>{alive=false;unsubscribe();};
 },[]);
 async function toggleLogin(){
  if(loggingIn)return;setAuthError('');setLoggingIn(true);
  try{if(user)await logoutLab();else await loginLab();}
  catch(e){setAuthError(readableLabAuthError(e));}
  finally{setLoggingIn(false);}
 }
 return <div className="jarvis-lab">
  <header><span className="lab-symbol" aria-hidden="true">Σ</span><div><strong>SIGMA</strong><small>LABORATÓRIO JARVIS · ISOLADO</small></div></header>
  <main>
   <div className="lab-warning" role="status"><strong>MODO DE TESTES — NÃO É O SIGMA PRINCIPAL</strong>
    <p>Somente exemplos fictícios. O laboratório não salva memórias, não envia mensagens à IA e não executa tarefas reais.</p>
   </div>
   <h1>Seu Jarvis, em construção.</h1>
   <p className="lab-lead">Teste as futuras funções com segurança. Nenhum registro pessoal é necessário.</p>
   <section className="lab-panel" aria-label="Login de testes">
    <h2>1. Verificação de login Google</h2>
    <p>O login é opcional. Serve apenas para testar a autenticação do navegador; não libera ferramentas nem consulta seus arquivos.</p>
    <p><strong>Estado:</strong> {user?'Google conectado para teste':authReady?'Sem sessão Google':'Preparando autenticação…'}</p>
    <button type="button" disabled={!authReady||loggingIn} onClick={()=>{void toggleLogin();}}>
     {loggingIn?'Aguarde…':user?'Sair do laboratório':'Testar login Google'}
    </button>
    {authError&&<p className="lab-error" role="alert">{authError}</p>}
   </section>
   <section className="lab-panel" aria-label="Memória de demonstração">
    <h2>2. Memória controlada (simulação)</h2>
    <p>Aprovar, corrigir e excluir dados que não são seus e desaparecem ao recarregar a página.</p>
    <button type="button" aria-expanded={showMemory} onClick={()=>setShowMemory(v=>!v)}>
     {showMemory?'Fechar demonstração':'Abrir memória fictícia'}
    </button>
    {showMemory&&<MemoryCenter/>}
   </section>
   <section className="lab-panel" aria-label="Revisão de ações fictícias">
    <h2>3. Revisão de tarefas (simulação)</h2>
    <p>Verifique uma proposta de calendário ou arquivo fictício. A validação acontece no próprio navegador; execução sempre bloqueada.</p>
    <button type="button" aria-expanded={showActions} onClick={()=>setShowActions(v=>!v)}>
     {showActions?'Fechar revisão':'Abrir revisão fictícia'}
    </button>
    {showActions&&<ActionReviewCenter mode="offline" onPreview={localFictionalPreview}/>}
   </section>
   <p className="lab-footer">Sem acesso a Gemini, Tavily, Google Drive, Calendar ou histórico Firebase. Não utilize para armazenar informações reais. Teste experimental em desenvolvimento.</p>
  </main>
 </div>;
}
createRoot(document.getElementById('root')!).render(<JarvisLab/>);
