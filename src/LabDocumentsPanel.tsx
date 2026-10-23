import {useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {connectLabDocumentGoogle} from './jarvis-lab-auth';
import {validLabApiBase} from './jarvis-chat-protocol';
const api=validLabApiBase(import.meta.env.VITE_JARVIS_LAB_API);
type Source='drive'|'notion';
type DocumentRow={key:string;source:Source;title:string;updatedAt:string;url:string;contentStatus:'indexed'|'metadata-only';textLength:number};
type SearchHit={key:string;source:Source;title:string;url:string;excerpt:string;score:number;contentStatus:'indexed'|'metadata-only'};
type Changes={added:number;updated:number;unchanged:number;removed:number;total:number};
type Scan={id:string;source:Source;page:number;scanned:number;includeContent:boolean};
type ScanResult={completed:boolean;scan:Scan|null;changes?:Changes|null};
export function LabDocumentsPanel({user}:{user:User|null}){
 const [source,setSource]=useState<Source>('drive');
 const [googleToken,setGoogleToken]=useState<string|null>(null);
 const [contentPermission,setContentPermission]=useState(false);
 const [includeContent,setIncludeContent]=useState(false);
 const [rows,setRows]=useState<DocumentRow[]>([]);
 const [query,setQuery]=useState('');
 const [hits,setHits]=useState<SearchHit[]>([]);
 const [busy,setBusy]=useState(false);
 const [oauthConnections,setOAuthConnections]=useState<Record<string,{connected?:boolean;needsReauthorization?:boolean}>>({});
 const [scan,setScan]=useState<Scan|null>(null);
 const cancelRequested=useRef(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setGoogleToken(null);setContentPermission(false);setIncludeContent(false);setRows([]);setHits([]);setScan(null);setError('');},[user?.uid]);
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
 async function oauthRequest(path:string,body?:unknown):Promise<any>{
  if(!user||!api)throw Error('Entre no laboratório publicado com sua conta Google.');
  const idToken=await user.getIdToken();
  const response=await fetch(api+'/api/lab/oauth/'+path,{
   method:body===undefined?'GET':'POST',cache:'no-store',
   headers:{Authorization:'Bearer '+idToken,...(body===undefined?{}:{'Content-Type':'application/json'})},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const data:any=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.error||'Conexão permanente Google indisponível.');
  return data;
 }
 async function oauthStatus(){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const data=await oauthRequest('status');
   setOAuthConnections(data.connections||{});
   setNotice('Estado da conexão permanente consultado. Nenhum token é exibido.');
  }catch(e){setError(e instanceof Error?e.message:'OAuth indisponível.');}
  finally{setBusy(false);}
 }
 async function oauthConnect(preset:'calendar'|'drive_metadata'|'drive_content'){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const data:{authorizationUrl?:string}=await oauthRequest('start',{preset});
   if(!data.authorizationUrl||new URL(data.authorizationUrl).origin!=='https://accounts.google.com')
    throw Error('URL de autorização recusada.');
   // Same-tab redirect is compatible with Safari on iPhone.
   window.location.assign(data.authorizationUrl);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível iniciar autorização.');setBusy(false);}
 }
 async function oauthDisconnect(preset:'calendar'|'drive_metadata'|'drive_content'){
  if(!window.confirm('Apagar a autorização Google armazenada pelo SIGMA para esta permissão?'))return;
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   await oauthRequest('disconnect',{preset});
   const data=await oauthRequest('status');
   setOAuthConnections(data.connections||{});
   setNotice('Credencial excluída do SIGMA. Para revogar também no Google, use sua Conta Google → Apps de terceiros.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível desconectar.');}
  finally{setBusy(false);}
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
 async function updateCatalog(){
  const list=await call('');
  setRows(Array.isArray(list.documents)?list.documents:[]);
  setHits([]);
 }
 async function continuePages(id:string){
  cancelRequested.current=false;
  // At most 20 requests; each step fetches one remote provider page.
  for(let step=0;step<20;step++){
   if(cancelRequested.current){
    await call('/sync','POST',{source,action:'cancel',scanId:id});
    setScan(null);setNotice('Sincronização cancelada. Índice anterior preservado.');
    return;
   }
   const result:ScanResult=await call('/sync','POST',
    {source,action:'continue',scanId:id},source==='drive'?googleToken:null);
   setScan(result.scan);
   if(result.completed){
    await updateCatalog();
    const c=result.changes;
    setNotice(c?'Índice atualizado: '+c.added+' novos, '+c.updated+' alterados, '+c.removed+
     ' removidos do índice e '+c.unchanged+' sem alteração. Documentos originais intactos.':
     'Sincronização concluída.');
    return;
   }
   setNotice('Sincronização em etapas: '+(result.scan?.scanned||0)+' documentos verificados. O índice anterior continua disponível.');
  }
  throw Error('Limite de páginas desta sessão atingido. Índice anterior preservado.');
 }
 async function sync(){
  if(busy||!user)return;
  if(source==='drive'&&!googleToken){setError('Autorize o Google Drive antes de sincronizar.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const started:ScanResult=await call('/sync','POST',
    {source,action:'start',includeContent:includeContent&&(source==='notion'||contentPermission)},
    source==='drive'?googleToken:null);
   if(!started.scan)throw Error('Não foi possível iniciar a sincronização.');
   setScan(started.scan);
   await continuePages(started.scan.id);
  }catch(e){setError(e instanceof Error?e.message:'Sincronização interrompida. Use Retomar.');}
  finally{setBusy(false);}
 }
 async function resume(){
  if(busy||!user)return;
  if(source==='drive'&&!googleToken){setError('Reautorize o Google Drive para continuar.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const current:{scan:Scan|null}=await call('/scan?source='+source);
   setScan(current.scan);
   if(!current.scan)throw Error('Não há sincronização ativa desta origem.');
   await continuePages(current.scan.id);
  }catch(e){setError(e instanceof Error?e.message:'Falha ao retomar.');}
  finally{setBusy(false);}
 }
 async function cancel(){
  if(busy){cancelRequested.current=true;setNotice('Cancelamento solicitado: aguardando a página atual terminar.');return;}
  setBusy(true);setError('');
  try{
   const current:{scan:Scan|null}=await call('/scan?source='+source);
   if(current.scan){
    await call('/sync','POST',{source,action:'cancel',scanId:current.scan.id});
    setNotice('Sincronização cancelada; índice anterior preservado.');
   }else setNotice('Nenhuma sincronização ativa.');
   setScan(null);
  }catch(e){setError(e instanceof Error?e.message:'Falha ao cancelar.');}
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
   setRows(current.documents||[]);setHits([]);setScan(null);
   setNotice('Removidos '+r.removed+' registros do índice do SIGMA. Nada foi apagado no '+source+'.');
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível limpar o índice.');}
  finally{setBusy(false);}
 }
 const indexed=rows.filter(x=>x.contentStatus==='indexed').length;
 return <div className="lab-documents">
  <p>Sincronização <strong>sob seu comando</strong>: o SIGMA detecta arquivos novos, alterados e ausentes, indexa títulos e pode guardar trechos de texto para pesquisa. Não modifica arquivos nas suas contas.</p>
  <p>Os textos indexados permanecem em um banco isolado do Cloudflare LAB até você apagá-los. Até 1.000 documentos por origem, em etapas de no máximo 100 arquivos por consulta. O índice anterior só muda quando todas as páginas são verificadas.</p>
  <div className="lab-workspace-form">
   <h3>Conexão Google permanente — laboratório</h3>
   <p>OAuth com renovação segura: os refresh tokens ficam criptografados no Cloudflare e nunca são entregues ao navegador. A conexão precisa ser configurada pelo proprietário no Google Cloud antes de funcionar. Ela ainda não substitui as autorizações temporárias das integrações acima.</p>
   <button type="button" disabled={busy||!user} onClick={()=>void oauthStatus()}>Consultar conexões permanentes</button>
   {(['calendar','drive_metadata','drive_content'] as const).map(preset=><div key={preset}>
    <small>{preset==='calendar'?'Agenda (leitura)':preset==='drive_metadata'?'Drive (nomes e datas)':'Drive (leitura de conteúdo)'}: {oauthConnections[preset]?.needsReauthorization?'Precisa reconectar':oauthConnections[preset]?.connected?'Conectado':'Não conectado'}</small>
    <button type="button" disabled={busy||!user} onClick={()=>void oauthConnect(preset)}>Conectar permissão</button>
    {oauthConnections[preset]?.connected&&<button type="button" disabled={busy||!user} onClick={()=>void oauthDisconnect(preset)}>Desconectar localmente</button>}
   </div>)}
  </div>
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
   {scan&&scan.source===source&&<p role="status">Sincronização iniciada: {scan.scanned} documentos em {scan.page} página(s). Os dados anteriores estão preservados.</p>}
   <button type="button" disabled={busy||!user||(source==='drive'&&!googleToken)} onClick={()=>void resume()}>
    Retomar sincronização desta origem
   </button>
   <button type="button" disabled={!user} onClick={()=>void cancel()}>
    {busy?'Solicitar cancelamento após página atual':'Cancelar sincronização pendente'}
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
