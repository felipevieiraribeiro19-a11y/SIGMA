import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {User} from 'firebase/auth';
import {MemoryCenter} from './MemoryCenter';
import {JarvisChatPanel} from './JarvisChatPanel';
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
 const openedAsFile=typeof window!=='undefined'&&window.location.protocol==='file:';
 const [user,setUser]=useState<User|null>(null);
 const [authReady,setAuthReady]=useState(false);
 const [authError,setAuthError]=useState('');
 const [loggingIn,setLoggingIn]=useState(false);
 const [showMemory,setShowMemory]=useState(false);
 const [showActions,setShowActions]=useState(false);
 useEffect(()=>{
  if(openedAsFile){setAuthReady(true);return;}
  let alive=true;let unsubscribe=()=>{};
  prepareLabAuth(u=>{if(alive){setUser(u);setAuthReady(true);}})
   .then(fn=>{if(alive)unsubscribe=fn;else fn();})
   .catch(e=>{if(alive){setAuthReady(true);setAuthError(readableLabAuthError(e));}});
  return ()=>{alive=false;unsubscribe();};
 },[openedAsFile]);
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
    <p>Somente exemplos fictícios. O laboratório não salva memórias nem executa tarefas reais. A conversa com IA só funcionará depois da conexão isolada ser ativada.</p>
   </div>
   <h1>Seu Jarvis, em construção.</h1>
   <p className="lab-lead">Teste as futuras funções com segurança. Nenhum registro pessoal é necessário.</p>
   <section className="lab-panel" aria-label="Login de testes">
    <h2>1. Verificação de login Google</h2>
    <p>O login é opcional. Serve apenas para testar a autenticação do navegador; não libera ferramentas nem consulta seus arquivos.</p>
    <p>**iPhone:** abra este endereço no Safari, fora do navegador interno do ChatGPT, antes de testar o login Google. Se falhar, copie apenas o código de erro mostrado abaixo.</p>
    <p><strong>Estado:</strong> {user?'Google conectado para teste':authReady?'Sem sessão Google':'Preparando autenticação…'}</p>
    <button type="button" disabled={openedAsFile||!authReady||loggingIn} onClick={()=>{void toggleLogin();}}>
     {loggingIn?'Aguarde…':user?'Sair do laboratório':'Testar login Google'}
    </button>
    {openedAsFile&&<p>Arquivo offline: login indisponível. Os exemplos de memória e tarefas continuam funcionando sem conexão.</p>}
    {authError&&<p className="lab-error" role="alert">{authError}</p>}
   </section>
   <section className="lab-panel" aria-label="Conversa experimental com inteligência artificial">
    <h2>2. Conversa com IA (experimental)</h2>
    <JarvisChatPanel user={user}/>
   </section>
   <section className="lab-panel" aria-label="Memória de demonstração">
    <h2>3. Memória controlada (simulação)</h2>
    <p>Aprovar, corrigir e excluir dados que não são seus e desaparecem ao recarregar a página.</p>
    <button type="button" aria-expanded={showMemory} onClick={()=>setShowMemory(v=>!v)}>
     {showMemory?'Fechar demonstração':'Abrir memória fictícia'}
    </button>
    {showMemory&&<MemoryCenter/>}
   </section>
   <section className="lab-panel" aria-label="Revisão de ações fictícias">
    <h2>4. Revisão de tarefas (simulação)</h2>
    <p>Verifique uma proposta de calendário ou arquivo fictício. A validação acontece no próprio navegador; execução sempre bloqueada.</p>
    <button type="button" aria-expanded={showActions} onClick={()=>setShowActions(v=>!v)}>
     {showActions?'Fechar revisão':'Abrir revisão fictícia'}
    </button>
    {showActions&&<ActionReviewCenter mode="offline" onPreview={localFictionalPreview}/>}
   </section>
   <p className="lab-footer">As demonstrações de memória e ações são fictícias. O chat Gemini fica desligado até que um Worker exclusivo do laboratório seja configurado e validado. Não envie dados pessoais.</p>
  </main>
 </div>;
}
createRoot(document.getElementById('root')!).render(<JarvisLab/>);
