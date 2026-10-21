# SIGMA — Fluxo de ações do Jarvis (etapa 7)

O objetivo é conectar conversa, plano e consentimento sem confundir uma simulação com uma ação real.
**Estado: implementação de testes, totalmente desconectada de endpoints do Worker e do Firebase de produção.**

## Circuito testado

1. O orquestrador identifica a intenção de alterar um recurso externo.
2. `worker/src/core/action-flow.ts` só aceita operações explicitamente definidas em contratos: criar evento de calendário e renomear arquivo do Drive. Pedidos de outras ações ficam bloqueados, não improvisados.
3. O pedido em linguagem natural sozinho não especifica detalhes confiáveis. Para criar um evento exige calendário, título, início com fuso horário e fim. Para renomear exige identificação inequívoca do arquivo e novo nome.
4. Detalhes ausentes retornam `needs-details`, e detalhes completos geram prévia estruturada `ready-for-review` com `executionEnabled: false`.
5. O backend de testes gera proposta ligada ao UID, capacidade, destino, conteúdo canônico e validade curta. A revisão exibe exatamente esses dados.
6. O usuário confirma o fingerprint SHA-256 correspondente, ou cancela. Dados alterados na revisão não são aceitos.
7. O consumo de autorização é de uso único em `DurableApprovalStore`, com transações e isolamento por proprietário.
8. O resultado retorna **`simulated-only`, `executed: false`**. Nenhuma operação externa é chamada.

## Arquivos

- `worker/src/core/orchestrator.ts`: identifica intenção conversacional sem executar efeitos colaterais.
- `worker/src/core/action-flow.ts`: tradutor de intenção para prévia estruturada, revisão e consumo simulado.
- `worker/src/core/approval-ledger.ts`: contrato de proposta, digest, confirmação, cancelamento e consumo único.
- `worker/src/core/approval-durable.ts`: adaptador transacional preparado para Durable Objects.
- `tests/action-flow.test.ts`: valida detalhes obrigatórios, adulteração, dono, expiração, cancelamento e impossibilidade de execução real.
- `tests/action-flow-durable.test.ts`: circuito integrado completo usando armazenamento transacional simulado, incluindo reinício e simultaneidade.

## Travas que permanecem

- Nenhuma rota HTTP pública de autorização ou execução foi registrada.
- Não há executor real para Google Calendar, Google Drive ou memórias; nenhuma mudança remota é feita.
- Nenhuma gravação de aprovação real está ativa. A camada usa dados inventados em testes.
- O modelo de IA não tem acesso às chamadas de autorização e não pode alegar que a execução ocorreu.
- Assinaturas ChatGPT, Arena ou DeepSeek não criam acesso automático às suas APIs.
- `firestore.rules` e o site de produção não foram modificados.

## Pendências antes de liberar na prática

- Resolução confiável e verificada de contas, arquivo/evento alvo e identidade do usuário.
- Política de confirmação via interface com conteúdo claro, no dispositivo do proprietário.
- Armazenamento e ciclo de vida do consentimento com limpeza e retenção limitadas.
- Identidade do backend, scopes OAuth mínimos e avaliação de autorização novamente imediatamente antes de executar.
- Registro de auditoria e resposta verificável do provedor; idempotência por ferramenta para evitar efeitos duplicados.
- Testes com APIs e contas de demonstração, sem dados pessoais reais.
- Revisão de custo, limites gratuitos e implantação autorizada.

**Esta etapa melhora a fundação de segurança, mas ainda NÃO torna o SIGMA um agente executor de tarefas.**