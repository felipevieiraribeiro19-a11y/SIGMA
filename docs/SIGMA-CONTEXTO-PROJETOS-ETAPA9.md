# SIGMA LAB — Etapa 9: contexto de projetos com consentimento

**Estado:** PR de rascunho, não publicado. Complementa PR #14 sem ativar Gemini ou Cloudflare.

## O problema resolvido

No PR #14, o Gemini consegue **propor** um projeto novo, mas não conhece os projetos já salvos. Assim, poderia propor duplicatas ou não conseguir responder quando o usuário pedir para retomar uma atividade anterior.

Esta etapa prepara uma consulta contextual simples, sem transformar o SIGMA em um aplicativo exclusivo de estudos ou de vendas.

## Como funciona

1. O usuário marca **“Compartilhar apenas nomes, objetivos e estados dos meus projetos com o Gemini nesta pergunta”**. A opção vem desmarcada e é limpa ao trocar de usuário.
2. O navegador envia `useProjects: true` somente na solicitação escolhida, junto da conversa; não envia dados de projetos pelo próprio navegador.
3. O Worker verifica Firebase UID, `LAB_BRAIN_ENABLED`, `LAB_WORKSPACE_ENABLED` e seu binding privado. Falha fechado quando qualquer pré-condição está ausente.
4. O Worker consulta `GET /projects` **no Durable Object do UID autenticado**, em modo somente leitura.
5. O Worker extrai **até oito projetos**, com *título (máx. 120 caracteres)*, *objetivo resumido (máx. 240 caracteres)* e *status*. Não envia IDs, observações, clientes, valores financeiros, tarefas, diário ou outros registros.
6. Essas informações entram no contexto da **mesma chamada Gemini que já existia**. Projetos armazenados continuam existindo; nenhuma gravação é disparada.
7. A resposta informa quantos projetos estavam disponíveis e quantos foram compartilhados. Não presume que o restante foi analisado.

## Proteções e limites

- Os campos dos projetos são **dados de usuário não confiáveis**, não instruções de sistema. Não permitir que textos de projetos executem ferramentas ou ordenem novos compartilhamentos.
- O consentimento **não é salvo** como permissão geral nem é usado para outras conversas silenciosamente. O usuário pode desmarcá-lo antes de uma próxima mensagem.
- O envio de projetos ao Gemini depende de uma ação explícita. Não há consulta a Drive, Calendar, Notion, Gran ou Tavily adicional causada por esta opção.
- Informações detalhadas dos projetos e memória de conversas **ainda não são carregadas automaticamente**. A consulta é intencionalmente mínima.
- Com mais de oito projetos, o Gemini recebe somente um subconjunto e é avisado da incompletude. Não promete contexto completo.
- Há um limite intencional de 50 projetos na base LAB. Ainda não é um sistema de busca semântica nem um CRM de uso comercial amplo.
- Em caso de erro na consulta do DO ou schema inesperado, a chamada falha com erro explicativo em vez de enviar dados indevidos.

## Verificação para etapa posterior

- Build da interface e verificação TypeScript do Worker.
- Testes: opção desmarcada não consulta base; autorizada só lê projeto do UID; não expõe notas; limite de oito; campos inválidos falham; flag desativada falha; nenhuma criação de projetos.
- Após aprovação posterior: integrar PRs na sequência, testar em laboratório com projetos fictícios, conferir consentimento no iPhone e inspecionar apenas logs sem conteúdo pessoal.
- Antes de monitoramento automático: projetar memória persistente por projeto, busca por relevância e autorização granular (sem vazamento entre projetos).

Nenhuma credencial foi criada ou alterada; nenhum deploy, merge ou contratação de serviço foi feito.
