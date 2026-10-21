import {useState} from 'react';
import type {ActionPreviewResult,ActionPreviewRequest} from './services';

/**
 * Read-only UX review for fictional examples only.
 * No free-text personal details, no OAuth access, no confirm/execute handler.
 */
export const REVIEW_DEMOS=[
 {id:'calendar',name:'Criar evento (fictício)',
  utterance:'Agende um evento no calendário',
  params:{kind:'calendar.create',calendarId:'primary',title:'Evento fictício do SIGMA',
   startsAt:'2030-09-01T14:00:00-03:00',endsAt:'2030-09-01T15:00:00-03:00'}},
 {id:'drive',name:'Renomear arquivo (fictício)',
  utterance:'Renomeie um arquivo no Google Drive',
  params:{kind:'drive.rename',fileId:'fictional_file_001',newName:'Exemplo SIGMA.pdf'}}
] as const;

export function ActionReviewCenter({onPreview,mode='remote'}:{onPreview?:(request:ActionPreviewRequest)=>Promise<ActionPreviewResult>;mode?:'remote'|'offline'}){
 const [chosen,setChosen]=useState<'calendar'|'drive'>('calendar');
 const [pending,setPending]=useState(false);
 const [result,setResult]=useState<ActionPreviewResult|null>(null);
 const [error,setError]=useState('');
 const sample=REVIEW_DEMOS.find(d=>d.id===chosen)!;
 async function preview(){
  if(!onPreview||pending)return;
  setPending(true);setResult(null);setError('');
  try{
   const data=await onPreview({utterance:sample.utterance,params:sample.params});
   if(data.persisted||data.authorizedForExecution||data.preview.executionEnabled)
    throw Error('O serviço retornou uma prévia insegura. A operação foi recusada.');
   setResult(data);
  }catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível conferir a prévia.');}
  finally{setPending(false);}
 }
 return <section className="action-review-center" aria-label="Prévia da revisão de ações">
  <h3>Revisão de tarefas · demonstração</h3>
  <p className="action-review-warning"><strong>Execução desativada.</strong> Esta tela utiliza exclusivamente exemplos inventados, sem modificar Agenda, Drive, Firebase ou outros serviços.</p>
  <label htmlFor="sigma-demo-action">Exemplo de tarefa</label>
  <select id="sigma-demo-action" value={chosen} disabled={pending} onChange={event=>{
   setChosen(event.target.value as 'calendar'|'drive');setResult(null);setError('');
  }}>
   {REVIEW_DEMOS.map(sample=><option key={sample.id} value={sample.id}>{sample.name}</option>)}
  </select>
  <div className="action-review-card">
   <strong>Dados que seriam apresentados para sua revisão</strong>
   <dl>
    {sample.params.kind==='calendar.create'?<>
     <dt>Operação</dt><dd>Criar evento — exemplo</dd>
     <dt>Calendário</dt><dd>{sample.params.calendarId}</dd>
     <dt>Título</dt><dd>{sample.params.title}</dd>
     <dt>Início</dt><dd>{sample.params.startsAt}</dd>
     <dt>Fim</dt><dd>{sample.params.endsAt}</dd>
    </>:<>
     <dt>Operação</dt><dd>Renomear arquivo — exemplo</dd>
     <dt>Arquivo</dt><dd>{sample.params.fileId}</dd>
     <dt>Novo nome</dt><dd>{sample.params.newName}</dd>
    </>}
   </dl>
  </div>
  <div className="action-review-buttons">
   <button type="button" disabled={!onPreview||pending} onClick={()=>{void preview();}}>
    {pending?'Validando exemplo…':mode==='offline'?'Validar exemplo sem conexão':'Testar prévia autenticada'}
   </button>
   <button type="button" disabled title="Execução bloqueada até as próximas fases">
    Confirmar execução (indisponível)
   </button>
  </div>
  {error&&<p role="alert" className="action-review-warning">{error}</p>}
  {result&&<div role="status" className="action-review-result">
   <strong>{result.preview.status==='ready-for-review'?'Detalhes validados pelo backend':result.preview.summary}</strong>
   <p>Persistido: não · Execução autorizada: não · Tarefa executada: não.</p>
   {result.preview.missing.length>0&&<p>Faltam: {result.preview.missing.join(', ')}.</p>}
  </div>}
  <small>{mode==='offline'?'Modo laboratório: validação local com informações inventadas, sem autenticar o backend e sem enviar dados para nenhum serviço externo.': 'O teste de prévia exige sessão Firebase e um recurso ainda desligado por padrão no backend. Se estiver desativado, a API recusa a solicitação. Essa recusa é esperada e não indica erro no chat.'}</small>
 </section>;
}
