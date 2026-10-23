/** Stable capability catalogue for the isolated ecosystem; no fake connections. */
export type ModuleState='implemented-lab'|'ready-for-credentials'|'planned';
export const SIGMA_MODULES=[
 {id:'assistant',name:'Conversa com Gemini',state:'implemented-lab',needs:[]},
 {id:'memory',name:'Memória contextual controlada',state:'implemented-lab',needs:[]},
 {id:'learning',name:'Sugestão de aprendizado contínuo com aprovação',state:'implemented-lab',needs:[]},
 {id:'study',name:'Diário de estudos, horas e matérias',state:'implemented-lab',needs:[]},
 {id:'daily',name:'Diário e rotina pessoal',state:'implemented-lab',needs:[]},
 {id:'tasks',name:'Tarefas e acompanhamento',state:'implemented-lab',needs:[]},
 {id:'finance',name:'Registros financeiros manuais',state:'implemented-lab',needs:[]},
 {id:'web',name:'Pesquisa Tavily sob demanda',state:'implemented-lab',needs:['TAVILY_API_KEY']},
 {id:'calendar',name:'Google Calendar — leitura de compromissos',state:'ready-for-credentials',needs:['Google OAuth com calendar.events.readonly']},
 {id:'drive',name:'Google Drive — metadados e localização',state:'ready-for-credentials',needs:['Google OAuth com drive.metadata.readonly']},
 {id:'notion',name:'Notion — buscar páginas e consultar blocos',state:'ready-for-credentials',needs:['NOTION_API_KEY e compartilhamento das páginas']},
 {id:'documents',name:'Catálogo de documentos: metadados, diferenças e pesquisa',state:'ready-for-credentials',needs:['Google OAuth Drive, segredo Notion e flag LAB_DOCUMENTS_ENABLED']},
 {id:'actions',name:'Criar eventos, pastas e páginas com aprovação individual',state:'ready-for-credentials',needs:['OAuth Google de escrita, Notion e flag LAB_ACTIONS_ENABLED']},
 {id:'automations',name:'Monitoramento e execução agendada',state:'planned',needs:['Agendador persistente e preferências de alertas']},
 {id:'semantic',name:'Busca semântica e indexação de documentos',state:'planned',needs:['Modelo de embeddings e base vetorial']}
] as const;
