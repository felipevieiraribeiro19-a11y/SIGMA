# SIGMA — Conectar todos os serviços em uma única etapa

## Antes de publicar
Apenas quando a revisão da versão integrada for aprovada. O código está na branch `sigma-ecossistema-integracoes`; testes de GitHub Actions não equivalem a uso real em contas Google/Notion.

### 1. Cloudflare
No Worker **`sigma-jarvis-cerebro-lab`** (não no `sigma-cerebro`), conferir:
- Secret existente `GEMINI_API_KEY` — já usado pelo chat;
- Secret existente `TAVILY_API_KEY` — pesquisa;
- Secret existente `ALLOWED_UID` — sua conta autorizada;
- **Novo secret `NOTION_API_KEY`** — token da integração interna do Notion, nunca no GitHub ou frontend;
- Secret já configurado do fluxo GitHub Actions `CLOUDFLARE_API_TOKEN` deve permanecer no GitHub Secrets, sem copiar para código.

Não publicar segredos em prints, chats ou arquivos. As flags do Worker experimental são ativadas só pelo workflow manual; os arquivos versionados têm flags `false`.

### 2. Google Cloud / Firebase Authentication
No projeto **`sigma-61328`**:
- Habilitar as APIs **Google Calendar API** e **Google Drive API**.
- Verificar tela de consentimento OAuth do projeto usado pelo Firebase Auth: registrar escopos e, se estiver em testes, sua própria conta como test user.
- Escopos de **leitura**: `calendar.events.readonly` e `drive.metadata.readonly`.
- Escopos de **escrita com confirmação**: `calendar.events` e `drive.file`; este último só alcança arquivos/pastas geridos com o aplicativo, não sua biblioteca inteira.
- Verificar domínio autorizado do Firebase Authentication, inclusive URL do canal `jarvis-lab`.
- **Não recriar** Workload Identity Federation, chave de serviço, client Firebase ou OAuth se os atuais já atendem.
- Google pode exigir verificação de aplicativo/escopos para distribuição pública. Este laboratório é de usuário único/teste.

### 3. Notion
- Criar conexão/integracão **interna** chamada SIGMA no workspace certo, com capacidades de ler conteúdo e inserir conteúdo (somente se quiser criar páginas).
- Compartilhar explicitamente com a conexão a página-mãe e as páginas que o SIGMA poderá ler. Conexão sem página compartilhada não enxerga dados.
- Guardar token em `NOTION_API_KEY` como segredo no Worker LAB.
- Usar ID da página-mãe para criar páginas filhas após revisão.

### 4. Publicação única via GitHub
Somente depois de validar a documentação e configurar permissões:
- Workflow: `SIGMA - ecossistema LAB: publicar tudo uma vez` em GitHub Actions, branch `main`, confirmação `PUBLICAR-ECOSSISTEMA-LAB`.
- Esse fluxo compila o commit fixado, roda testes, valida segredos exigidos, altera apenas flags do Worker **LAB**, publica apenas o canal Firebase Hosting **jarvis-lab**, sem modificar o ambiente principal.
- Não é necessário colar API keys no GitHub ou navegador. O único novo segredo esperado é o `NOTION_API_KEY` no Cloudflare; permissões Google são concedidas pelo OAuth no navegador.

### 5. Teste final depois de publicar
1. Fechar e reabrir Safari: login Firebase permanece, memória aprovada persiste.
2. Salvar um estudo fictício e uma tarefa, reabrir: ambos permanecem na lista.
3. Enviar "Meu objetivo é organizar o Projeto Alfa" e revisar a sugestão; testar rejeição e aprovação.
4. Conectar Google com leitura; listar agenda e arquivos recentes.
5. Buscar páginas Notion liberadas e ler blocos pelo ID.
6. Selecionar a fonte no chat, perguntar sobre ela; confirmar recibo de integração.
7. Criar proposta de reunião fictícia; revisar, confirmar uma vez; conferir diretamente no Google Calendar. Não repetir se o resultado ficar incerto.
8. Criar uma pasta fictícia e página Notion fictícia com confirmação. Excluir manualmente no serviço se desejar limpar os testes.
9. Garantir que o SIGMA principal permaneceu intacto.

## Fontes de referência
- Google OAuth scopes: https://developers.google.com/identity/protocols/oauth2/scopes
- Google Drive API: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- Google Calendar API: https://developers.google.com/workspace/calendar/api/auth
- Notion internal connections: https://www.notion.com/help/create-integrations-with-the-notion-api
- Notion API/versioning: https://developers.notion.com/reference/versioning

## Cuidados
`GEMINI_API_KEY`, `TAVILY_API_KEY` e `NOTION_API_KEY` são segredos. Não enviá-los em mensagens. A autorização Google das APIs de serviço é separada do login que persiste; ela é solicitada apenas quando usar a integração.

**Situação:** conectores estão prontos em código, sem garantia de funcionamento real até validar permissões e fazer testes com conta autorizada.
