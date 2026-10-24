# SIGMA — Handoff: consultas e conclusão de tarefas pelo chat

## Estado anterior validado em navegador
- Projeto "Teste SIGMA" criado pelo Gemini e confirmado pelo usuário, persistido no Workspace.
- Tarefa "Revisar meu planejamento" criada uma vez, vinculada ao projeto, prazo 24/10/2026, prioridade Normal, recuperada após reload.
- SIGMA LAB publicado no Firebase Hosting isolado e cérebro publicado no Worker `sigma-jarvis-cerebro-lab`. Não confundir com SIGMA principal.

## PR #19 — implementação em revisão
- Base: `sigma-chat-tarefas-confirmadas` (PR #18).
- Head: `sigma-consultar-concluir-tarefas-chat`.
- Consulta: solicitações explícitas de lista de tarefas acionam leitura no Durable Object do usuário autenticado; envia ao Gemini apenas até 25 títulos, datas, prioridades e nomes de projetos reais. Nenhuma escrita; retorna recibo de quantidade consultada.
- Conclusão: Gemini propõe `propose_complete_task` com título aproximado. O navegador carrega tarefas pendentes reais e pede seleção e autorização.
- `PATCH /api/lab/workspace/:uuid/complete` com `expectedUpdatedAt` valida UID, tipo task, pendência e versão, conclui atomicamente, retorna conflito para duplicatas/revisões antigas.
- Interface iPhone: fundo, tipografia, espaçamento e overflow dos campos das propostas corrigidos no CSS.
- Testes simulados incluem leitura, proteção de notas, resolução de projetos, proposta sem gravação, confirmação, concorrência, duplicata e conta não autorizada.

## A fazer antes de publicar
1. Confirmar CI `Verify` no PR #19 (build, check:worker, npm test). Corrigir falhas na branch.
2. Revisar testes e contratos, especialmente negações e seleção ambígua.
3. Preparar workflow de publicação restrito ao SIGMA LAB, reutilizando WIF e Cloudflare já conectados; **não publicar nem mesclar sem autorização explícita**.
4. Após deploy autorizado, usar Work somente para teste de navegador: consultar tarefas, selecionar e concluir `Revisar meu planejamento` (se ainda estiver pendente), confirmar persistência após recarga. Nunca repetir confirmação após resultado incerto.

## Limites
- O modelo não executa gravações diretamente. Não há calendário, notificação, Gmail ou ações externas.
- Não existe memória persistente de chat; somente dados de Workspace e memórias autorizadas.
- A lista compartilhada com Gemini é limitada a 25 tarefas pendentes e 250 registros totais.
- Não chamar de concluída a validação de navegador enquanto o usuário/Work não executar o teste real.
