import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import type {User} from 'firebase/auth';
import {Activity,BookOpen,CalendarDays,CheckSquare,ChevronRight,Database,FolderOpen,Home,LogIn,LogOut,Menu,MessageCircle,RefreshCw,Settings2,ShieldCheck,Wallet,Wifi, X} from 'lucide-react';
import {JarvisChatPanel} from './JarvisChatPanel';
import {LabEcosystemPanel} from './LabEcosystemPanel';
import {LabIntegrationsPanel} from './LabIntegrationsPanel';
import {LabActionCenter} from './LabActionCenter';
import {LabDocumentsPanel} from './LabDocumentsPanel';
import {LabRealMemory} from './LabRealMemory';
import {validLabApiBase} from './jarvis-chat-protocol';
import './sigma-hud.css';
import {SigmaHome} from './SigmaHome';

type Page='home'|'chat'|'study'|'projects'|'tasks'|'agenda'|'finance'|'library'|'integrations'|'settings';
type Briefing={
 date:string;studyMinutesToday:number;openTasks:number;overdueTasks:number;dueToday:number;dueNext7Days:number;
 financeNetToday:number;tasksCompletedToday:number;
 highlightedTasks:{id:string;title:string;dueDate:string|null;priority:string;group:string}[];
 studyPerformance:{today:{questionsTotal:number;accuracyPercent:number|null};overall:{questionsTotal:number;accuracyPercent:number|null};subjects:{subject:string;questionsTotal:number;accuracyPercent:number|null}[]};
};
type Project={id:string;title:string;status:string;tasksOpen:number;recordCount:number};
const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
const nav: {id:Page;label:string;icon:typeof Home}[]=[
 {id:'home',label:'Início',icon:Home},{id:'chat',label:'Conversa',icon:MessageCircle},
 {id:'study',label:'Estudos',icon:BookOpen},{id:'projects',label:'Projetos',icon:FolderOpen},
 {id:'tasks',label:'Tarefas',icon:CheckSquare},{id:'agenda',label:'Agenda',icon:CalendarDays},
 {id:'finance',label:'Finanças',icon:Wallet},{id:'library',label:'Biblioteca',icon:Database},
 {id:'integrations',label:'Integrações',icon:Wifi},{id:'settings',label:'Configurações',icon:Settings2}
];
const mobileNav:Page[]=['home','study','tasks','agenda','settings'];
function formatMoney(value:number){return value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function formatMinutes(value:number){return value>=60?`${Math.floor(value/60)}h ${String(value%60).padStart(2,'0')}min`:`${value} min`;}
function safeNumber(value:unknown){return typeof value==='number'&&Number.isFinite(value)?value:null;}
function Panel({title,children,action}:{title:string;children:ReactNode;action?:React.ReactNode}){
 return <section className="sigma-hud-panel"><div className="sigma-panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function SigmaHud({user,authReady,loggingIn,onLogin,authError,authBrowserDiagnostic,googleReadToken,onGoogleReadToken}:{
 user:User|null;authReady:boolean;loggingIn:boolean;onLogin:()=>void;authError:string;authBrowserDiagnostic:string;
 googleReadToken:string|null;onGoogleReadToken:(value:string|null)=>void;
}){
 const [page,setPage]=useState<Page>('home');
 const [homeMessage,setHomeMessage]=useState<string|null>(null);
 const [menuOpen,setMenuOpen]=useState(false);
 const [briefing,setBriefing]=useState<Briefing|null>(null);
 const [projects,setProjects]=useState<Project[]>([]);
 const [loading,setLoading]=useState(false);
 const [loadError,setLoadError]=useState('');
 const [lastUpdated,setLastUpdated]=useState<Date|null>(null);
 const loadVersion=useRef(0);
 const load=useCallback(async()=>{
  const version=++loadVersion.current;
  if(!user||!api){setBriefing(null);setProjects([]);setLastUpdated(null);setLoading(false);return;}
  setBriefing(null);setProjects([]);setLoading(true);setLoadError('');
  try{
   const token=await user.getIdToken();
   const headers={Authorization:'Bearer '+token};
   const [b,p]=await Promise.all([
    fetch(api+'/api/lab/workspace/briefing',{headers,cache:'no-store'}),
    fetch(api+'/api/lab/workspace/projects',{headers,cache:'no-store'})
   ]);
   if(!b.ok||!p.ok)throw Error('Não foi possível carregar os dados da sua conta.');
   const bData:unknown=await b.json(),pData:unknown=await p.json();
   if(!bData||typeof bData!=='object'||typeof (bData as Briefing).date!=='string')throw Error('Resumo recebido em formato inesperado.');
   if(version!==loadVersion.current)return;
   setBriefing(bData as Briefing);
   setProjects(Array.isArray((pData as {projects?:unknown})?.projects)?(pData as {projects:Project[]}).projects:[]);
   setLastUpdated(new Date());
  }catch(e){if(version===loadVersion.current){setLoadError(e instanceof Error?e.message:'Dados indisponíveis.');setBriefing(null);setProjects([]);}}
  finally{if(version===loadVersion.current)setLoading(false);}
 },[user]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(page==='home'&&user)void load();},[page,user?.uid]);
 function navigate(id:Page){setPage(id);setMenuOpen(false);window.scrollTo?.({top:0,behavior:'auto'});}
 const today=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full'}).format(new Date());
 const name=user?.displayName?.trim().split(/\s+/)[0]||'';
 const completed=briefing?briefing.tasksCompletedToday:null;
 const pageTitle=nav.find(n=>n.id===page)?.label||'SIGMA';
 return <div className={'sigma-hud'+(page==='home'?' sigma-home-mode':'')}>
  <aside className={`sigma-hud-sidebar ${menuOpen?'is-open':''}`} aria-label="Navegação principal">
   <div className="sigma-hud-brand"><span className="sigma-hud-mark" aria-hidden="true"/><div><strong>SIGMA</strong><small>SISTEMA INTELIGENTE DE GESTÃO</small></div><button className="sigma-menu-close" type="button" onClick={()=>setMenuOpen(false)} aria-label="Fechar menu"><X size={20}/></button></div>
   <nav>{nav.map(item=><button type="button" key={item.id} className={page===item.id?'active':''} aria-current={page===item.id?'page':undefined} onClick={()=>navigate(item.id)}><item.icon size={19}/><span>{item.label}</span></button>)}</nav>
   <div className="sigma-sidebar-foot"><span className={user?'sigma-online':'sigma-offline'}/>{user?'Conta conectada':'Aguardando login'}<small>SIGMA Beta · interface HUD</small></div>
  </aside>
  {menuOpen&&<button className="sigma-menu-backdrop" aria-label="Fechar menu" type="button" onClick={()=>setMenuOpen(false)}/>}
  <div className="sigma-hud-content">
   <header className="sigma-hud-topbar">
    <button type="button" className="sigma-menu-open" aria-label="Abrir menu" onClick={()=>setMenuOpen(true)}><Menu size={23}/></button>
    <div className="sigma-hud-mobile-brand">SIGMA</div>
    <span className="sigma-hud-top-title">{page==='home'?'CENTRAL DE COMANDO':pageTitle.toUpperCase()}</span>
    <div className="sigma-hud-top-right"><span className="sigma-hud-clock">{new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date())}</span><button type="button" className="sigma-profile" onClick={()=>navigate('settings')} aria-label="Conta e configurações"><Settings2 size={20}/></button></div>
   </header>
   {!authReady&&<div className="sigma-hud-notice" role="status">Restaurando sua sessão Google…</div>}
   {authReady&&!user&&<section className="sigma-login-card"><ShieldCheck size={26}/><h1>Ativar central SIGMA</h1><p>Entre com sua conta Google para acessar os registros reais de estudos, tarefas e projetos.</p><button type="button" disabled={loggingIn} onClick={onLogin}><LogIn size={18}/>{loggingIn?'Conectando…':'Entrar com Google'}</button></section>}
   {authError&&<p role="alert" className="sigma-hud-notice sigma-hud-error">{authError}</p>}
   {authBrowserDiagnostic&&<p role="status" className="sigma-hud-notice sigma-hud-error">{authBrowserDiagnostic}</p>}
   <main>
    {page==='home'&&<SigmaHome user={user} onMenu={()=>setMenuOpen(true)} onNavigate={navigate} onLogin={onLogin} onSend={text=>{setHomeMessage(text);navigate('chat');}}/>}
    <section className="sigma-hud-page" hidden={page!=='chat'}><div className="sigma-hud-page-heading"><h1>Conversa com SIGMA</h1><p>Seu assistente pessoal, com controle sobre memórias e ações.</p></div><div className="sigma-hud-module"><JarvisChatPanel user={user} googleToken={googleReadToken} incomingText={homeMessage} onIncomingConsumed={()=>setHomeMessage(null)}/></div></section>
    {(['study','projects','tasks','finance'] as Page[]).includes(page)&&<section className="sigma-hud-page"><div className="sigma-hud-page-heading"><h1>{pageTitle}</h1><p>{page==='study'?'Seu desempenho, registros e ciclos de estudo.':page==='projects'?'Organize seus objetivos e acompanhe o progresso.':page==='tasks'?'Gerencie tarefas, prazos e prioridades.':'Acompanhe os lançamentos registrados no SIGMA.'}</p></div><div className="sigma-hud-module"><LabEcosystemPanel key={page} user={user} view={page as 'study'|'projects'|'tasks'|'finance'}/></div></section>}
    {page==='agenda'&&<section className="sigma-hud-page"><div className="sigma-hud-page-heading"><h1>Agenda</h1><p>Conecte sua agenda Google para consultar compromissos reais. O SIGMA não inventa eventos.</p></div><div className="sigma-hud-module"><LabIntegrationsPanel user={user} googleToken={googleReadToken} onGoogleToken={onGoogleReadToken}/></div></section>}
    {page==='library'&&<section className="sigma-hud-page"><div className="sigma-hud-page-heading"><h1>Biblioteca</h1><p>Seus documentos e fontes de consulta.</p></div><div className="sigma-hud-module"><LabDocumentsPanel user={user}/></div></section>}
    {page==='integrations'&&<section className="sigma-hud-page"><div className="sigma-hud-page-heading"><h1>Integrações</h1><p>Permissões e conexões externas sob seu controle.</p></div><div className="sigma-hud-module"><LabIntegrationsPanel user={user} googleToken={googleReadToken} onGoogleToken={onGoogleReadToken}/><LabActionCenter user={user}/></div></section>}
    {page==='settings'&&<section className="sigma-hud-page"><div className="sigma-hud-page-heading"><h1>Configurações</h1><p>Conta, privacidade e memória pessoal.</p></div><div className="sigma-hud-module"><div className="sigma-hud-account"><ShieldCheck size={22}/><div><strong>{user?.displayName||'Conta Google'}</strong><p>{user?.email||'Você ainda não entrou.'}</p></div><button type="button" disabled={!authReady||loggingIn} onClick={onLogin}>{user?<LogOut size={16}/>:<LogIn size={16}/>} {user?'Sair':'Entrar'}</button></div><LabRealMemory user={user}/></div></section>}
   </main>
  </div>
  <nav className="sigma-hud-mobile-nav" aria-label="Navegação móvel">{mobileNav.map(id=>{const item=nav.find(x=>x.id===id)!;return <button type="button" key={id} className={page===id?'active':''} aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}><item.icon size={20}/><span>{id==='settings'?'Mais':item.label}</span></button>;})}</nav>
 </div>;
}
