# SIGMA · Etapa 15 — internet sob demanda, isolada

## O que foi implementado
- Worker exclusivo do laboratório `sigma-jarvis-cerebro-lab`; o `sigma-cerebro` principal não foi modificado.
- Integração opcional com Tavily para pesquisa pública quando a intenção do usuário é explícita ou exige atualização.
- Reutiliza `worker/src/web-search.ts`, com resultados limitados, apenas URLs HTTPS e texto tratado como dado externo não confiável.
- Responde com uma seção de fontes clicáveis, separada do texto gerado pelo Gemini.
- A pesquisa NÃO consulta contas Google, documentos, agendas ou Firestore.
- Pesquisas públicas são enviadas à Tavily e partes das respostas ao Gemini; não reivindicar "privacidade total".
- É proibido pesquisar automaticamente ao conversar ou registrar relatos cotidianos sem necessidade.
- Redação de emails e números extensos antes da consulta, conforme `webSearchQuery`; não enviar segredos ou dados sensíveis.
- **Teto experimental próprio:** 3 buscas/dia, 30/mês, 1/minuto, por UID autorizado via Durable Object `LAB_QUOTA`; este limite não garante ausência de custos de outros serviços na conta.
- Os 15 turnos de chat por dia permanecem independentes das quotas de pesquisa.
- Quando a pesquisa explícita não funciona, o Worker retorna erro: **não deve inventar pesquisas nem fontes**.

## Gates antes da ativação
- `LAB_WEB_ENABLED=false` no TOML versionado, desativado por padrão.
- `TAVILY_API_KEY` precisa existir como segredo protegido **somente no Worker LAB**. Nunca registrar a chave em repositório, logs ou frontend.
- O workflow manual, no branch `main`, precisa de confirmação literal `PUBLICAR-APENAS-LAB`, `connect_lab_chat=true` e `connect_lab_web=true`.
- O workflow deve conferir que a chave Tavily existe no LAB antes de habilitar as buscas. Sem chave, falhar fechado.
- A rotina mantém somente Firebase Hosting channel `jarvis-lab`; nunca modificar a página principal ou fazer merge automaticamente.
- Não publicar o Worker via configuração `worker/wrangler.toml`.

## Plano de validação
1. Testes unitários (intenção, sem busca desnecessária, consultas higienizadas, URLs HTTPS, quota e comportamento sem segredo).
2. Verificar bloqueios de origem e de autenticação, com tokens de teste inválidos (não consomem pesquisa).
3. Testar em iPhone, usando uma pergunta com fatos atualizados e outra pergunta teórica sem pesquisa.
4. Conferir se a resposta exibe fontes clicáveis, sem afirmar que acessou Google Drive ou dados pessoais.

Observação: a Etapa 15 só estará concluída após uma pesquisa Tavily real confirmada no laboratório, não apenas testes com respostas simuladas.
