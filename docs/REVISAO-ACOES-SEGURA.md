# SIGMA — Etapa 8: revisão de tarefas com autenticação (desligada)

## Objetivo

Preparar uma experiência de revisão de tarefas conectada ao Worker com autenticação Firebase, **sem habilitar a execução de comandos**. O SIGMA continua um Jarvis geral, sem prioridade de área.

## O que foi implementado

- `src/ActionReviewCenter.tsx`: painel integrado ao menu do SIGMA com dois exemplos completamente fictícios, um evento no Calendar e a renomeação de um arquivo inexistente no Drive.
- O painel mostra os detalhes exatos que o usuário precisaria revisar. O botão de execução está **desabilitado**, inclusive após validação bem-sucedida.
- `src/services.ts`: requisição autenticada com `user.getIdToken()` e HTTPS para consultar o backend; falha se o resultado indicar persistência ou possibilidade de execução.
- `worker/src/core/review-api.ts`: valida JSON com tamanho máximo, separa o formato de pedido do núcleo `previewAction` e devolve somente uma prévia com `persisted:false` e `authorizedForExecution:false`.
- `worker/src/index.ts`: rota POST `/api/actions/preview` sujeita à origem permitida, autenticação Firebase existente e **feature flag `ACTION_PREVIEW_ENABLED` desligada por padrão**.
- Nenhum segredo, token OAuth do Drive ou Calendar, chamada ao Gemini, gravação no banco ou execução externa é necessário para a prévia.

## Barreiras deliberadas

- O arquivo `worker/wrangler.toml` **não define** `ACTION_PREVIEW_ENABLED`. Portanto o Worker desativa a rota, mesmo que essa branch venha a ser compilada.
- A rota é recusada quando não há autenticação ou quando a origem não é permitida.
- O formulário tem **somente exemplos fictícios**; não permite inserir dados pessoais nem armazenar resultados.
- Não existem endpoints `/api/actions/confirm` ou `/api/actions/execute`.
- O botão de execução permanece indisponível. O backend também não oferece mecanismo para executar tarefas por essa rota.
- A prévia expira com a sessão local da tela; não há coleção nova de Firestore, armazenamento local ou Durable Object sendo utilizado na interface.

## Testes executados

O GitHub Actions compila frontend, verifica tipos do Worker e executa testes automatizados. `tests/action-preview-http.test.ts` verifica:

1. Flag desativada impede até o início da autenticação e retorna 404.
2. Flag ativada em teste exige sessão autorizada do Firebase.
3. Origem inválida, método errado e rota de execução inexistente são recusados.
4. Prévia aprovada na validação **não salva nem executa**, e não consulta Gemini, Google ou histórico.
5. Dados incompletos resultam em necessidade de detalhes; JSON inválido ou excessivo é recusado.
6. Painel não apresenta comando de confirmação utilizável, exibe exemplos fictícios e não faz gravações diretas.
7. A configuração pública e o arquivo de publicação não habilitam a flag.

## O que ainda falta

Para o Jarvis realmente criar eventos ou organizar arquivos será necessário um serviço confiável de autorização e execução, contas de testes, prova de operação, idempotência, trilha de auditoria, controle de erros, consentimento granular, revogação de acessos, limites de custos e testes ponta a ponta.

**Nenhum deploy foi realizado nesta etapa.** A branch `sigma-jarvis-arquitetura` e o PR #3 continuam isolados da produção. Antes de liberar qualquer dado real, será necessária aprovação explícita do proprietário.