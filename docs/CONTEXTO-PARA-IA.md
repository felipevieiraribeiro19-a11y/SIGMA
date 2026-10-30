# SIGMA — contexto para outra IA

Documento autocontido. Quem ler isto não tem acesso ao repositório: tudo que for necessário para opinar está aqui.
Estado em **28/10/2026**, após a limpeza do repositório (PR #38).

---

## Como usar este documento

Cole o bloco abaixo **antes** do documento inteiro:

> Vou te enviar um documento de contexto sobre um projeto meu chamado SIGMA. Ele descreve o repositório, o que está publicado e o que está pendente. Não invente endpoints, arquivos ou funcionalidades que não estejam no documento — se faltar informação, pergunte. Responda em português do Brasil, de forma direta, e sinalize explicitamente quando estiver supondo algo. Depois de ler, me diga o que você entendeu em até 10 linhas antes de responder qualquer outra coisa.

---

## 1. O que é o SIGMA

Assistente pessoal em português, inspirado no Jarvis, para uso de **uma única pessoa** (o dono do projeto, Felipe). Interface de voz e texto, memória, consulta de agenda/arquivos e — no futuro — execução de ações. Roda como PWA no Firebase Hosting, com backend em Cloudflare Workers e IA via Gemini.

Não é produto comercial, não tem multiusuário, não tem cobrança. Tudo é gratuito ou está dentro de cota gratuita.

**Princípio que guia o código:** nada escreve fora do próprio SIGMA sem confirmação humana explícita. Ações externas (criar evento, apagar arquivo, enviar mensagem) são todas `planned` — existem como contrato, não como implementação.

---

## 2. O que está publicado hoje

| Peça | Onde | Situação |
|---|---|---|
| Interface (PWA) | `https://sigma-61328.web.app` | No ar. Publicada em 25/10 a partir da branch `sigma-home-beta-20261025` |
| Worker de produção | `sigma-cerebro.felipevieiraribeiro19.workers.dev` | No ar |
| Worker de laboratório | `sigma-jarvis-cerebro-lab.felipevieiraribeiro19.workers.dev` | No ar, flags de segurança desligadas |
| Firestore | projeto `sigma-61328`, caminhos `users/{uid}` | Em uso real, dados do Felipe |

**Nada foi publicado depois de 25/10.** O código mais novo (`sigma-work-integracao`, +76 commits, PR #37 mergeado em 27/10) **não está no ar**.

---

## 3. Estrutura do repositório (198 arquivos, ~1,1 MB)

```
src/                 interface React do Beta publicado (31 arquivos)
  jarvis-lab.tsx       entrada — monta o app
  JarvisChatPanel.tsx  painel de conversa (o maior arquivo, 42 KB)
  SigmaHud.tsx         HUD holográfico / orbe
  SigmaOrb.tsx         orbe animado
  SigmaVoice.tsx       voz (SpeechRecognition + TTS)
  LabDocumentsPanel / LabProjectsPanel / LabEcosystemPanel / LabRealMemory
  services.ts          cliente HTTP do Worker (a "API" do frontend)
  jarvis-lab-auth.ts   login Google no Firebase
  beta-data-reader.ts  leitura somente-leitura do banco (não usada pelo Beta ainda)

worker/src/          backend Cloudflare (47 arquivos)
  index.ts             worker de PRODUÇÃO (sigma-cerebro)
  chat-lab.ts          worker de LABORATÓRIO (sigma-jarvis-cerebro-lab)
  core/                regras de negócio puras e testáveis (orquestrador,
                       autorização, memória, projetos, estudos, ações)
  memory.ts, google.ts, web-search.ts, validation.ts

tests/               53 arquivos, 309 testes, sem rede, rodam em ~18 s
docs/arquivo/        34 relatórios e auditorias históricas (não são fonte atual)
scripts/             geração do HTML offline do laboratório
.github/workflows/   4 workflows: Verify, preview, publicar Beta, Worker
```

Build: `vite`. Entrada `sigma-beta.html` → `dist-sigma-beta/` → Firebase Hosting (`firebase.beta.json`).
`dist-*` nunca é versionado.

---

## 4. Backend de produção (`worker/src/index.ts`)

Autenticação: **JWT do Firebase verificado com chave pública** (`jose`, JWKS remoto). Não há senha, não há sessão própria. Além da assinatura, valida UID contra `ALLOWED_UID`.

CORS: lista exata de origens em `ALLOWED_ORIGINS`. Origem fora da lista recebe **403 antes de qualquer autenticação**.

Endpoints (todos exigem `Authorization: Bearer <idToken>`):

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/chat` | Conversa com Gemini. Aceita anexo (limite 10 MB) |
| GET | `/api/history` | Últimas 100 interações do Firestore |
| GET | `/api/agenda` | Próximos 7 dias da Agenda + nomes de PDFs recentes do Drive |
| GET | `/api/capabilities` | Catálogo do que existe (ver seção 6) |
| POST | `/api/actions/preview` | Prévia **somente leitura** de uma ação. Desligado por padrão (`ACTION_PREVIEW_ENABLED`) |

Variáveis de ambiente (Worker secrets/vars): `FIREBASE_PROJECT_ID`, `ALLOWED_UID`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `ALLOWED_ORIGINS`, `QUOTA` (Durable Object), opcionais `TAVILY_API_KEY`, `ACTION_PREVIEW_ENABLED`.

Se qualquer variável obrigatória faltar, o Worker responde **503** e não tenta degradar.

Outras invariantes:
- Corpo limitado a 15 MB, lido por stream com corte.
- `X-Turn-Id` dá idempotência ao par pergunta/resposta no Firestore.
- Token do Google (Agenda/Drive) trafega no header `X-Google-Token`, fica só na memória da aba e **nunca** é gravado no Firestore nem logado.
- Toda chamada carrega `X-Request-Id` para rastreio, sem dados pessoais.

## 5. Backend de laboratório (`worker/src/chat-lab.ts`)

Worker separado, com flags todas em `false` por padrão: `LAB_CHAT_ENABLED`, `LAB_WEB_ENABLED`, `LAB_MEMORY_ENABLED`, `LAB_MEMORY_AUTO_ENABLED`, `LAB_WORKSPACE_ENABLED`. Rotas sob `/api/lab/*` (memory, workspace, integrations, documents, oauth, actions/prepare).

Serve para testar memória, projetos, documentos e OAuth do Google **sem tocar nos dados de produção**. É a área onde as ideias são provadas antes de subir para o `index.ts`.

---

## 6. O que existe de verdade (catálogo `/api/capabilities`)

| Capacidade | Status |
|---|---|
| Conversa (Gemini) | ✅ disponível |
| Histórico no Firestore | ✅ disponível — **não** é memória estruturada |
| Pesquisa web (Tavily) | ⚙️ disponível se a chave existir; senão "não configurado" |
| Consultar agenda (leitura) | 🧪 prévia, exige OAuth do usuário |
| Listar arquivos do Drive (nomes) | 🧪 prévia, sem indexar conteúdo |
| Anexo por chat | 🧪 prévia, temporário |
| Voz (turnos) | 🧪 prévia — não é conversa contínua |
| Memória pessoal | ⛔ planejado |
| Biblioteca de documentos | ⛔ planejado |
| Criar/alterar agenda, organizar Drive | ⛔ planejado (escrita, exige confirmação) |
| Executar ações / acompanhamento proativo | ⛔ planejado |
| Trocar de modelo de IA | ⛔ planejado |

O código de memória, projetos e ações existe no worker de laboratório, mas está desligado e não é alcançável pela interface publicada.

---

## 7. Segurança — o que já foi resolvido

- Nenhum segredo no repositório. `GEMINI_API_KEY`, `TAVILY_API_KEY` e afins só existem como secret do Cloudflare.
- `public/config.json` contém apenas a configuração pública do Firebase (identifica o app, não autoriza nada). A chave da API Gemini nunca chega ao navegador.
- Regra do Firestore restringe cada usuário ao próprio `users/{uid}`.
- CSP configurada em `firebase.beta.json` com lista explícita de destinos.
- Nenhum deploy automático. Publicar exige workflow manual.
- Rotas de escrita não existem. O que não foi implementado não pode ser chamado por engano.

---

## 8. Como rodar e testar

```bash
npm ci --ignore-scripts
npm test            # 309 testes, sem rede, ~18 s
npm run build       # compila o Beta (src/jarvis-lab.tsx -> dist-sigma-beta)
npm run build:lab   # compila o laboratório
npm run check:worker
npm run dev         # Vite em 0.0.0.0, abre /sigma-beta.html
```

Node 22+. Nenhum teste acessa Firebase, Gemini ou Cloudflare de verdade — tudo é substituído por dublês controlados. **Não existe teste de ponta a ponta com conta real.**

---

## 9. Limpeza recente (28/10) — o que mudou

- 41 branches → 3. 37 apagadas; as que tinham trabalho não absorvido viraram tags `arquivo/nome-da-branch`.
- 20 workflows → 4. Os 16 removidos eram de laboratório, bundles e preflight; nenhum rodava havia 3 dias.
- `dist-worker-lab/worker.mjs` (206 KB compilado) saiu do versionamento.
- App antigo removido: `index.html`, `src/main.tsx`, `src/style.css`, `MediaControls`, `NeuralBackground`, `history.ts`. O Beta não usava nada disso.
- 34 relatórios históricos movidos para `docs/arquivo/`.
- `main` passou a apontar para o commit **publicado** (antes estava parada em 22/10, com código antigo e diferente do que está no ar).
- Testes: 314 → 309 (saíram junto com o que deixou de existir). Todos passando.

---

## 10. Problemas conhecidos e decisões pendentes

1. **GitHub Actions está morto.** Todos os jobs falham em ~3 s sem executar nada: conta com pagamento pendente / limite de gastos. Nenhum CI roda desde 25/10. Os testes só rodam localmente. **Isso não é bug de código.**
2. **O workflow de publicação não consegue publicar.** O job `publicar` exige `head_ref` de três branches que já não existem e `base_ref == sigma-beta-preparacao-20261024`. Publicar hoje teria que ser por CLI.
3. **Código publicado ≠ código no repositório.** `sigma-work-integracao` tem 76 commits a mais, incluindo o PR #37 (Agenda/Drive read-only restaurados + correções de CSP e cache). Precisa de decisão: publicar ou não.
4. **`main` = produção, `sigma-work-integracao` = desenvolvimento.** Sem CI, nada impede que os dois divirjam mais.
5. **Cota do Gemini** não foi medida em uso real. O modelo em uso é `gemini-3.5-flash-lite` e não há contador durável de consumo — só um Durable Object de rate limit.
6. **Nenhum teste de ponta a ponta.** Login, gravação no Firestore e resposta real do Gemini não são cobertos por teste automatizado; só por uso manual.

---

## 11. O que eu quero de você

_(escolha uma ou apague)_  — *nota para o Felipe: edite este trecho conforme o que for pedir.*

- **Revisão de arquitetura:** o que está errado ou frágil na separação entre `index.ts` (produção) e `chat-lab.ts` (laboratório)?
- **Plano de publicação:** como levar `sigma-work-integracao` ao ar com segurança, sem CI, com rollback claro?
- **Próxima funcionalidade:** memória pessoal estruturada — como projetar sem virar armadilha de privacidade?
- **Diagnóstico:** o que você faria para descobrir se a cota do Gemini está sendo respeitada?

---

## 12. Regras para a IA que está lendo

- Não invente rotas, arquivos, variáveis ou telas. O que não está aqui, não existe — pergunte.
- Toda sugestão de escrita externa (calendário, arquivos, mensagens) deve manter a exigência de confirmação humana.
- Não proponha guardar segredo no frontend, no Firestore ou no repositório.
- Se sugerir dependência nova, justifique o custo: o projeto é gratuito e sem orçamento.
- Diga claramente quando estiver supondo algo que o documento não afirma.
