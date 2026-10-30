# SIGMA — estado atual

Documento de retomada. Escrito em **30/10/2026**, ao final de uma série de sessões de trabalho na branch `arena/465d674a-sigma` (PR #38, **aberto, não mesclado**).
Se você voltar daqui a duas semanas, leia esta página antes de qualquer outra.

---

## Em uma frase

O SIGMA que está no ar **não mudou nada**. Todo o trabalho destas sessões está no repositório, testado localmente, **sem deploy** — e depende de três coisas fora do código para virar realidade: billing do GitHub Actions, um OAuth Client no Google Cloud, e renovar o canal do laboratório.

---

## 1. O que está no ar hoje

| Peça | Endereço | Situação |
|---|---|---|
| Interface Beta (PWA) | `https://sigma-61328.web.app` | No ar, publicada em 25/10 |
| Worker de produção | `sigma-cerebro.felipevieiraribeiro19.workers.dev` | No ar |
| Worker de laboratório | `sigma-jarvis-cerebro-lab.felipevieiraribeiro19.workers.dev` | No ar, **todas as flags desligadas** |
| Firestore | projeto `sigma-61328` | Em uso, dados reais |

Confira a qualquer momento:

```bash
npm run smoke:prod        # barreiras de segurança da produção, sem credencial
```

**O código no ar é o commit `3633ca1`** — que é exatamente o que a branch `main` aponta. Ou seja: `main` = produção, e é a referência correta.

---

## 2. Os três ambientes

| | Produção | Laboratório |
|---|---|---|
| Worker | `sigma-cerebro` → `worker/src/index.ts` | `sigma-jarvis-cerebro-lab` → `worker/src/chat-lab.ts` |
| Config | `worker/wrangler.toml` | `worker/wrangler.chat-lab.toml` |
| Rotas | `/api/chat`, `/api/history`, `/api/agenda`, `/api/capabilities`, `/api/actions/preview` | `/api/lab/*` |
| Firestore | Sim, dados reais | Não — Durable Objects isolados |
| Modelo | Gemini | Gemini (padrão) ou roteador |
| Onde testar | `npm run smoke:prod` | `npm run smoke` |

O laboratório existe para provar ideias sem tocar nos dados de produção. Nada que está nele tem efeito no site.

---

## 3. Flags: o que está ligado e o que cada uma destrava

Tudo em `worker/wrangler.chat-lab.toml`. **Todas desligadas** — é o estado seguro.

| Flag | Valor | Destrava |
|---|---|---|
| `LAB_CHAT_ENABLED` | `false` | Conversa real no laboratório |
| `LAB_MEMORY_ENABLED` | `false` | Memória pessoal (Durable Object) |
| `LAB_MEMORY_AUTO_ENABLED` | `false` | Consulta contextual automática de memórias |
| `LAB_WORKSPACE_ENABLED` | `false` | Projetos e tarefas |
| `LAB_BRAIN_ENABLED` | `false` | Propostas de projeto/tarefa pelo modelo |
| `LAB_CONNECTORS_ENABLED` | `false` | Agenda, Drive, Notion |
| `LAB_ACTIONS_ENABLED` | `false` | Ações externas (com confirmação) |
| `LAB_DOCUMENTS_ENABLED` | `false` | Índice de documentos |
| `LAB_WEB_ENABLED` | `false` | Pesquisa Tavily |
| `GOOGLE_OAUTH_ENABLED` | `false` | **Cofre OAuth persistente** |
| `LAB_PROVIDER` | ausente | Roteador de modelos (ausente = Gemini) |

Produção (`worker/wrangler.toml`) não tem flags de recurso — só `ALLOWED_ORIGINS`, modelo e projeto.

---

## 4. O que foi construído nestas sessões

10 commits, todos com teste. Resumo por área:

### Limpeza (commit `2eb1641`)
- 41 branches → 3. As que tinham trabalho não absorvido viraram 15 tags `arquivo/*`.
- 20 workflows → 4: `check.yml`, `sigma-preview.yml`, `sigma-beta-production-authorized.yml`, `sigma-cloudflare.yml`.
- `dist-worker-lab/worker.mjs` (206 KB compilado) saiu do versionamento.
- App antigo removido: `index.html`, `src/main.tsx`, `src/style.css`, `MediaControls`, `NeuralBackground`, `history.ts`.
- 34 relatórios históricos → `docs/arquivo/`.

### OAuth persistente (commits `f4641b7`, `3d2466c`)
- O cofre já existia (`lab-google-oauth.ts`): PKCE, state de uso único, AES-256-GCM por UID, renovação automática.
- **Novo:** `resolveGoogleToken()` — sem cabeçalho `X-Google-Token`, o Worker pega o access token do cofre. Aplicado nos 4 pontos que liam o token.
- Regra: cabeçalho continua tendo prioridade; o fluxo antigo não mudou.

### Aprendizado contínuo (commit `b7848ff`)
- Memórias ganharam `kind`: `fato | preferencia | correcao | rotina`, retrocompatível (registros antigos = `fato`).
- Reconhecedores novos: "na verdade…", "pare de…", "corrija…", "todo dia…".
- O prompt separa **longo prazo** (o que você ensinou) de **curto prazo** (a conversa).
- Continua exigindo aprovação humana e bloqueando PII.

### Roteador de modelos (commit `539fc1b`)
- `worker/src/core/providers.ts`: DeepSeek (`deepseek-flash`), OpenAI (`gpt-6-luna`), Claude (`claude-sonnet-4-5`) e Gemini.
- Ativa por `LAB_PROVIDER`. Ausente = Gemini, caminho de código idêntico ao anterior.
- Provedor não-Gemini responde **só texto** (propostas de tarefa exigem function calling do Gemini).

### Ferramentas de verificação (commits `ce0a8f9`, `4b87818`, `248d48b`)
- `npm run check:lab` — consistência offline entre Worker, CSP e frontend.
- `npm run smoke` — fumaça do laboratório.
- `npm run smoke:prod` — fumaça da produção (**chat opt-in**, porque grava no Firestore).

### Correções que importam (commit `ca34728`)
- A interface dizia "Gemini" mesmo com DeepSeek/Claude respondendo — 10 textos, afirmando destino errado dos seus dados.
- `.env.lab`: o build do laboratório saía **sem URL de API** desde a limpeza (a variável só existia no workflow removido).

---

## 5. Comandos do dia a dia

```bash
npm ci --ignore-scripts     # instalar
npm test                    # 367 testes, sem rede, ~20 s
npm run check:worker        # typecheck do Worker
npm run check:lab           # consistência de configuração
npm run build:lab           # build do laboratório
npm run build               # build da Beta (produção)

npm run smoke               # fumaça do laboratório
npm run smoke:prod          # fumaça da produção
npm run smoke:prod -- --token-file /tmp/token.txt --chat   # inclui o chat (GRAVA no Firestore)
```

---

## 6. Bloqueado, e não é código

| Bloqueio | Consequência | Quem resolve |
|---|---|---|
| **Billing do GitHub Actions** | Nenhum CI roda desde 25/10; jobs falham em 3 s sem executar | Você (GitHub → Billing) |
| **OAuth Client no GCP** | Cofre responde 503; OAuth não testável | Você — `docs/ROTEIRO-OAUTH-GOOGLE.md` |
| **Canal do laboratório** | `sigma-61328--jarvis-lab-pw5dmfbc.web.app` foi criado em 24/10 e **provavelmente expirou**; sem interface, não há como clicar em "Conectar" | Você — `docs/CHECKLIST-ANTES-DO-GCP.md` |
| **Workflow de publicação da Beta** | O job exige `head_ref` de branches que não existem mais; publicar só por CLI | Decisão sua |

---

## 7. Próximos passos, em ordem

1. `npm run check:lab` — deve passar com 2 avisos (flags desligadas, canal de preview).
2. **Renovar o canal do laboratório** — comando em `docs/CHECKLIST-ANTES-DO-GCP.md`. Se a URL mudar, atualizar `ALLOWED_ORIGIN` e rodar `check:lab` de novo.
3. **Criar o OAuth Client** — `docs/ROTEIRO-OAUTH-GOOGLE.md`, Partes 1 a 3.
4. Ligar `GOOGLE_OAUTH_ENABLED = "true"`, `wrangler deploy`, `npm run smoke`.
5. Decidir o que fazer com o PR #38: mesclar em `main` (que é produção) ou manter como linha de desenvolvimento.
6. Quando o billing voltar, trocar o gatilho de publicação por `workflow_dispatch` com confirmação digitada.

---

## 8. Armadilhas conhecidas

**O checkout local volta para um commit antigo sozinho.** Aconteceu 6 vezes. Sintoma: `git log` mostra `db16837`, e `git status` lista dezenas de arquivos deletados.
Conserto, sempre:

```bash
git fetch origin arena/465d674a-sigma
git reset --hard origin/arena/465d674a-sigma
```

**Nunca use `git add -A` neste repositório.** Numa das vezes o commit capturou a árvore inteira e ia reintroduzir o app antigo e os 16 workflows removidos. O push falhou por não ser fast-forward e nada chegou ao GitHub. Adicione arquivo por arquivo.

**`POST /api/chat` de produção grava no seu Firestore.** Por isso o `smoke:prod` não chama o chat sem `--chat`.

**Canal de preview do Firebase expira.** `ALLOWED_ORIGIN` aponta para um. `check:lab` avisa, mas só você pode renovar.

**App OAuth em modo "Em teste" expira o refresh token em 7 dias.** O código sinaliza como "Precisa reconectar" em vez de falhar em silêncio. Ver o fim de `docs/ROTEIRO-OAUTH-GOOGLE.md`.

**`/api/agenda` em produção exige `X-Google-Token` da sessão.** O cofre é só do laboratório; produção não foi tocada.

---

## 9. Mapa da documentação

| Documento | Para quê |
|---|---|
| `README.md` | visão do projeto e estrutura |
| `docs/CHECKLIST-ANTES-DO-GCP.md` | **comece aqui** para destravar o OAuth |
| `docs/ROTEIRO-OAUTH-GOOGLE.md` | passo a passo do GCP ao deploy |
| `docs/ROTEIRO-ROTEADOR-MODELOS.md` | trocar de provedor |
| `docs/ROTEIRO-TESTE-FUMACA.md` | os dois testes de fumaça |
| `docs/CONTEXTO-PARA-IA.md` | documento autocontido para enviar a outra IA |
| `docs/arquivo/` | 34 relatórios históricos — **não são fonte atual** |

---

## 10. Números

- 367 testes, 0 falhas, sem rede
- 213 arquivos rastreados, 1,2 MB de código
- 4 branches: `main` (produção), `sigma-home-beta-20261025` (deploy), `sigma-work-integracao` (desenvolvimento, não publicada), `arena/465d674a-sigma` (esta linha)
- 15 tags `arquivo/*`
- 4 workflows
- 10 commits nesta linha, PR #38 aberto
