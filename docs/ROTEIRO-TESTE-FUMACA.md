# Teste de fumaça do Worker de laboratório

Depois de publicar (`wrangler deploy`), rode isto para saber em 30 segundos se o que você publicou está de pé — sem abrir o navegador.

```bash
npm run smoke -- --url https://sigma-jarvis-cerebro-lab.felipevieiraribeiro19.workers.dev
```

## O que ele verifica sem nenhuma credencial

| Verificação | Esperado |
|---|---|
| Origem não autorizada | 403 |
| Preflight CORS | 204 |
| Chamada sem token | 401 |
| Rota desconhecida | 404 |

Isso já responde "o Worker subiu e está com a configuração certa de origem?".

## O que verifica com token

Passe um ID token do Firebase para testar o que importa de verdade:

```bash
npm run smoke -- --url https://<worker>.workers.dev --token-file /tmp/token.txt
```

| Verificação | O que mostra |
|---|---|
| Cofre OAuth | Agenda / Drive conectados, ou "precisa reconectar" |
| Chat | **provedor em uso**, tempo de resposta, tamanho da resposta |
| Integração agenda | leitura real **sem** token de sessão — prova que o cofre funciona |

Saída típica:

```
Teste de fumaça — https://sigma-jarvis-cerebro-lab...
Origem usada: https://sigma-61328--jarvis-lab-pw5dmfbc.web.app
Token: eyJh…k9Qz

  ok  origem não autorizada é recusada      HTTP 403
  ok  preflight CORS responde 204          HTTP 204
  ok  chamada sem token é recusada         HTTP 401 Faça login com Google no laboratório.
  ok  rota desconhecida responde 404       HTTP 404
  ok  cofre OAuth responde                 calendar: conectado | drive_metadata: conectado
  ok  chat responde                        deepseek · 1840 ms · 412 caracteres
  ok  integração calendar (via cofre)      7 itens · 620 ms

Provedor em uso: deepseek | resposta em 1840 ms

todas as verificações passaram
```

## Como obter o token

1. Abra a interface do laboratório e faça login com Google.
2. DevTools → **Network** → clique em qualquer requisição `/api/lab/...`.
3. Em **Request Headers**, copie o valor depois de `Authorization: Bearer `.
4. Cole num arquivo:

```bash
printf '%s' 'COLE_AQUI' > /tmp/token.txt
```

O token do Firebase vale cerca de 1 hora. Se o teste disser `HTTP 401 — token inválido ou expirado`, copie outro.

## Garantias

- **O token nunca é impresso.** A saída mostra `eyJh…k9Qz`.
- **Não grava nada.** Só lê.
- **Não altera estado.** O chat usa uma pergunta inofensiva (`Responda apenas: teste ok.`) e o laboratório não persiste conversa.
- **Só aceita https**, exceto `127.0.0.1`/`localhost` para testes locais.
- **Código de saída 1** se qualquer verificação falhar — dá para usar em script.

## Opções

| Opção | Para quê |
|---|---|
| `--url` | obrigatória; apenas a origem, sem caminho |
| `--origin` | origem autorizada a usar (padrão: a do laboratório) |
| `--token-file` | arquivo com o ID token (ou `SIGMA_ID_TOKEN` no ambiente) |
| `--chat "..."` | trocar a pergunta (evite algo que grave tarefa) |
| `--json` | saída em JSON, para automação |
| `--timeout` | milissegundos por requisição (padrão 30000) |

## Se falhar

| Sintoma | Causa |
|---|---|
| `origem não autorizada` → HTTP 200/401 | `ALLOWED_ORIGIN` no `.toml` não bate com `--origin` |
| `chamada sem token` → HTTP 200 | configuração perigosa: o Worker está aceitando anônimo |
| `cofre OAuth` → 503 | `GOOGLE_OAUTH_ENABLED=false` ou segredos ausentes |
| `chat` → 503 | `LAB_CHAT_ENABLED=false` |
| `chat` → 502 | provedor de modelo indisponível ou chave inválida |
| `integração calendar` → 401 | conexão Google expirada: reconecte no painel |
