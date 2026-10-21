# SIGMA — Jarvis pessoal

**SIGMA — Sistema Inteligente de Gestão, Monitoramento e Aprimoramento.**

Um assistente pessoal geral inspirado no Jarvis: conversa natural, memória, conhecimento documental, integrações com serviços, planejamento e ações. **Não há área principal imposta ao produto.** Todos os módulos de vida (estudos, finanças, trabalho, rotina, família e qualquer outro) compartilham o mesmo núcleo.

A arquitetura e os critérios de conclusão estão em **[docs/JARVIS-ARQUITETURA.md](docs/JARVIS-ARQUITETURA.md)**.

## O que existe hoje, sem propaganda

| Capacidade | Situação |
|---|---|
| Site/PWA, login Google e conversa | Implementação existente, já usada no site publicado |
| Gemini via Worker | Provedor de IA atual, sujeito a cotas |
| Histórico no Firestore | Registra pares conversa/resposta; **não equivale** a memória estruturada |
| Tavily | Busca sob demanda, quando configurada; cita URLs |
| Áudio | Gravação e TTS por turnos, sem voz contínua |
| PDFs e anexos | Análise temporária; não ficam indexados numa biblioteca |
| Calendar e Drive | Prova de conceito de leitura criada pela Arena; requer OAuth e testes reais; Drive lista metadados |
| Catálogo de capacidades | Implementado na branch Jarvis, autenticado, indica recursos experimentais/futuros |
| Identidade e contrato de ferramentas | Núcleo Jarvis geral; todas as ações de escrita bloqueadas |
| Memória pessoal | Motor e adaptador de banco em código, ainda desligados; painel de **demonstração fictícia**, sem dados reais |
| Biblioteca RAG, agentes proativos, outros modelos | **Planejado, não implementado** |
| Controles de finanças/estudo como banco de dados | **Não implementados** nesta etapa; não confundir relatos com lançamentos |

A aplicação segue operando em https://sigma-61328.web.app na versão previamente publicada. **A branch \`sigma-jarvis-arquitetura\` é trabalho de desenvolvimento, não foi publicada automaticamente.**

## Arquitetura em construção

- \`src/\`: interface React/PWA, autenticação e cliente de conversa.
- \`worker/src/index.ts\`: Cloudflare Worker, autenticação do proprietário, endpoints e integração com o modelo.
- \`worker/src/core/identity.ts\`: personalidade e limites de capacidade, sem foco em um domínio.
- \`worker/src/core/capabilities.ts\`: catálogo de recursos e estados operacionais.
- \`worker/src/core/authorization.ts\`: nega por padrão ações não disponíveis/não autorizadas.
- \`worker/src/core/models.ts\`: interface do fornecedor e adaptador Gemini atual; outros modelos são apenas possibilidades futuras.
- \`worker/src/core/memory-contracts.ts\`: tipos de memória com proveniência e consentimento; sem gravações automáticas.
- \`worker/src/core/memory-firestore.ts\`: adaptador de armazenamento futuro no Firebase, testado com requisições simuladas; **não conectado**, com Security Rules atuais bloqueando acesso.
- \`src/MemoryCenter.tsx\`: demonstração interativa local de aprovação, correção e exclusão; não consulta nem grava dados reais.
- \`worker/src/core/memory-engine.ts\`: memória controlada por confirmação, revisão, origem, busca e exclusão; ainda só usa armazenamento temporário de testes, sem gravar no Firebase.
- \`worker/src/core/action-contracts.ts\`: propostas explícitas de ações, bloqueadas até existirem executores auditáveis.
- \`worker/src/google.ts\`: consultas experimentais de leitura.
- \`worker/src/web-search.ts\`: Tavily quando configurada, com limite.
- \`worker/src/memory.ts\`: histórico conversacional atual no Firebase.

## Construção e execução de testes

Requer Node.js 22+:

\`\`\`bash
npm ci
npm run build
npm test
npm run check:worker
\`\`\`

Não crie credenciais do Firebase no GitHub; os deploys existentes usam federação de identidade. Nenhum segredo deve entrar no frontend ou no repositório. Os workflows de produção somente aceitam a branch \`sigma-work-integracao\`; mantenha esta branch de arquitetura isolada até passar por revisão, testes e autorização de publicação.

## Segurança, privacidade, custos e desenvolvimento

- Escrita externa, exclusões e automações ficam desabilitadas por padrão. Planejar não é executar.
- Logs não devem conter token Google, chave API ou conteúdo privado; integração externa deve isolar UID e validar permissões.
- Projeto procura operar em camadas gratuitas; antes de conectar um novo provedor, documente cotas, riscos e controle de custos.
- Histórico existente é armazenado em Firestore e continua seguindo as regras de privacidade. Não utilizar conversas como registros estruturados confiáveis.
- Mudanças em regras Firestore precisam de testes e confirmação deliberada, nunca publicação incidental.
- \`firestore.memory.rules.candidate\` é apenas uma proposta, **não referenciada por firebase.json**. Não implantar até passar pelos testes do emulador e revisão da autorização de escrita.
- Critérios de liberação e limites da exclusão: \`docs/MEMORIA-CONTROLES.md\`.
- Para informações sobre recursos de leitura Google: \`docs/GOOGLE-AGENDA-DRIVE.md\`.
- Para recursos atuais e orçamento de serviços: \`docs/CUSTOS.md\`.
- Histórico antigo de desenvolvimento: \`docs/STATUS.md\` (algumas seções descrevem protótipos desatualizados).

**Objetivo da fase:** criar o núcleo correto e testável do Jarvis. Não prometer que todas as capacidades estão operacionais antes que existam integração real, consentimento, execução e teste ponta a ponta.
