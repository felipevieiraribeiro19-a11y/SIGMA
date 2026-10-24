# SIGMA LAB — validação da criação de tarefas pelo chat

**Status:** lançamento exclusivo LAB, preservando SIGMA principal. Não ativa ações externas nem Google Calendar.

## Cenário demonstrativo único

No site do laboratório, entre com Google, abra o chat e envie:

> Sigma, adiciona no meu projeto Teste SIGMA uma tarefa para revisar meu planejamento amanhã.

A resposta esperada é uma **proposta**, nunca um registro automático. Confira que a proposta mostra o título, observações, data de amanhã no horário de São Paulo, prioridade e projeto real existente.

Após revisar e marcar a autorização explícita, use **Confirmar e salvar tarefa**. A gravação acontece no endpoint autenticado `POST /api/lab/workspace`, vinculado ao UID Firebase. O Gemini não escolhe diretamente o identificador do projeto.

Na seção **Gestão integrada**, consulte as tarefas e verifique que a tarefa ficou vinculada ao projeto correto. Recarregue a página e confirme que continua cadastrada.

## Limites

- Este recurso cria apenas registros de tarefas no SIGMA. Não envia notificações, não agenda eventos no Google Calendar e não manda e-mails.
- Se aparecer erro ou resposta incerta ao salvar, confira primeiro a lista de tarefas antes de tentar novamente, para não criar duplicatas.
- Uma proposta desaparece ao sair da sessão sem confirmação. Isso é intencional; o Gemini não salva rascunhos automaticamente.
- A escolha do projeto vem da lista autenticada e exclui projetos arquivados.
- `propose_task` só é aceita pelo servidor quando a última mensagem do usuário contém pedido explícito de registro de tarefa. Dados da memória não autorizam a chamada.
- Google OAuth e ações externas permanecem desabilitados.
- Não misturar esse deploy com o Worker `sigma-cerebro` nem com o canal de produção `sigma-61328.web.app`.

## Verificação automática

No PR #18, `npm run build`, `npm run check:worker` e todos os testes precisam ficar verdes. A publicação Firebase LAB utiliza somente WIF já existente e `firebase-tools@15.34.0` para contornar a regressão de permissões da versão 15.34.1. O Worker LAB é atualizado via Cloudflare conectado preservando segredos existentes.
