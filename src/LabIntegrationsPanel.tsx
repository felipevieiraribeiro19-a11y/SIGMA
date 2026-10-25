import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {connectLabGoogleRead} from './jarvis-lab-auth';
import {validLabApiBase} from './jarvis-chat-protocol';
const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
type Provider='calendar'|'drive'|'notion'|'tasks';
type Item={id:string;title:string;detail:string;url?:string};
export function LabIntegrationsPanel({user,googleToken,onGoogleToken}:{
 user:User|null;googleToken:string|null;onGoogleToken:(value:string|null)=>void
}){
 const [results,setResults]=useState<Partial<Record<Provider,Item[]>>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 const [notionPageId,setNotionPageId]=useState('');
 useEffect(()=>{setResults({});setError('');setInfo('');},[user?.uid]);
 async function connect(){
  if(busy||!user)return;
  setBusy(true);setError('');setInfo('');
  try{const token=await connectLabGoogleRead();onGoogleToken(token);
   setInfo('Permissões de leitura recebidas. O token Google fica apenas nesta sessão do navegador.');}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível conectar Google.');}
  finally{setBusy(false);}
 }
 async function check(provider:Provider){
  if(busy||!user||!api)return;
  setBusy(true);setError('');setInfo('');
  try{
   const url=api+'/api/lab/integrations/'+provider+
    (provider==='notion'&&notionPageId.trim()?'?pageId='+encodeURIComponent(notionPageId.trim()):'');
   const firebase=await user.getIdToken();
   const res=await fetch(url,{headers:{Authorization:'Bearer '+firebase,
    ...(provider==='notion'||!googleToken?{}:{'X-Google-Token':googleToken})},cache:'no-store'});
   const body:any=await res.json().catch(()=>null);
   if(!res.ok)throw Error(body?.error||'Integração indisponível.');
   setResults(old=>({...old,[provider]:body.items||[]}));
   setInfo('Consulta de '+provider+' concluída. Somente leitura.');
  }catch(e){setError(e instanceof Error?e.message:'Falha na consulta.');}
  finally{setBusy(false);}
 }
 return <div className="lab-integrations">
  <p>Conecte os serviços que deseja consultar. Para criar eventos, tarefas ou notas, faça o pedido na conversa e confirme a proposta.</p>
  <div className="lab-integration-card">
   <strong>Google Agenda, Tarefas e Drive</strong>
   <p>Escopos mínimos: consultar eventos e metadados de arquivos. Para gravar, autorize separadamente a proposta na conversa.</p>
   <button type="button" disabled={!user||busy} onClick={()=>void connect()}>{googleToken?'Renovar conexão Google':'Conectar leitura Google'}</button>
   <button type="button" disabled={!user||busy||!googleToken} onClick={()=>void check('calendar')}>Consultar próximos eventos</button>
   <button type="button" disabled={!user||busy||!googleToken} onClick={()=>void check('tasks')}>Consultar tarefas Google</button>
   <button type="button" disabled={!user||busy||!googleToken} onClick={()=>void check('drive')}>Localizar arquivos recentes</button>
  </div>
  <div className="lab-integration-card">
   <strong>Notion</strong>
   <p>Busca as páginas que você compartilhar com a integração do SIGMA. Se o serviço informar que não está configurado, ainda falta conectar a integração Notion ao SIGMA.</p>
   <button type="button" disabled={!user||busy} onClick={()=>void check('notion')}>Buscar páginas compartilhadas</button>
   <label>ID de página para ler blocos (opcional)<input placeholder="UUID da página do Notion" value={notionPageId} onChange={e=>setNotionPageId(e.target.value)} /></label>
   <button type="button" disabled={!user||busy||!notionPageId.trim()} onClick={()=>void check('notion')}>Ler blocos dessa página</button>
  </div>
  {info&&<p role="status">{info}</p>}
  {error&&<p className="lab-error" role="alert">{error}</p>}
  {(['calendar','drive','notion','tasks'] as Provider[]).map(p=>
   results[p]&&<section key={p} aria-label={'Resultados de '+p}>
    <h3>{p} — {results[p]!.length} resultado(s)</h3>
    <ul>{results[p]!.map(row=><li key={row.id}>
     <strong>{row.title}</strong><small> {row.detail}</small>
     {row.url&&<a href={row.url} target="_blank" rel="noopener noreferrer">Abrir no serviço</a>}
    </li>)}</ul>
   </section>)}
 </div>;
}
