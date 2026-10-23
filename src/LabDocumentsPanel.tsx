import {useEffect,useState} from 'react';
import type {User} from 'firebase/auth';
import {connectLabDocumentGoogle} from './jarvis-lab-auth';
import {validLabApiBase} from './jarvis-chat-protocol';
const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
type Source='drive'|'notion';
type DocumentRow={key:string;source:Source;title:string;updatedAt:string;url:string;contentStatus:'indexed'|'metadata-only';textLength:number};
type SearchHit={key:string;source:Source;title:string;url:string;excerpt:string;score:number;contentStatus:'indexed'|'metadata-only'};
type Changes={added:number;updated:number;unchanged:number;removed:number;total:number};
export function LabDocumentsPanel({user}:{user:User|null}){
 const [source,setSource]=useState<Source>('drive');
 const [googleToken,setGoogleToken]=useState<string|null>(null);
 const [contentPermission,setContentPermission]=useState(false);
 const [includeContent,setIncludeContent]=useState(false);
 const [rows,setRows]=useState<DocumentRow[]>([]);
 const [query,setQuery]=useState('');
 const [hits,setHits]=useState<SearchHit[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setGoogleToken(null);setContentPermission(false);setIncludeContent(false);setRows([]);setHits([]);setError('');},[user?.uid]);
 async function access(readContent:boolean){
  if(!user||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const token=await connectLabDocumentGoogle(readContent);
   setGoogleToken(token);setContentPermission(readContent);setIncludeContent(readContent);
   setNotice(readContent?'Leitura de documentos Google autorizada nesta sessão.':'Consulta de metadados Google autorizada nesta sessão.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível autorizar o Google.');}
  finally{setBusy(false);}
 }
 async function call(path:string,method='GET',body?:unknown,token?:string|null):Promise<any>{
  if(!user||!api)throw Error('Entre com Google e abra o laboratório publicado.');
  const identity=await user.getIdToken();
  const r=await fetch(api+'/api/lab/documents'+path,{
   method,cache:'no-store',headers:{Authorization:'Bearer '+identity,
    ...(body===undefined?{}:{'Content-Type':'application/json'}),
    ...(token?{'X-Google-Token':token}:{})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const response:any=await r.json().catch(()=>null);
  if(!r.ok)throw Error(response?.error||'Não foi possível acessar o índice.');
  return response;
 }
 async function refresh(){
  if(busy)return;
  setBusy(true);setError('');
  try{
   const result=await call('');
   setRows(Array.isArray(result.documents)?result.documents:[]);
  }catch(e){setError(e instanceof Error?e.message:'Falha na consulta.');}
  finally{setBusy(false);}
 }
 async function sync(){
  if(busy||!user)return;
  if(source==='drive'&&!googleToken){setError('Autorize o Google Drive antes de sincronizar.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const result:{changes:Changes}=await call('/sync','POST',
    {source,includeContent:includeContent&&(source==='notion'||contentPermission)},
    source==='drive'?googleToken:null);
   const list=await call('');
   setRows(Array.isArray(list.documents)?list.documents:[]);
   setHits([]);
   const c=result.changes;
   setNotice('Índice atualizado: '+c.added+' novos, '+c.updated+' modificados, '+c.removed+
    ' removidos do índice, '+c.unchanged+' sem alteração. Os arquivos originais não foram modificados.');
  }catch(e){setError(e instanceof Error?e.message:'Sincronização indisponível.');}
  finally{setBusy(false);}
 }
 async function search(){
  if(busy||!query.trim())return;
  setBusy(true);setError('');
  try{
   const response=await call('/search?q='+encodeURIComponent(query));
   setHits(Array.isArray(response.results)?response.results:[]);
   setNotice('Pesquisa no índice local concluída: '+(response.results?.length||0)+' resultado(s).');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao pesquisar.');}
  finally{setBusy(false);}
 }
 async function clear(){
  if(!window.confirm('Apagar somente as informações indexadas de '+source+'? Os documentos originais permanecerão intactos.'))return;
  if(busy)return;
  setBusy(true);setError('');
  try{
   const r=await call('?source='+source+'&confirm=APAGAR-INDICE-LOCAL','DELETE');
   const current=await call('');
   setRows(current.documents||[]);setHits([]);
   setNotice('Removidos '+r.removed+' registros do índice do SIGMA. Nada foi apagado no '+source+'.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível limpar o índice.');}
  finally{setBusy(false);}
 }
 const indexed=rows.filter(x=>x.contentStatus==='indexed').length;
 return <div className="lab-documents">
  <p>Sincronização <strong>sob seu comando</strong>: o SIGMA detecta arquivos novos, alterados e ausentes, indexa títulos e pode guardar trechos de texto para pesquisa. Não modifica arquivos nas suas contas.</p>
  <p>Os textos indexados permanecem em um banco isolado do Cloudflare LAB até você apagá-los. Limite de 180 documentos; a atualização é cancelada quando a listagem não está completa.</p>
  <div className="lab-workspace-stats">
   <span>Documentos no índice: <strong>{rows.length}</strong></span>
   <span>Com conteúdo textual: <strong>{indexed}</strong></span>
  </div>
  <button type="button" disabled={busy||!user} onClick={()=>void refresh()}>Carregar índice salvo</button>
  <div className="lab-workspace-form">
   <label>Origem dos documentos
    <select value={source} disabled={busy} onChange={e=>{setSource(e.target.value as Source);setIncludeContent(false);}}>
     <option value="drive">Google Drive</option><option value="notion">Notion</option>
    </select>
   </label>
   {source==='drive'&&<>
    <button type="button" disabled={!user||busy} onClick={()=>void access(false)}>
     Autorizar apenas nomes, datas e tipos do Drive
    </button>
    <button type="button" disabled={!user||busy} onClick={()=>void access(true)}>
     Autorizar leitura de conteúdo de arquivos do Drive
    </button>
    <small>A segunda autorização é mais ampla. Permite ler arquivos acessíveis, mas o SIGMA processa no máximo oito documentos de texto por sincronização. PDFs ficam apenas com metadados nesta etapa.</small>
   </>}
   {source==='notion'&&<small>O Notion usa o segredo configurado no Worker. Somente páginas compartilhadas com a integração serão consultadas.</small>}
   <label className="lab-documents-check">
    <input type="checkbox" checked={includeContent} disabled={busy||source==='drive'&&!contentPermission}
     onChange={e=>setIncludeContent(e.target.checked)}/>
    Incluir até oito textos curtos disponíveis, além dos metadados
   </label>
   <button type="button" disabled={busy||!user||(source==='drive'&&!googleToken)} onClick={()=>void sync()}>
    Sincronizar {source==='drive'?'Drive':'Notion'} agora
   </button>
   <button type="button" disabled={busy||!user} onClick={()=>void clear()}>
    Apagar somente este índice local
   </button>
  </div>
  <div className="lab-workspace-form">
   <label>Pesquisar documentos indexados
    <input value={query} maxLength={180} onChange={e=>setQuery(e.target.value)}
     onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search();}}}
     placeholder="Ex.: Contabilidade, orçamento, reunião"/>
   </label>
   <button type="button" disabled={busy||!user||!query.trim()} onClick={()=>void search()}>Pesquisar</button>
  </div>
  {notice&&<p role="status">{notice}</p>}
  {error&&<p className="lab-error" role="alert">{error}</p>}
  {hits.length>0&&<div><h3>Resultados da busca</h3>
   <ul className="lab-workspace-list">{hits.map(hit=><li key={hit.key}>
    <strong>{hit.title}</strong><small>{hit.source==='drive'?'Google Drive':'Notion'} · {hit.contentStatus==='indexed'?'Trecho indexado':'Somente metadados'}</small>
    <p>{hit.excerpt}</p>{hit.url&&<a href={hit.url} target="_blank" rel="noopener noreferrer">Abrir original</a>}
   </li>)}</ul></div>}
  {rows.length>0&&<div><h3>Biblioteca indexada</h3>
   <ul className="lab-workspace-list">{rows.slice(0,100).map(doc=><li key={doc.key}>
    <strong>{doc.title}</strong>
    <small>{doc.source==='drive'?'Drive':'Notion'} · {doc.contentStatus==='indexed'?'Texto disponível':'Metadados'} · {new Date(doc.updatedAt).toLocaleDateString('pt-BR')}</small>
    {doc.url&&<a href={doc.url} target="_blank" rel="noopener noreferrer">Abrir original</a>}
   </li>)}</ul>
  </div>}
 </div>;
}
