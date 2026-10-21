import {useState} from 'react';
import {initialDemoMemory,transitionDemoMemory,type DemoMemoryAction} from './memory-demo';

/**
 * Non-persistent sandbox. Only fictional copy exists in this panel.
 * No APIs, tokens, chat history or data from the signed-in user are used.
 */
export function MemoryCenter(){
 const [demo,setDemo]=useState(initialDemoMemory);
 const advance=(action:DemoMemoryAction)=>setDemo(old=>transitionDemoMemory(old,action));
 return <section className="memory-center" aria-label="Central de memória - demonstração">
  <h3>Central de memória</h3>
  <p className="memory-note"><strong>Prévia isolada.</strong> A memória pessoal ainda está desativada. Os exemplos abaixo são fictícios: nada é salvo, enviado à IA ou acrescentado ao Firebase. Ao sair ou recarregar, a simulação recomeça.</p>
  <div className="memory-stage" aria-label="Fluxo planejado da memória">
   <span>1. Propor</span><span>2. Confirmar</span><span>3. Consultar e corrigir</span><span>4. Excluir</span>
  </div>
  <div className="memory-demo-card">
   <strong>Exemplo fictício</strong>
   <p role="status">{demo.status==='pending'?'Aguardando aprovação':demo.status==='saved'?'Salvo apenas na simulação':'Excluído da simulação'}</p>
   {demo.status!=='deleted'&&<p className="memory-example">{demo.content}</p>}
   <small>Origem: {demo.sourceLabel}</small>
   {demo.revision>0&&<small>Versão de teste: {demo.revision}</small>}
  </div>
  <div className="memory-demo-actions">
   {demo.status==='pending'&&<button type="button" onClick={()=>advance('approve')}>Simular aprovação</button>}
   {demo.status==='saved'&&<>
    <button type="button" disabled={demo.content.includes('com horário')} onClick={()=>advance('correct')}>Simular correção</button>
    <button type="button" className="memory-delete" onClick={()=>advance('delete')}>Simular exclusão</button>
   </>}
   <button type="button" onClick={()=>advance('reset')}>Reiniciar demonstração</button>
  </div>
  <p className="memory-note">Quando o módulo real estiver aprovado, esta área permitirá revisar, pesquisar, editar e apagar memórias com confirmação. <strong>Esses controles reais ainda não estão disponíveis.</strong></p>
 </section>;
}
