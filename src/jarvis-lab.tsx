import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import type {User} from 'firebase/auth';
import {MemoryCenter} from './MemoryCenter';
import {SigmaHud} from './SigmaHud';
import {LabRealMemory} from './LabRealMemory';
import {JarvisChatPanel} from './JarvisChatPanel';
import {LabEcosystemPanel} from './LabEcosystemPanel';
import {LabIntegrationsPanel} from './LabIntegrationsPanel';
import {LabActionCenter} from './LabActionCenter';
import {LabDocumentsPanel} from './LabDocumentsPanel';
import {ActionReviewCenter} from './ActionReviewCenter';
import {buildReadOnlyActionPreview} from '../worker/src/core/review-api';
import type {ActionPreviewRequest,ActionPreviewResult} from './services';
import {prepareLabAuth,loginLab,logoutLab,readableLabAuthError,safeLabCspDiagnostic} from './jarvis-lab-auth';
import './jarvis-lab.css';

/**
 * ISOLATED BROWSER LAB:
 *  - Firebase Auth protects optional lab APIs; no implicit personal memory saves.
 *  - Every preview runs locally through deterministic validation with fake input.
 *  - The local action-preview demo never calls SIGMA production or Firestore.
 */
export function localFictionalPreview(request:ActionPreviewRequest):Promise<ActionPreviewResult>{
 const result=buildReadOnlyActionPreview(
  request,{googleConnected:false,searchConfigured:false},Date.now()
 );
 return Promise.resolve(result);
}

