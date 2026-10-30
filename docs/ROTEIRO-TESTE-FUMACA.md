# Testes de fumaça

Dois scripts, mesma lógica, alvos diferentes. Nenhum precisa de dependência nova, nenhum imprime token.

| Script | Alvo | Comando |
|---|---|---|
| `smoke-lab.mjs` | Worker de **laboratório** | `npm run smoke` |
| `smoke-prod.mjs` | Worker de **produção** | `npm run smoke:prod` |

Ambos deduzem o endereço do respectivo `wrangler*.toml`. `--url` só é necessário se o Worker tiver outro nome.

---

## Produção — `npm run smoke:prod`

### Sem credencial (seguro, pode rodar sempre)

```bash
npm run smoke:prod
```

| Verificação | Esperado |
|---|---|
| Origem não autorizada | 403 |
| Preflight CORS | 204 + origem correta no cabeçalho |
| Chamada sem token | 401 |
| Rota desconhecida | 404 |
| Método errado | 405 |
| Sem JSON no corpo | 415 (ou 401: o Worker autentica antes do corpo) |

Se qualquer uma falhar, **pare** — alguma coisa mudou na fronteira de segurança.

### Com token

```bash
npm run smoke:prod -- --token-file /tmp/token.txt
```

| Verificação | O que prova |
|---|---|
| `capabilities` | o Worker autenticou e o catálogo responde |
| escrita externa desligada | `writesEnabled === false` — ações continuam bloqueadas |
| `histórico` | leitura do Firestore do usuário |
| `agenda e Drive` | só com `--google-token-file`; sem ele, é **pulada** e não conta como falha |

### O chat é opt-in, e o motivo importa

`POST /api/chat` **grava o par pergunta/resposta no seu Firestore**. Por isso ele **não roda por padrão**:

```bash
npm run smoke:prod -- --token-file /tmp/token.txt --chat
```

O teste envia **uma** mensagem e reporta latência e tamanho da resposta. O turno fica registrado no seu histórico — é o único efeito colateral de todo o script.

---

## Laboratório — `npm run smoke`

Ver `docs/ROTEIRO-OAUTH-GOOGLE.md` e `docs/CHECKLIST-ANTES-DO-GCP.md` para o contexto. Diferenças em relação à produção:

- inclui **cofre OAuth** (`/api/lab/oauth/status`)
- inclui **chat por padrão** (o laboratório não persiste conversa)
- inclui leitura de agenda **sem** token de sessão, que é a prova de que o cofre funciona

---

## Opções comuns

| Opção | Para quê |
|---|---|
| `--url` | sobrepor o endereço deduzido |
| `--origin` | origem autorizada (padrão: lida do `wrangler*.toml`) |
| `--token-file` | arquivo com o ID token do Firebase (ou `SIGMA_ID_TOKEN`) |
| `--json` | saída para automação |
| `--timeout` | ms por requisição (padrão 30000) |

Só `smoke-prod` aceita `--chat`, `--google-token-file` e `--message`.

## Como obter os tokens

**ID token do Firebase**: abra o site, faça login, DevTools → Network → requisição para o Worker → `Authorization: Bearer …`.

```bash
printf '%s' 'COLE_AQUI' > /tmp/token.txt
```

**Token do Google** (produção, para testar agenda): o mesmo caminho, mas no cabeçalho `X-Google-Token`. Vale ~1 hora.

## Códigos de saída

| Código | Significado |
|---|---|
| 0 | tudo passou (pulados não contam como falha) |
| 1 | alguma verificação falhou |
| 2 | erro de uso ou de rede (URL inválida, Worker inalcançável) |

## Garantias

- Nenhum token é impresso — a saída mostra `eyJh…k9Qz`.
- Só `https`, exceto `127.0.0.1` para testes locais.
- Nada é gravado em disco.
- Única escrita possível: o chat, e só com `--chat` explícito.
