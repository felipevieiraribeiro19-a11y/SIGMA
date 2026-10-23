# SIGMA — Parte 1: Biblioteca e sincronização incremental de documentos

**Status:** código desenvolvido na branch isolada `sigma-documentos-sincronizacao`. Nenhum documento real foi importado nem houve publicação do laboratório ou da produção. Esta etapa aguarda validação funcional após a conexão final das contas.

## O que foi implementado

- **Biblioteca indexada por proprietário:** novo Durable Object `LabDocumentIndex`, separado das memórias, dos chats e dos outros módulos. Cada conta Firebase autorizada recebe seu armazenamento isolado.
- **Dois conectores reais preparados em código:** inventário de Google Drive e páginas compartilhadas do Notion, sempre por chamada explicitamente solicitada.
- **Leitura completa de inventário antes de alterar o índice:** paginação limitada a 180 documentos no conjunto. Se a fonte falhar, responder com erro, exceder o limite ou interromper a paginação, a sincronização é cancelada e o índice anterior é preservado.
- **Detecção de mudanças:** compara ID, versão, título, data, tipo e link; identifica novos, modificados, inalterados e ausentes. Arquivos ausentes são removidos **somente do índice SIGMA**, jamais do Drive ou do Notion.
- **Prevenção de conteúdo desatualizado:** se a versão do documento mudou e ainda não foi possível reextrair seu texto, o SIGMA deixa esse documento como **somente metadados**; não responde com trecho antigo.
- **Extração opcional e limitada de texto:** até 8 Google Docs ou arquivos `.txt` mediante autorização ampliada do usuário, além de até 8 páginas Notion em leitura superficial dos blocos. **PDF não é extraído nesta primeira parte**. Arquivos muito grandes não são lidos integralmente.
- **Pesquisa por palavras:** títulos e trechos de texto disponíveis, resultados com origem, link e indicação da situação do conteúdo. Ainda não há busca semântica.
- **Chat com biblioteca opt-in:** opção para usar até três resultados encontrados como contexto no Gemini; apresenta referências `[D1]` etc., sem importar automaticamente toda a biblioteca para a conversa.
- **Controle e privacidade:** autenticação Firebase e UID, domínio exato do laboratório, autorização OAuth em memória temporária, segredo Notion apenas no Worker, exclusão seletiva do índice, nenhuma escrita nos documentos originais.
- **Cotas:** até 5 tentativas de sincronização por dia, até 45 por mês e intervalo mínimo de 60 segundos por conta no laboratório.

## Como a futura versão será utilizada

1. Você abre o SIGMA e entra com o Google como já faz.
2. Na seção **Biblioteca de documentos**, escolhe Drive ou Notion.
3. Para o Drive, você autoriza **somente metadados** ou, separadamente, **leitura de conteúdo**. Esta última permissão é mais abrangente.
4. Decide se quer incluir trechos textuais e toca em **Sincronizar agora**.
5. O SIGMA compara o inventário atual com o último sincronizado e mostra a quantidade de documentos novos, alterados, removidos do índice ou inalterados.
6. Você pesquisa na biblioteca pelo assunto; o resultado oferece link para o original.
7. Quando desejar, marca a opção de consultar a biblioteca em uma conversa com Gemini.

## Limitações e próximos incrementos
- **Não sincroniza continuamente em segundo plano**: isso é a próxima parte de monitoramento autônomo.
- **Não extrai conteúdo de PDFs nem executa OCR**: requer módulo específico de extração e custos/cotas adequados.
- **Não indexa todos os arquivos arbitrariamente**: Drive nesta etapa lista Google Docs, PDFs e `.txt`; Notion lista páginas acessíveis, até o limite.
- **Conteúdo parcial:** primeira página dos blocos Notion (até 100 blocos por página selecionada); blocos filhos aninhados e conteúdos muito longos podem ficar de fora. A indicação "texto indexado" não significa documento completo.
- **Pesquisa é textual/lexical**, sem embeddings nem respostas garantidamente exaustivas.
- **Google OAuth de leitura ampliada é opcional** e pode exigir configuração/consentimento adicional. O token de serviço não persiste entre sessões como o login Firebase.
- **Não altera nomes, pastas, exclusões ou permissões nas fontes externas.** A ação de apagar o índice local jamais apaga o original.
- **Não há autosincronização, webhooks, notificações nem agendador** nesta fase.

## Estrutura técnica
- `worker/src/core/document-source-readers.ts`: inventário paginado Google/Notion, extração textual opcional, sem operações de escrita.
- `worker/src/core/document-index.ts`: validação do lote, comparação incremental, busca lexical.
- `worker/src/lab-document-index.ts`: índice transacional isolado no Cloudflare Durable Objects.
- `worker/src/chat-lab.ts`: rotas autenticadas, limites, busca local opt-in no chat.
- `src/LabDocumentsPanel.tsx`: tela móvel de sincronização, pesquisa e exclusão do índice.
- `src/jarvis-lab-auth.ts`: permissões OAuth de Drive separadas entre metadados e conteúdo.
- `src/JarvisChatPanel.tsx`: compartilhamento explícito de resultados indexados com Gemini.
- `worker/wrangler.chat-lab.toml`: binding `LAB_DOCUMENT_INDEX` e flag `LAB_DOCUMENTS_ENABLED=false` por padrão.
- `tests/sigma-documents.test.ts` e `tests/sigma-document-chat.test.ts`: casos de mudança, falha, autenticação, paginação e autorização do chat.

## Plano de publicação
**Não publicar esta branch isolada ainda.** Depois da revisão do usuário e da etapa de monitoramento, incorporar o código aprovado à branch de ecossistema e atualizar o workflow de implantação única para o commit final validado. A implantação deve permanecer restrita ao Worker `sigma-jarvis-cerebro-lab` e ao canal Hosting `jarvis-lab`, sem alterar `sigma-cerebro` ou o Hosting principal.

As chaves do Google/Notion NÃO foram incluídas no repositório. Os testes automatizados usam dados fictícios e não substituem a validação real com contas autorizadas.
