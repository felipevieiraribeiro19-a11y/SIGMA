# Voz e integrações — 24/10/2026

Publicação no site principal autorizada pelo proprietário. Base: sigma-beta-preparacao-20261024 (2461d59). Mantém o orbe dessa base; PR28 de prévia não incluído.

- Ditado pt-BR no chat (SpeechRecognition / webkitSpeechRecognition), resposta falada opcional e botão parar. Sem escuta em segundo plano; ditado do teclado é alternativa quando API indisponível.
- Google Tasks: consulta da lista padrão e criação com notas/prazo.
- Google Calendar: criação com fuso explícito e descrição.
- Google Drive: criação de pasta ou arquivo TXT contendo a anotação completa.
- Notion: criação de página com conteúdo, sob página-mãe validada.
- Gemini apenas propõe. Prepare a ação, autorize Google quando necessário e confirme por botão ou dizendo “confirmar ação”. Claim único em Durable Object impede repetição da mesma proposta. Resultados incertos não são repetidos automaticamente.
- Tokens Google ficam na memória da sessão. Refresh persistente continua desabilitado por faltar configuração OAuth dedicada.
- Conectar Google é uma autorização do usuário no próprio SIGMA; login Firebase sozinho não concede acesso a Calendar/Tasks/Drive.
- Notion ainda depende de NOTION_API_KEY no Worker e compartilhamento das páginas com essa integração. A conexão Notion do ChatGPT não é transferível ao SIGMA.
- Histórico de chat permanece apenas na sessão; memórias/registros confirmados usam os armazenamentos já existentes.

Validação local: build:beta, check:worker e 307 testes aprovados. Não equivale à validação de microfone no iPhone nem à autorização real dos serviços.

## Continuação — 25/10/2026

- Confirmações literais por voz/ditado para tarefas, conclusão, projetos e memórias internas. Comandos negados, citações e frases ambíguas não confirmam.
- “Preparar ação”, “confirmar ação” e “cancelar ação” operam somente a proposta externa visível.
- Retornos de gravação interna são lidos em voz alta quando respostas faladas estão ligadas.
- Corrigido disparo de pesquisa web por “no Google Drive/Tarefas”. Comandos externos não geram busca pública.
- Limpar sessão também fecha a proposta externa.
- Validação: compilação Beta e 310 testes passaram. As autorizações dos provedores ainda são necessárias; Notion não tem chave configurada.
