# SIGMA — Fundação 0.1

Projeto novo. Nenhum código ou configuração do Jarbas foi reutilizado.

## Estado real

Interface implementada. Firebase, Worker Cloudflare e Hosting **publicados** (verificado em 21/10/2026 pelos runs do GitHub Actions e pelo site no ar), mas o comportamento em tempo de execução ainda não foi validado: segredo Tavily, claim administrativa, regras publicadas no console e identificador do modelo Gemini. Nenhuma resposta é simulada no aplicativo.

O repositório GitHub privado é este (`felipevieiraribeiro19-a11y/SIGMA`). Todo deploy parte da branch `sigma-work-integracao`; `main` está atrás dela e não publica nada.

Divisão de canais: `sigma-production` publica apenas Hosting; `sigma-cloudflare` publica apenas o Worker; `sigma-preview` publica o canal temporário `integracao`; `sigma-firestore-rules` publica apenas `firestore.rules`, de forma manual e com confirmação, porque as regras são um protótipo e publicá-las erradas bloqueia o aplicativo.


## Desenvolvimento

Node 22+; executar `npm ci`, `npm run dev`, `npm run build`, `npm test` e `npm run check:worker`.

- `src/`: React/TypeScript, login Google, Firestore e cliente do chat.
- `public/config.json`: somente configuração pública Firebase e URL do Worker.
- `worker/src/`: endpoint `/api/chat`, autenticação criptográfica, Gemini e quota transacional.
- `worker/wrangler.toml`: configuração de TESTES; valores vazios falham de forma fechada.
- `firestore.rules`: regras protótipo, acesso por UID + custom claim administrativa.
- `tests/`: testes automatizados, incluindo falhas e recusas.
- `docs/STATUS.md`: resultados e pendências.

## Ativação, a conduzir uma ação por vez

1. Criar projeto Firebase NOVO para testes, plano Spark, Firestore STANDARD. Escolher região antes de criar o banco. Não vincular faturamento.
2. Cadastrar app web, habilitar Google Authentication e autorizar exatamente o domínio da avaliação. Configuração pública vai em `public/config.json`; jamais colocar chave Gemini ali.
3. Fazer primeiro login e obter UID. Por ambiente administrativo confiável, atribuir custom claim `sigmaAccess: true` exclusivamente ao proprietário. Fazer logout/login para renovar token. Regras não permitem ao cliente conceder essa claim.
4. Validar regras nos emuladores e implantar regras apenas no projeto de testes. Confirmar leitura/gravação de `users/{uid}/settings/app`, acesso negado a outro usuário e ausência de acesso sem login.
5. Na Cloudflare Free, configurar `FIREBASE_PROJECT_ID`, `ALLOWED_UID`, `ALLOWED_ORIGINS` (origens exatas separadas por vírgula) e `GEMINI_MODEL` após verificar modelo/cota reais. Criar o segredo `GEMINI_API_KEY` via mecanismo de secrets do Wrangler/console. Nunca enviar segredo por chat, arquivos públicos ou Git.
6. Implantar Worker e Durable Object SQLite de quota com configuração de testes. A cota de app é de 5 chamadas/minuto e 60/dia por usuário, reset diário UTC. Cada tentativa autorizada consome cota, mesmo em falha do provedor. Custos de plataforma dependem do plano; não habilitar upgrades automaticamente. A quota NÃO substitui a cota real Gemini.
7. Colocar URL HTTPS do Worker em `public/config.json`, rebuild e republicar avaliação. Fazer conversa real de múltiplos turnos, validar erro de API, usuário estranho e token vencido.
8. Somente depois: criar ambientes de produção separados, preencher configurações próprias e implantar Firebase Hosting clássico. `npx -y firebase-tools@latest deploy --only hosting,firestore:rules --project ID_EXPLICITO` após testes e seleção explícita do destino.

## Privacidade

A Fase 1 mantém mensagens somente na RAM da página. Não usa localStorage para conversas nem Firestore para histórico. Logout/reload encerra a conversa. A exportação JSON é local e pode conter texto pessoal; guarde com cuidado. O login usa persistência de sessão Firebase. O service worker guarda apenas o ícone. Não há funcionamento de IA offline nem notificações.

Configuração Firebase web é pública por natureza; a proteção é feita por regras e autenticação. A chave Gemini é secreta e existe exclusivamente no backend. O Worker não envia e-mail, nome ou UID ao Gemini; envia texto e contexto autorizado da sessão. Nenhum conteúdo de conversa é logado. O backend registra apenas código HTTP e identificador da requisição.

Gemini gratuito: não enviar conteúdo pessoal, confidencial ou sensível. Termos: https://ai.google.dev/gemini-api/terms . Resolver privacidade antes de implementar memória pessoal persistente. O servidor verifica assinatura, emissor, audiência e expiração do ID token, conta permitida, provedor Google e e-mail verificado. Revogação instantânea de sessões Firebase não foi implementada: remover `ALLOWED_UID` bloqueia acesso à IA; remover claim exige renovação/expiração do token para refletir nas regras.

## Testes e retorno de versão

Testes de integração usam provedor substituto apenas dentro do runner, nunca na aplicação. Não constituem teste real Gemini. Um release só deve ser marcado funcional após teste real documentado. No GitHub: PR com build, tipos e testes; tags de releases. Não fazer deploy automático em push. Para rollback: voltar a release anterior, recompilar e publicar; mudanças futuras de esquema exigem plano próprio, não basta reverter frontend.

## PWA

Manifesto, ícone e service worker mínimos. Instalação e login em modo standalone precisam ser validados num iPhone real; não afirmar equivalência a app nativo. Sem cache de chat, banco ou endpoints privados.

## Security Rules review notice

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for owner-only settings access with an administrative access claim, strict field validation and default denial. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

## Atualização: estudos por conversa (20/10/2026)

O estado atualizado está em `docs/STATUS.md`, que substitui descrições anteriores sobre memória somente local. A configuração pública permanece vazia; não há conexão ativa presumida. O backend agora exige Firestore Standard com as regras de `firestore.rules`, usuário autorizado via claim `sigmaAccess`, e usa o token Firebase verificado para acessar somente `users/{uid}/turns`. Nunca usa chave administrativa no navegador.

As regras são um protótipo que restringe os registros ao dono autenticado com claim administrativa e valida campos/tamanho/data. Precisam de revisão e verificação antes da ativação ou compartilhamento amplo. A consulta retorna 100 interações recentes; a exportação da interface é parcial. O catálogo Gran e estatísticas estruturadas não estão implementados.
