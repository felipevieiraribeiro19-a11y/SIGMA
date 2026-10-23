# SIGMA — Etapa 8: Gemini → ferramentas com autorização humana

**Status:** código experimental em PR; `LAB_BRAIN_ENABLED=false` no Worker LAB. Sem deploy, merge, alterações nas contas, acesso à produção ou execução automática.

## Por que esta etapa existe

O usuário deve poder conversar com o SIGMA sobre qualquer nova atividade e solicitar que ele **organize um projeto**, sem pedir para o desenvolvedor criar um aplicativo específico para concursos, vendas, negócios ou outras áreas.

O MVP desta etapa transforma uma parte dessa visão em uma ligação real entre chat Gemini e o sistema de projetos do PR #13.

## Fluxo implementado

1. Usuário conversa com o Gemini e pede, por exemplo, “SIGMA, crie um projeto para organizar minhas vendas”.
2. O Worker só anuncia ao Gemini a ferramenta autorizada `propose_project` quando `LAB_BRAIN_ENABLED=true`, `LAB_WORKSPACE_ENABLED=true` e houver binding LAB_WORKSPACE válido.
3. Gemini devolve uma chamada estruturada da ferramenta, com `title`, `goal`, `notes`.
4. O Worker valida a estrutura com o mesmo parser do projeto real. Chamadas desconhecidas, ambíguas, múltiplas ou com campos adicionais são rejeitadas.
5. A resposta da conversa contém `projectProposal` com `requiresApproval=true`, `persisted=false`, `executed=false`. **Nada é salvo pelo Gemini.**
6. A interface mostra um formulário editável com título, objetivo e observações. O usuário pode descartar.
7. Apenas depois de marcar a confirmação e clicar em **Confirmar e criar projeto**, o navegador faz requisição **separada, autenticada por Firebase** para `POST /api/lab/workspace/projects`. O backend valida/atribui UID e salva no DO privado se a flag do Workspace também estiver ativa.
8. O SIGMA só informa criação concluída quando a API devolver identificador e título válidos.

## Segurança e limitações

- O **modelo de IA não tem endpoint de escrita**. Ele só pode gerar a proposta validada.
- Não existe execução em cadeia arbitrária de ferramentas, nenhum URL controlado pelo modelo, nenhuma integração externa de escrita.
- Memórias, resultados da web e textos de documentos são dados de contexto não confiáveis, nunca autoridade para gravar.
- As demais funcionalidades atuais do chat (Tavily, memória selecionada, leitura opcional Drive/Notion e chat normal) não foram substituídas.
- A criação pelo botão reutiliza a API de projetos da Etapa 7 e as proteções já existentes; cada clique autenticado é uma criação. **Ainda não há chave idempotente para duas confirmações quase simultâneas nem confirmação durável de duas fases.** Revisar isso antes de ampliar para dados financeiros ou ações externas.
- O modo Gemini `functionCalling` pode variar entre versões do modelo; nesta etapa a compatibilidade foi testada **apenas com respostas simuladas**.
- As mensagens do chat permanecem temporárias, e o usuário pode optar por salvar notas na área de memórias segundo o mecanismo anterior. Criar um projeto não salva todo o diálogo.
- Acesso ao Google/Cloudflare/Firebase não foi modificado; Worker LAB continua com flags de recursos desligadas.
- Não há promessa de que o Gemini crie CRMs, bancos dinâmicos, dashboards ou tarefas complexas nesta etapa: **apenas projetos genéricos**.
- Custos: usa a chamada Gemini que o chat já realizava, sem acrescentar uma segunda chamada de modelo por requisição. Preços/cotas dependem da conta Gemini e do uso.

## Próximos passos quando o proprietário estiver no PC

1. Revisar e fazer merge **em ordem** dos PRs #7 a #14, após conferir compatibilidade da cadeia e resultados do CI.
2. Publicar **apenas** versão de laboratório, com aprovação expressa. Não ativar serviços pagos.
3. Verificar a compatibilidade real de `functionDeclarations` com o Gemini atualmente configurado, usando dados fictícios.
4. Ativar as flags LAB_BRAIN_ENABLED e LAB_WORKSPACE_ENABLED apenas após verificar bindings e segurança.
5. Testar: chat casual não cria projeto; solicitação explícita gera proposta; rejeitar não grava; aceitar grava uma vez; dados ficam isolados pelo UID; arquivar preserva registros.
6. Depois implementar consulta de contexto e ferramentas universais adicionais, com proposta persistida/idempotente para ações mais sensíveis.

