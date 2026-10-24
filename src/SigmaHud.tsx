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
function Orb(){return <div className="sigma-orb-scene" aria-label="Núcleo holográfico do SIGMA, elemento visual">
 <div className="sigma-orb-outer"/><div className="sigma-orb-scan"/><div className="sigma-orb-ring sigma-orb-ring-one"/>
 <div className="sigma-orb-ring sigma-orb-ring-two"/><div className="sigma-orb-core"><div className="sigma-orb-glint"/></div>
 <div className="sigma-orb-platform"/><span className="sigma-orb-beam"/>
 </div>;}
function Panel({title,children,action}:{title:string;children:ReactNode;action?:React.ReactNode}){
 return <section className="sigma-hud-panel"><div className="sigma-panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function SigmaHud({user,authReady,loggingIn,onLogin,authError,authBrowserDiagnostic,googleReadToken,onGoogleReadToken}:{
 user:User|null;authReady:boolean;loggingIn:boolean;onLogin:()=>void;authError:string;authBrowserDiagnostic:string;
 googleReadToken:string|null;onGoogleReadToken:(value:string|null)=>void;
}){
 const [page,setPage]=useState<Page>('home');
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
 return <div className="sigma-hud">
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
    {page==='home'&&<div className="sigma-hud-home">
     <div className="sigma-hud-hero">
      <div className="sigma-hud-hero-left">
       <p className="sigma-hud-eyebrow">CENTRAL PESSOAL <span>•</span> {today}</p>
       <h1>{user?`Olá, ${name}.`:'Olá.'}</h1><p>Como posso ajudar você hoje?</p>
       <div className="sigma-hud-quick">
        <button type="button" onClick={()=>navigate('chat')}>Conversar com SIGMA <ChevronRight size={16}/></button>
        <button type="button" onClick={()=>navigate('study')}>Planejar estudos <ChevronRight size={16}/></button>
        <button type="button" onClick={()=>navigate('tasks')}>Minhas tarefas <ChevronRight size={16}/></button>
        <button type="button" onClick={()=>navigate('integrations')}>Pesquisar e integrar <ChevronRight size={16}/></button>
       </div>
      </div>
      <Orb/>
      <div className="sigma-hud-hero-right">
       <Panel title="TAREFAS EM FOCO" action={<button type="button" className="sigma-text-button" onClick={()=>navigate('tasks')}>Ver todas <ChevronRight size={14}/></button>}>
        {!user?<p>Entre para consultar suas tarefas.</p>:loading&&!briefing?<p>Consultando tarefas…</p>:briefing?<><div className="sigma-hud-hero-stat"><strong>{briefing.openTasks}</strong> abertas <span>· {briefing.dueToday} para hoje</span></div>{briefing.highlightedTasks.length>0?<ul className="sigma-hud-task-list">{briefing.highlightedTasks.slice(0,4).map(t=><li key={t.id}><CheckSquare size={16}/><span>{t.title}</span><small>{t.dueDate?t.dueDate.split('-').reverse().join('/'):''}</small></li>)}</ul>:<p>Sem tarefas destacadas no momento.</p>}</>:<p>Resumo indisponível.</p>}
       </Panel>
       <Panel title="AGENDA"><p>Seus compromissos do Google Calendar podem ser consultados em Integrações, após autorização.</p><button className="sigma-text-button" type="button" onClick={()=>navigate('agenda')}>Abrir agenda <ChevronRight size={14}/></button></Panel>
      </div>
     </div>
     <div className="sigma-hud-metrics">
      <button type="button" onClick={()=>navigate('study')}><BookOpen size={21}/><span>ESTUDOS HOJE</span><strong>{briefing?formatMinutes(briefing.studyMinutesToday):'—'}</strong><small>{briefing?'Tempo registrado':'Sem dados carregados'}</small></button>
      <button type="button" onClick={()=>navigate('study')}><Activity size={21}/><span>QUESTÕES HOJE</span><strong>{briefing?briefing.studyPerformance.today.questionsTotal:'—'}</strong><small>{briefing?(briefing.studyPerformance.today.accuracyPercent===null?'Sem taxa de acerto':briefing.studyPerformance.today.accuracyPercent+'% de acerto'):'Sem dados carregados'}</small></button>
      <button type="button" onClick={()=>navigate('projects')}><FolderOpen size={21}/><span>PROJETOS</span><strong>{user?projects.filter(p=>p.status==='active').length:'—'}</strong><small>Ativos na sua conta</small></button>
      <button type="button" onClick={()=>navigate('tasks')}><CheckSquare size={21}/><span>TAREFAS ABERTAS</span><strong>{briefing?briefing.openTasks:'—'}</strong><small>{completed===null?'Aguardando dados':`${completed} concluídas hoje`}</small></button>
      <button type="button" onClick={()=>navigate('finance')}><Wallet size={21}/><span>REGISTROS FINANCEIROS</span><strong>{briefing?formatMoney(briefing.financeNetToday):'—'}</strong><small>Saldo dos lançamentos de hoje</small></button>
     </div>
     <div className="sigma-hud-lower">
      <Panel title="RESUMO DO DIA" action={<button type="button" className="sigma-text-button" disabled={loading||!user} onClick={()=>void load()}><RefreshCw size={14}/>{loading?'Atualizando…':'Atualizar'}</button>}>
       {loadError&&<p role="alert" className="sigma-hud-error">{loadError}</p>}
       {!user?<p>Entre com Google para carregar seu resumo.</p>:briefing?<div className="sigma-hud-summary"><div><span>Estudos</span><strong>{formatMinutes(briefing.studyMinutesToday)}</strong></div><div><span>Questões</span><strong>{briefing.studyPerformance.today.questionsTotal}</strong></div><div><span>Concluídas hoje</span><strong>{briefing.tasksCompletedToday}</strong></div><div><span>Próximos 7 dias</span><strong>{briefing.dueNext7Days}</strong></div></div>:<p>{loading?'Carregando dados…':'Resumo ainda não disponível.'}</p>}
       {lastUpdated&&<small>Atualizado às {lastUpdated.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · Dados reais do SIGMA</small>}
      </Panel>
      <Panel title="DESEMPENHO EM QUESTÕES">{briefing?.studyPerformance.subjects?.length?<div className="sigma-hud-subjects">{briefing.studyPerformance.subjects.slice(0,5).map(s=><div key={s.subject}><span>{s.subject}</span><div className="sigma-hud-progress"><i style={{width:`${Math.max(0,Math.min(100,s.accuracyPercent??0))}%`}}/></div><strong>{s.accuracyPercent===null?'—':s.accuracyPercent+'%'}</strong></div>)}</div>:<p>Registre questões por matéria para visualizar seu desempenho.</p>}</Panel>
      <Panel title="PROJETOS ATIVOS">{projects.filter(p=>p.status==='active').length?<ul className="sigma-hud-projects">{projects.filter(p=>p.status==='active').slice(0,4).map(p=><li key={p.id}><FolderOpen size={16}/><span>{p.title}</span><small>{p.tasksOpen} tarefas abertas</small></li>)}</ul>:<p>Nenhum projeto ativo carregado.</p>}<button type="button" className="sigma-text-button" onClick={()=>navigate('projects')}>Gerenciar projetos <ChevronRight size={14}/></button></Panel>
     </div>
     <p className="sigma-hud-footnote">Os números são consultados na sua conta, nunca simulados. O histórico desta conversa ainda não é salvo automaticamente.</p>
    </div>}
    <section className="sigma-hud-page" hidden={page!=='chat'}><div className="sigma-hud-page-heading"><h1>Conversa com SIGMA</h1><p>Seu assistente pessoal, com controle sobre memórias e ações.</p></div><div className="sigma-hud-module"><JarvisChatPanel user={user} googleToken={googleReadToken}/></div></section>
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
