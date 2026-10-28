# SIGMA — Jarvis pessoal

**SIGMA — Sistema Inteligente de Gestão, Monitoramento e Aprimoramento.**

Um assistente pessoal geral inspirado no Jarvis: conversa natural, memória, conhecimento documental, integrações com serviços, planejamento e ações. **Não há área principal imposta ao produto.** Todos os módulos de vida (estudos, finanças, trabalho, rotina, família e qualquer outro) compartilham o mesmo núcleo.

A arquitetura e os critérios de conclusão estão em **[docs/arquivo/JARVIS-ARQUITETURA.md](docs/arquivo/JARVIS-ARQUITETURA.md)**.

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

A aplicação segue operando em https://sigma-61328.web.app na versão previamente publicada. **A linha de desenvolvimento é \`sigma-work-integracao\`; nada é publicado automaticamente por push.**

## Estrutura do repositório (pós-limpeza)

```
src/          interface do Beta publicado (entrada: src/jarvis-lab.tsx)
worker/src/   Worker Cloudflare: index.ts (sigma-cerebro) e chat-lab.ts (LAB)
tests/        suíte única: npm test (309 testes, sem rede)
scripts/      geração do HTML offline do laboratório
docs/arquivo/ relatórios e auditorias históricas
.github/workflows/  4 workflows: Verify, preview, publicar Beta, worker
```

`dist-*` não é versionado: o build é gerado pelo CI ou por `npm run build`.
`npm run dev` sobe a interface Beta em `/sigma-beta.html`; `npm run build` compila a Beta.

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
- \`src/ActionReviewCenter.tsx\`: painel demonstrativo com tarefas fictícias, validação no Worker condicionada a flag desligada e execução desabilitada.
- \`worker/src/core/review-api.ts\`: prévia autenticada, limitada e sem persistência, disponível apenas se a flag de testes for ligada.
- \`worker/src/core/action-flow.ts\`: circuitos de proposta, revisão e aprovação simulada (sempre `executed: false`); não ligado ao Worker.
- \`worker/src/core/approval-durable.ts\`: adaptador transacional de propostas em Durable Objects, isolado por conta e testado com armazenamento simulado; **não está ligado ao Worker nem ativa ações**.
- `worker/src/core/audited-approval.ts`: armazenamento transacional de autorizações com auditoria mínima, isolado, testado com dados fictícios, **não conectado à produção**.
- `worker/src/core/mock-executor.ts`: executor de laboratório sem chamadas externas; resposta perdida não dispara repetição automática.
- \`worker/src/core/approval-ledger.ts\`: protocolo de aprovação por ação exata, dono, expiração e uso único; isolado, sem executar tarefas.
- \`worker/src/core/action-contracts.ts\`: propostas explícitas de ações, bloqueadas até existirem executores auditáveis.
- \`worker/src/google.ts\`: consultas experimentais de leitura.
- \`worker/src/web-search.ts\`: Tavily quando configurada, com limite.
- \`worker/src/memory.ts\`: histórico conversacional atual no Firebase.

## Laboratório Jarvis para iPhone (ainda NÃO publicado)

A build isolada `npm run build:lab` prepara uma interface demonstrativa com memória fictícia, revisão de tarefas e teste opcional de login Google. O pacote sai em `dist-jarvis-lab`, sem copiar a configuração de produção. GitHub Actions valida e anexa o pacote, sem publicá-lo. Um fluxo **manual** separado prepara o canal temporário `jarvis-lab`, mas não roda sem confirmação expressa. Instruções e restrições: [docs/arquivo/JARVIS-LAB-IPHONE.md](docs/arquivo/JARVIS-LAB-IPHONE.md).

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
- \`firestore.memory.rules.candidate\` **nega escrita direta do cliente**, passou por 14 verificações no Firestore Emulator e não está referenciado por firebase.json. Continua não publicado; o backend seguro de execução ainda precisa ser desenvolvido.
- Critérios de liberação e limites da exclusão: \`docs/arquivo/MEMORIA-CONTROLES.md\`.
- Para informações sobre recursos de leitura Google: \`docs/arquivo/GOOGLE-AGENDA-DRIVE.md\`.
- Critérios de segurança e simulação do fluxo de ações: \`docs/arquivo/FLUXO-ACOES-JARVIS.md\`.
- Consulta autenticada e painel de revisão, desativados por padrão: \`docs/arquivo/REVISAO-ACOES-SEGURA.md\`.
- Laboratório integrado de auditoria e autorizações simuladas: `docs/arquivo/AUDITORIA-ACOES.md`.
- Runtime local do Cloudflare com 16 verificações reais de Durable Object e reinício: `docs/arquivo/CLOUDFLARE-LAB-LOCAL.md`. Nenhuma publicação remota.
- Simulação de execução com estados confirmada/falha/incerta e consulta segura para reconciliar: `docs/arquivo/EXECUCAO-SIMULADA.md`.
- Executor fictício validado no Cloudflare local com 135 testes automatizados e 27 checagens HTTP: `docs/arquivo/EXECUTOR-CLOUDFLARE-VALIDADO.md`.
- Para recursos atuais e orçamento de serviços: \`docs/arquivo/CUSTOS.md\`.
- Histórico antigo de desenvolvimento: \`docs/arquivo/STATUS.md\` (algumas seções descrevem protótipos desatualizados).

**Objetivo da fase:** criar o núcleo correto e testável do Jarvis. Não prometer que todas as capacidades estão operacionais antes que existam integração real, consentimento, execução e teste ponta a ponta.
