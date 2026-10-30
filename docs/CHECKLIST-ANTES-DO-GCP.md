# Checklist antes de configurar o GCP

Rode isto primeiro, da raiz do repositório:

```bash
npm ci --ignore-scripts
npm run check:lab      # confere Worker ↔ CSP ↔ frontend
npm test               # 355 testes, sem rede
```

Se `check:lab` reclamar, corrija antes de seguir — ele pega justamente os desencontros que só apareceriam depois do deploy.

---

## A interface do laboratório pode ter expirado

O laboratório é servido por um **canal de preview** do Firebase:

```
https://sigma-61328--jarvis-lab-pw5dmfbc.web.app
```

Canais de preview expiram (normalmente em 7 dias). O canal `jarvis-lab` foi criado em 24/10 — **provavelmente já expirou ou expira em horas**. Sem a interface no ar, não há como clicar em "Conectar permissão" e testar o OAuth.

Renove antes de tudo:

```bash
npm run build:lab
npx --yes firebase-tools@latest hosting:channel:deploy jarvis-lab \
  --project sigma-61328 --config firebase.lab.json --expires 30d
```

O comando imprime a URL do canal. **Se a URL mudar**, você precisa atualizar três lugares e rodar `npm run check:lab` de novo:

| Onde | Variável |
|---|---|
| `worker/wrangler.chat-lab.toml` | `ALLOWED_ORIGIN` |
| `scripts/smoke-lab.mjs` | origem padrão (ou use `--origin` no comando) |
| `firebase.lab.json` | não muda — ele libera o Worker, não a origem |

---

## Ordem completa

1. `npm run check:lab` — tudo verde (avisos são aceitáveis).
2. Renovar o canal do laboratório (acima) e confirmar a URL.
3. Ajustar `ALLOWED_ORIGIN` se a URL mudou; `npm run check:lab` de novo.
4. Criar o OAuth Client no GCP — `docs/ROTEIRO-OAUTH-GOOGLE.md`, Parte 1.
5. Gerar a chave AES-256 (Parte 2).
6. Gravar os 4 segredos (Parte 3).
7. `GOOGLE_OAUTH_ENABLED = "true"` no `.toml`.
8. `cd worker && npx wrangler deploy --config wrangler.chat-lab.toml`
9. `npm run smoke -- --url https://sigma-jarvis-cerebro-lab.felipevieiraribeiro19.workers.dev`
10. Abrir a interface, conectar Agenda, fechar a aba, reabrir e conferir "Conectado".

---

## O que já está resolvido e não precisa de credencial

| Item | Situação |
|---|---|
| Build do laboratório com URL da API | corrigido — `.env.lab` embutido no build |
| Consistência Worker/CSP/frontend | verificável com `npm run check:lab` |
| Cofre OAuth no chat (1.2) | feito e testado |
| Roteador DeepSeek/OpenAI/Claude | feito, desligado por padrão |
| Aprendizado com tipo de memória | feito e testado |
| Teste de fumaça | feito |
| Nada removido na limpeza voltou | verificado |

## O que continua bloqueado, e não é código

- **GitHub Actions**: conta com pagamento pendente. Nenhum CI roda. Tudo aqui é verificação local.
- **Publicar a Beta**: o job de publicação exige branches que não existem mais. Precisa de decisão sua (ver abaixo).
