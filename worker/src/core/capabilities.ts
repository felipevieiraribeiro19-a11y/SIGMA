/** Contrato central de ferramentas. Não representa ações implementadas. */
export type CapabilityStatus='available'|'preview'|'planned'|'not-configured';
export type CapabilityAccess='none'|'user-google-oauth'|'server-secret'|'not-implemented';
export type ToolRisk='read'|'write'|'external-side-effect';
export type Capability={
 id:string;title:string;domain:'conversation'|'research'|'integrations'|'memory'|'agency'|'models'|'media';
 status:CapabilityStatus;access:CapabilityAccess;risk:ToolRisk;
 description:string;
};
export type CapabilityConfig={searchConfigured:boolean;googleConnected:boolean};

export function listCapabilities(config:CapabilityConfig):Capability[]{
 return [
  {id:'conversation.chat',title:'Conversa',domain:'conversation',status:'available',access:'none',risk:'read',description:'Chat com Gemini via Worker autenticado'},
  {id:'conversation.history',title:'Histórico',domain:'memory',status:'available',access:'none',risk:'read',description:'Consulta ao histórico recente salvo no Firestore; não é memória pessoal estruturada'},
  {id:'research.web',title:'Pesquisa na internet',domain:'research',status:config.searchConfigured?'available':'not-configured',access:'server-secret',risk:'read',description:'Pesquisa Tavily sob demanda, com fontes e limite mensal'},
  {id:'integration.calendar.read',title:'Consultar agenda',domain:'integrations',status:config.googleConnected?'preview':'not-configured',access:'user-google-oauth',risk:'read',description:'Listagem experimental dos próximos compromissos quando conectado'},
  {id:'integration.drive.list',title:'Localizar arquivos',domain:'integrations',status:config.googleConnected?'preview':'not-configured',access:'user-google-oauth',risk:'read',description:'Lista experimental de nomes de PDFs, sem indexação do conteúdo'},
  {id:'media.files',title:'Analisar anexo',domain:'media',status:'preview',access:'none',risk:'read',description:'Anexo temporário por chat, tamanho limitado; não permanece como biblioteca'},
  {id:'media.voice',title:'Voz',domain:'media',status:'preview',access:'none',risk:'read',description:'Gravação e reprodução por turnos; não é chamada contínua'},
  {id:'memory.profile',title:'Memória pessoal controlável',domain:'memory',status:'planned',access:'not-implemented',risk:'write',description:'Fatos confirmados com origem, edição e exclusão'},
  {id:'memory.documents',title:'Biblioteca consultável',domain:'memory',status:'planned',access:'not-implemented',risk:'write',description:'Indexação, pesquisa com fontes, atualização e exclusão de arquivos'},
  {id:'integration.calendar.write',title:'Alterar agenda',domain:'integrations',status:'planned',access:'not-implemented',risk:'external-side-effect',description:'Criar, alterar e cancelar eventos apenas com confirmação'},
  {id:'integration.drive.write',title:'Organizar arquivos',domain:'integrations',status:'planned',access:'not-implemented',risk:'external-side-effect',description:'Renomear, mover ou apagar arquivos apenas com confirmação'},
  {id:'agency.actions',title:'Executar tarefas',domain:'agency',status:'planned',access:'not-implemented',risk:'external-side-effect',description:'Orquestração de ações com execução e auditoria'},
  {id:'agency.proactive',title:'Acompanhamento proativo',domain:'agency',status:'planned',access:'not-implemented',risk:'external-side-effect',description:'Regras, notificações e agendamentos autorizados'},
  {id:'models.routing',title:'Trocar de inteligência',domain:'models',status:'planned',access:'not-implemented',risk:'read',description:'Adaptadores de provedores no servidor com custos e credenciais separados'}
 ];
}
export function findCapability(id:string,config:CapabilityConfig):Capability|undefined{
 return listCapabilities(config).find(c=>c.id===id);
}
