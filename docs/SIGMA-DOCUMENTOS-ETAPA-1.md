# SIGMA — Documentos, etapa 1: catálogo e sincronização segura

**Estado: implementado em código e isolado na branch `sigma-documentos-sync-etapa1`. Não foi publicado.**

## Objetivo desta etapa

Organizar metadados de documentos provenientes do Google Drive e Notion, identificar modificações entre varreduras completas e manter um índice pesquisável dentro do SIGMA.

O índice tem finalidade **informativa**. Nenhuma ação no SIGMA apaga ou edita um documento na conta de origem. Os documentos marcados como ausentes são registros do índice que não apareceram no último levantamento completo, **não confirmação de exclusão na origem**.

## Funcionalidades incluídas

1. **Leitura paginada e limitada** de metadados de Google Drive e das páginas do Notion compartilhadas com a integração.
2. **Índice persistente e separado por usuário e fonte** em um Durable Object exclusivo do laboratório, sem Firestore de produção.
3. **Detecção de diferenças**: novos arquivos, alterações de nome/data/tipo/link, arquivos que deixaram de aparecer e documentos sem mudança.
4. **Atualização atômica**: todas as páginas precisam terminar antes de substituir o índice. Resposta parcial, falha HTTP, cursor inválido ou busca incompleta preservam o índice anterior.
5. **Varredura por etapas**, com botões iniciar, continuar, cancelar. Uma única operação por página remota; nada roda em segundo plano nesta etapa.
6. **Pesquisa local de metadados** por nome/tipo com opção de visualizar registros ausentes.
7. **Status das varreduras**, horário da última conclusão e resumo das diferenças, sem expor tokens ou cursores ao navegador.
8. **Controle de escala inicial**: até 100 documentos por página, 10 páginas/1.000 documentos por fonte e 20 minutos por varredura. Bibliotecas maiores exigirão paginação/armazenamento aprimorados antes da publicação.

## Fluxo após autorizar integrações

No painel **9. Biblioteca de documentos**, o usuário escolhe Google Drive ou Notion, consulta o status e inicia a varredura. Se a resposta tiver uma próxima página, o usuário toca em **Continuar**. Ao chegar ao fim, o SIGMA compara os metadados, substitui apenas o índice da fonte e mostra quantos registros foram criados, alterados ou ficaram ausentes.

A sessão Google para Drive requer `drive.metadata.readonly`; o token só é repassado durante aquela requisição e não fica salvo no índice. Notion usa o segredo já previsto `NOTION_API_KEY` exclusivamente no Worker. O SIGMA só vê dados que as permissões externas permitem visualizar.

## Limites atuais: o que **não** está pronto nesta etapa

- Não foi implementada extração de texto ou conteúdo de PDFs, Google Docs, planilhas e blocos de páginas.
- Ainda não há embeddings, RAG semântico, buscas no corpo dos documentos ou respostas do Gemini fundamentadas no catálogo.
- Não há sincronização incremental por `changes.list`/webhooks: cada varredura faz comparação de um catálogo completo; isso pode consumir muitas chamadas para bibliotecas grandes.
- Não há cron, gatilhos de alterações, alarmes persistentes ou monitoramento 24 horas.
- A marcação de ausente pode indicar documento removido, permissão revogada, filtro de acesso ou indisponibilidade da fonte; não produz exclusão remota.
- O índice ainda não suporta mais de 1.000 itens por origem e exige testes reais de consentimento/OAuth e Notion.
- Nenhuma chave nova foi criada; nenhum workflow de publicação foi acionado.

## Segurança e implantação futura

- Código: `worker/src/core/sigma-document-index.ts`, `sigma-document-pages.ts`, `worker/src/lab-documents.ts`, `worker/src/lab-document-api.ts`, `src/LabDocumentLibrary.tsx`.
- Rotas: `GET /api/lab/documents/status`, `GET /api/lab/documents/list`, `POST /api/lab/documents/sync` (ações `start`, `continue`, `cancel`).
- Acesso exclusivo: origem do laboratório + autenticação Firebase + UID permitido.
- Configuração futura: `LAB_DOCUMENTS` em Durable Objects, migração `v5`, e `LAB_DOCUMENTS_ENABLED=false` por padrão.
- O workflow de publicação única atualmente aponta para uma versão anterior do ecossistema. **Não atualizá-lo ou executá-lo até que as próximas etapas e a revisão final estejam concluídas.**
- Arquivo não persiste token, conteúdo, transcrição ou corpo dos documentos. O índice pode conter nomes de documentos: também são dados pessoais e ficam limitados ao armazenamento isolado da conta.

## Próxima etapa proposta

**Etapa 2: conteúdo e respostas com fontes.** Construir extratores controlados de texto (PDF/Google Docs/Notion), fragmentação, pesquisa de trechos com citação e exclusão/atualização de fragmentos quando a versão do documento mudar, respeitando limites de custos.

Após sua revisão, só então iniciar a etapa 2.