export function JarvisLab(){
 const beta=import.meta.env.VITE_SIGMA_BETA==='true';
 const openedAsFile=typeof window!=='undefined'&&window.location.protocol==='file:';
 const [user,setUser]=useState<User|null>(null);
 const [authReady,setAuthReady]=useState(false);
 const [authError,setAuthError]=useState('');
 const [authBrowserDiagnostic,setAuthBrowserDiagnostic]=useState('');
 const [loggingIn,setLoggingIn]=useState(false);
 const [showMemory,setShowMemory]=useState(false);
 const [showActions,setShowActions]=useState(false);
 const [googleReadToken,setGoogleReadToken]=useState<string|null>(null);
 useEffect(()=>{setGoogleReadToken(null);},[user?.uid]);
 useEffect(()=>{
  if(openedAsFile){setAuthReady(true);return;}
  let alive=true;let unsubscribe=()=>{};
  prepareLabAuth(u=>{if(alive){setUser(u);setAuthReady(true);}})
   .then(fn=>{if(alive)unsubscribe=fn;else fn();})
   .catch(e=>{if(alive){setAuthReady(true);setAuthError(readableLabAuthError(e));}});
  return ()=>{alive=false;unsubscribe();};
 },[openedAsFile]);
 useEffect(()=>{
  if(openedAsFile)return;
  const onViolation=(event:SecurityPolicyViolationEvent)=>{
   const publicDiagnostic=safeLabCspDiagnostic(event.violatedDirective,event.blockedURI);
   if(publicDiagnostic)setAuthBrowserDiagnostic(publicDiagnostic);
  };
  window.addEventListener('securitypolicyviolation',onViolation);
  return ()=>window.removeEventListener('securitypolicyviolation',onViolation);
 },[openedAsFile]);
 async function toggleLogin(){
  if(loggingIn)return;setAuthError('');setAuthBrowserDiagnostic('');setLoggingIn(true);
  try{if(user)await logoutLab();else await loginLab();}
  catch(e){setAuthError(readableLabAuthError(e));}
  finally{setLoggingIn(false);}
 }
 if(beta)return <SigmaHud user={user} authReady={authReady} loggingIn={loggingIn}
  onLogin={()=>{void toggleLogin();}} authError={authError} authBrowserDiagnostic={authBrowserDiagnostic}
  googleReadToken={googleReadToken} onGoogleReadToken={setGoogleReadToken}/>;
 return <div className="jarvis-lab">
  <header><span className="lab-symbol" aria-hidden="true">Σ</span><div><strong>SIGMA</strong><small>{beta?'ASSISTENTE PESSOAL · BETA':'LABORATÓRIO JARVIS · ISOLADO'}</small></div></header>
  <main>
   {!beta&&<div className="lab-warning" role="status"><strong>MODO DE TESTES — NÃO É O SIGMA PRINCIPAL</strong>
    <p>Ambiente separado do SIGMA principal. O chat não salva mensagens nem executa tarefas reais. Memórias só poderão ser guardadas quando o módulo opcional for habilitado e você autorizar cada registro.</p>
   </div>}
   <h1>{beta?'Seu assistente pessoal, todos os dias.':'Seu Jarvis, em construção.'}</h1>
   <p className="lab-lead">{beta?'Converse com o SIGMA, acompanhe projetos, estudos e tarefas. Versão Beta: o histórico deste chat ainda não é salvo automaticamente.':'Teste as futuras funções com segurança. Nenhum registro pessoal é necessário.'}</p>
   <section className="lab-panel" aria-label="Acesso ao SIGMA">
    <h2>{beta?'Acesso com Google':'1. Verificação de login Google'}</h2>
    <p>{beta?'Entre com sua conta Google para acessar os registros existentes do SIGMA. A sessão pode permanecer ativa entre visitas. O histórico desta conversa ainda não é salvo.':'O Google protege suas conversas e memórias do laboratório. Depois de entrar uma vez, o Firebase tenta manter a sessão nas próximas visitas, sem guardar mensagens do chat.'}</p>
    <p><strong>iPhone:</strong> use o Safari normal (não a navegação privada), fora do navegador interno do ChatGPT. Se limpar os dados do Safari ou usar outro navegador, poderá precisar entrar novamente.</p>
    <p><strong>Estado:</strong> {user?'Google conectado — sessão restaurável nas próximas visitas':authReady?'Sem sessão Google':'Restaurando sessão Google…'}</p>
    <button type="button" disabled={openedAsFile||!authReady||loggingIn} onClick={()=>{void toggleLogin();}}>
     {loggingIn?'Aguarde…':user?(beta?'Sair do SIGMA':'Sair do laboratório'):'Entrar com Google'}
    </button>
    {openedAsFile&&<p>Arquivo offline: login indisponível. Os exemplos de memória e tarefas continuam funcionando sem conexão.</p>}
    {authError&&<p className="lab-error" role="alert">{authError}</p>}
    {authBrowserDiagnostic&&<p className="lab-error" role="status">{authBrowserDiagnostic}</p>}
   </section>
   <section className="lab-panel" aria-label="Conversa experimental com inteligência artificial">
    <h2>{beta?'Conversa com o SIGMA':'2. Conversa com IA (experimental)'}</h2>
    <JarvisChatPanel user={user} googleToken={googleReadToken}/>
   </section>
   {!beta&&<section className="lab-panel" aria-label="Memória de demonstração">
    <h2>3. Memória controlada (simulação)</h2>
    <p>Aprovar, corrigir e excluir dados que não são seus e desaparecem ao recarregar a página.</p>
    <button type="button" aria-expanded={showMemory} onClick={()=>setShowMemory(v=>!v)}>
     {showMemory?'Fechar demonstração':'Abrir memória fictícia'}
    </button>
    {showMemory&&<MemoryCenter/>}
   </section>}
   <section className="lab-panel" aria-label="Memória pessoal experimental">
    <h2>{beta?'Memória pessoal':'4. Memória pessoal'}</h2>
    <p>Memórias controladas por você, armazenadas no ambiente SIGMA Beta. O histórico antigo do SIGMA principal ainda não foi importado.</p>
    <LabRealMemory user={user}/>
   </section>
   {!beta&&<section className="lab-panel" aria-label="Revisão de ações fictícias">
    <h2>5. Revisão de tarefas (simulação)</h2>
    <p>Verifique uma proposta de calendário ou arquivo fictício. A validação acontece no próprio navegador; execução sempre bloqueada.</p>
    <button type="button" aria-expanded={showActions} onClick={()=>setShowActions(v=>!v)}>
     {showActions?'Fechar revisão':'Abrir revisão fictícia'}
    </button>
    {showActions&&<ActionReviewCenter mode="offline" onPreview={localFictionalPreview}/>}
   </section>}
   <section className="lab-panel" aria-label="Gestão pessoal no SIGMA">
    <h2>{beta?'Gestão integrada — estudos, rotina, tarefas e finanças':'6. Gestão integrada — estudos, rotina, tarefas e finanças'}</h2>
    <LabEcosystemPanel user={user}/>
   </section>
   <section className="lab-panel" aria-label="Serviços Google e Notion">
    <h2>{beta?'Integrações — Google Calendar, Drive e Notion':'7. Integrações — Google Calendar, Drive e Notion'}</h2>
    <LabIntegrationsPanel user={user} googleToken={googleReadToken} onGoogleToken={setGoogleReadToken}/>
   </section>
   <section className="lab-panel" aria-label="Ações externas aprovadas">
    <h2>{beta?'Ações externas — revisão e confirmação':'8. Ações externas — revisão e confirmação'}</h2>
    <LabActionCenter user={user}/>
   </section>
   <section className="lab-panel" aria-label="Biblioteca inteligente de documentos">
    <h2>{beta?'Biblioteca de documentos':'9. Biblioteca de documentos — sincronizar e pesquisar'}</h2>
    <LabDocumentsPanel user={user}/>
   </section>
   <p className="lab-footer">{beta?'SIGMA Beta · Recursos em evolução. Registros confirmados permanecem no armazenamento da conta; o histórico de mensagens deste chat ainda não é persistido.':'As demonstrações permanecem fictícias. O módulo experimental de memória é opcional e não grava conversas automaticamente. Não utilize informações sensíveis nos testes.'}</p>
  </main>
 </div>;
}
createRoot(document.getElementById('root')!).render(<JarvisLab/>);
