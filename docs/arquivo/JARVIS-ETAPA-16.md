# SIGMA — Etapa 16: memória explícita, persistente e isolada

## Objetivo
Transformar o laboratório, que hoje apenas conversa e pesquisa, em uma base de assistente pessoal real sem confundir conversa com armazenamento de informações.

## Escopo implementado no código (NÃO ativado automaticamente)
- Nova rota `/api/lab/memory` no Worker `sigma-jarvis-cerebro-lab`, independente do Worker `sigma-cerebro`.
- Memórias persistentes em Durable Object exclusivo `LAB_MEMORY`, classe `LabMemoryStore`, isolado por `UID` autenticado.
- O usuário pode listar, salvar, corrigir, excluir uma entrada ou excluir todas.
- Memórias só são criadas via formulário, após texto digitado pelo usuário e confirmação específica por checkbox.
- **Nenhuma conversa, resultado Tavily, mensagem Gemini, conteúdo Google Drive ou dado da conta é capturado automaticamente.**
- **As memórias não são injetadas no prompt do Gemini ainda.** Primeiro validar armazenamento, isolamento, edição e exclusão. O passo seguinte será leitura consentida das memórias na conversa.
- Limite inicial: 30 entradas por proprietário; até 500 caracteres por entrada. Nunca usar para senhas ou outros segredos.
- O navegador não mantém cópia permanente; os registros ficam no armazenamento do Worker de laboratório.
- Erros de acesso e origem rejeitados antes de ler/escrever; o front end jamais recebe credenciais Cloudflare.
- Sem Firestore; o armazenamento LAB em Cloudflare é uma escolha provisória de isolamento, não é uma migração da memória de produção.

## Segurança/ativação
1. `LAB_MEMORY_ENABLED="false"` no TOML versionado, inclusive para todos os deploys de conversa e pesquisa que não pedirem ativação explícita.
2. Nova opção manual `connect_lab_memory` (default `false`) só habilita memória quando `connect_lab_chat=true`, `PUBLICAR-APENAS-LAB` e `main`.
3. Novo namespace Cloudflare `LAB_MEMORY`; nunca usar `QUOTA`, `LAB_QUOTA` nem banco de produção como armazenamento de memórias.
4. Ao habilitar, começar com frases inventadas e verificar persistência após atualização, correção e remoção.
5. Não declarar que o Gemini lembra de tudo: até integrar explicitamente a consulta das memórias ao chat, ele não consulta a base.
6. Não mudar domínio `sigma-61328.web.app` ou Worker `sigma-cerebro`.

## Próximos marcos
- 16A: armazenamento manual e controles + testes completos.
- 16B: consulta de memórias aprovada pelo usuário nas respostas da IA, sem inserção indiscriminada do banco.
- 16C: propostas de memória feitas pela IA, que exigem aprovação antes de qualquer gravação.
- 17: integrar Agenda/Drive com escopos mínimos e ações sujeitas a confirmação, depois da base de memória.

## Nota de privacidade
Informações enviadas ao Worker podem permanecer em sua conta Cloudflare até exclusão. Não prometer "privacidade total", criptografia ponta a ponta ou exclusão de backups fora do controle do serviço. A exclusão remove a entrada ativa do armazenamento do laboratório e não permite afirmar eliminação imediata de toda retenção do fornecedor.
