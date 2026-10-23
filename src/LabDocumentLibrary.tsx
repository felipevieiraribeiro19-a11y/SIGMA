import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {validLabApiBase} from './jarvis-chat-protocol';
const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
type Source='drive'|'notion';
type Row={externalId:string;title:string;mimeType:string;modifiedAt:string;url?:string;state:'available'|'missing'};
type Scan={id:string;page:number;scanned:number;startedAt:string};
type Summary={source:Source;count:number;missing:number;lastSyncedAt:string|null;
 lastDelta:{added:number;updated:number;missing:number;unchanged:number}|null;scan:Scan|null};
export function LabDocumentLibrary({user,googleToken}:{user:User|null;googleToken:string|null}){
 const [source,setSource]=useState<Source>('drive');
 const [sources,setSources]=useState<Summary[]>([]);
 const [items,setItems]=useState<Row[]>([]);
 const [query,setQuery]=useState('');
 const [includeMissing,setIncludeMissing]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const current=sources.find(x=>x.source===source);
 useEffect(()=>{
  setSources([]);setItems([]);setError('');setMessage('');
 },[user?.uid]);
 async function request(path:string,method='GET',data?:unknown){
  if(!user||!api)throw Error('Entre com Google no SIGMA.');
  const firebase=await user.getIdToken();
  const response=await fetch(api+'/api/lab/documents/'+path,{
   method,cache:'no-store',
   headers:{Authorization:'Bearer '+firebase,
    ...(data===undefined?{}:{'Content-Type':'application/json'}),
    ...(googleToken?{'X-Google-Token':googleToken}:{})},
   ...(data===undefined?{}:{body:JSON.stringify(data)})
  });
  const payload:any=await response.json().catch(()=>null);
  if(!response.ok)throw Error(payload?.error||'Não foi possível consultar a biblioteca.');
  return payload;
 }
 async function status(){
  if(busy)return;setBusy(true);setError('');
  try{const data=await request('status');setSources(data.sources||[]);setMessage('Estado do catálogo atualizado.');}
  catch(e){setError(e instanceof Error?e.message:'Falha na consulta.');}
  finally{setBusy(false);}
 }
 async function list(){
  if(busy)return;setBusy(true);setError('');
  try{
   const q=new URLSearchParams({source,q:query,missing:String(includeMissing)});
   const data=await request('list?'+q);
   setItems(Array.isArray(data.items)?data.items:[]);
   setMessage('Documentos carregados: '+(data.items?.length||0)+'.');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao pesquisar.');}
  finally{setBusy(false);}
 }
 async function sync(action:'start'|'continue'|'cancel'){
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{
   if(source==='drive'&&!googleToken&&action!=='cancel')
    throw Error('Primeiro conecte a leitura do Google Drive na seção de integrações.');
   const body={source,action,...(action==='start'?{}:{scanId:current?.scan?.id})};
   const result=await request('sync','POST',body);
   const data=await request('status');
   setSources(data.sources||[]);
   if(action==='cancel')setMessage('Varredura cancelada; documentos anteriores preservados.');
   else if(result.completed){
    const d=result.delta;
    setMessage('Índice atualizado: '+d.added+' novos, '+d.updated+' alterados, '+
     d.missing+' ausentes. Nenhum arquivo remoto foi excluído.');
   }else setMessage('Página concluída. '+result.scan?.scanned+
     ' registros lidos; continue para processar a próxima página.');
  }catch(e){setError(e instanceof Error?e.message:'Erro na sincronização.');}
  finally{setBusy(false);}
 }
 return <div className="lab-documents">
  <p>Biblioteca experimental de <strong>metadados</strong>: identifica documentos novos, modificados e ausentes. Não baixa PDFs, não lê o conteúdo e não altera seus arquivos externos.</p>
  <label>Origem dos documentos
   <select value={source} onChange={e=>{setSource(e.target.value as Source);setItems([]);setMessage('');}}>
    <option value="drive">Google Drive</option><option value="notion">Notion</option>
   </select>
  </label>
  <button type="button" disabled={!user||busy} onClick={()=>void status()}>Atualizar situação da biblioteca</button>
  <p><strong>Indexados:</strong> {current?.count??'—'} · <strong>Ausentes:</strong> {current?.missing??'—'}</p>
  {current?.lastSyncedAt&&<p>Última varredura completa: {new Date(current.lastSyncedAt).toLocaleString('pt-BR')}</p>}
  {current?.lastDelta&&<p>Últimas diferenças: {current.lastDelta.added} novos, {current.lastDelta.updated} alterados, {current.lastDelta.missing} ausentes.</p>}
  {current?.scan?<div>
   <p>Varredura em andamento: página {current.scan.page+1}, {current.scan.scanned} metadados reunidos.</p>
   <button type="button" disabled={!user||busy} onClick={()=>void sync('continue')}>Continuar varredura</button>
   <button type="button" disabled={!user||busy} onClick={()=>void sync('cancel')}>Cancelar sem alterar índice</button>
  </div>:<button type="button" disabled={!user||busy||source==='drive'&&!googleToken}
    onClick={()=>void sync('start')}>Iniciar varredura de {source==='drive'?'Drive':'Notion'}</button>}
  {source==='drive'&&!googleToken&&<p>Para indexar o Drive, conceda permissão de leitura na seção 7. O token não será salvo no catálogo.</p>}
  <div className="lab-doc-search">
   <label>Pesquisar por nome ou tipo
    <input maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: Contabilidade, PDF, orçamento"/>
   </label>
   <label><input type="checkbox" checked={includeMissing} onChange={e=>setIncludeMissing(e.target.checked)}/> Incluir registros que não apareceram na última varredura</label>
   <button type="button" disabled={!user||busy} onClick={()=>void list()}>Buscar no índice</button>
  </div>
  {message&&<p role="status">{message}</p>}
  {error&&<p role="alert" className="lab-error">{error}</p>}
  {items.length>0&&<ul className="lab-doc-list">{items.map(x=><li key={x.externalId}>
   <strong>{x.title}</strong><small> {x.mimeType}</small>
   <p>{x.state==='missing'?'Ausente da última varredura':'Disponível'}{x.modifiedAt?' · '+x.modifiedAt:''}</p>
   {x.url&&<a href={x.url} target="_blank" rel="noopener noreferrer">Abrir no serviço</a>}
  </li>)}</ul>}
 </div>;
}
