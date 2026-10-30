# Roteiro — ligar o OAuth persistente do Google (laboratório)

Objetivo: autorizar **uma vez** e o SIGMA lembrar. Agenda (leitura) + Drive (metadados). Nada de leitura de conteúdo de PDF.
O código já existe (`lab-google-oauth.ts`, `core/google-oauth.ts`). Este roteiro só o coloca em pé.

Escopo desta etapa: **somente o Worker de laboratório**. Produção não é tocada.

---

## Parte 1 — Criar o OAuth Client no Google Cloud

1. Abra <https://console.cloud.google.com/> e selecione o projeto **`sigma-61328`** (mesmo do Firebase).
2. **APIs e serviços → Biblioteca**. Ative as duas:
   - *Google Calendar API*
   - *Google Drive API*
3. **APIs e serviços → Tela de consentimento OAuth**:
   - Tipo de usuário: **Externo**
   - Nome do app: `SIGMA`
   - E-mail de suporte: o seu
   - Domínios autorizados: **deixe vazio**
   - Escopos: **não adicione nada aqui** (o código pede em tempo de execução)
   - Usuários de teste: **adicione o seu e-mail**
   - Publique em modo **"Em teste"**. Não precisa verificar o app — você é o único usuário e o refresh token continua valendo (o Google expira refresh tokens em teste depois de **7 dias**, ver a nota no fim).
4. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo de aplicativo: **Aplicativo da Web**
   - Nome: `SIGMA LAB`
   - **URIs de redirecionamento autorizados** — cole exatamente esta, trocando `<SEU-WORKER-LAB>` pelo subdomínio real:
     ```
     https://<SEU-WORKER-LAB>.felipevieiraribeiro19.workers.dev/api/lab/oauth/callback
     ```
     O caminho `/api/lab/oauth/callback` é obrigatório: o código rejeita qualquer outra coisa com 503.
   - Não precisa de "Origens JavaScript autorizadas" (o fluxo é server-side).
5. Copie o **Client ID** (termina em `.apps.googleusercontent.com`) e o **Client Secret**.

---

## Parte 2 — Gerar a chave de criptografia

O refresh token é cifrado com AES-256-GCM. A chave são **32 bytes aleatórios em base64**. Gere localmente:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Guarde o resultado. Se você perder essa chave, todas as conexões existentes viram "reconecte a conta" — não há como recuperar.

---

## Parte 3 — Gravar os segredos no Worker de laboratório

Na pasta `worker/` do repositório, com o `wrangler` já autenticado (`npx wrangler login`):

```bash
cd worker

npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID --name sigma-jarvis-cerebro-lab
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --name sigma-jarvis-cerebro-lab
npx wrangler secret put GOOGLE_OAUTH_ENCRYPTION_KEY --name sigma-jarvis-cerebro-lab
npx wrangler secret put GOOGLE_OAUTH_REDIRECT_URI --name sigma-jarvis-cerebro-lab
```

Cada comando abre um prompt: cole o valor e Enter. O de `REDIRECT_URI` recebe a URL completa que você cadastrou no passo 4:

```
https://<SEU-WORKER-LAB>.felipevieiraribeiro19.workers.dev/api/lab/oauth/callback
```

Confira que entraram (não mostra valores, só nomes):

```bash
npx wrangler secret list --name sigma-jarvis-cerebro-lab
```

---

## Parte 4 — Ligar a flag e publicar

Em `worker/wrangler.chat-lab.toml`, a flag está desligada:

```toml
GOOGLE_OAUTH_ENABLED = "false"
```

Mude para `"true"`. Só faça isso **depois** da Parte 3 — se a flag estiver ligada sem os segredos, as rotas de OAuth respondem 503.

Depois publique (de dentro de `worker/`):

```bash
npx wrangler deploy --config wrangler.chat-lab.toml
```

Isso publica **apenas** o Worker de laboratório. O `sigma-cerebro` de produção não é tocado.

> Se você quiser manter a flag fora do git, use uma variável de ambiente do Wrangler em vez do `.toml` — mas o caminho mais simples é o acima, e a flag sozinha não expõe nada sem os segredos.

---

## Parte 5 — Testar

1. Abra a interface do laboratório e entre com Google.
2. No painel de documentos, clique em **"Consultar conexões permanentes"** → deve mostrar os três presets desconectados.
3. Clique em **"Conectar permissão"** em *Agenda (leitura)* → abre o consentimento do Google → autorize.
4. Volte e clique em **"Consultar conexões permanentes"** → deve aparecer **Conectado**.
5. **Feche a aba, abra de novo, repita o passo 4.** Se continuar "Conectado" sem novo consentimento, o item está resolvido.
6. Repita para *Drive (nomes e datas)*.

O que **não** vai funcionar ainda, e é esperado: o chat continuar pedindo o token da sessão. O código já tem o cofre populado, mas a conversa ainda não o consulta — é a mudança **1.2** do plano (`chat-lab.ts`, ~20 linhas), que eu faço na próxima etapa.

---

## Se algo der errado

| Sintoma | Causa provável |
|---|---|
| 503 "OAuth ainda não configurado no laboratório" | Segredo faltando, Client ID sem `.apps.googleusercontent.com`, ou `REDIRECT_URI` com caminho diferente de `/api/lab/oauth/callback` |
| `redirect_uri_mismatch` na tela do Google | A URI do GCP difere em qualquer caractere da que está no segredo (barra final, `http` vs `https`) |
| "Autorização expirada ou já utilizada" | Você recarregou o callback; comece de novo pelo "Conectar permissão" |
| "Credencial Google indisponível. Reconecte a conta." | Chave de criptografia trocada, ou o Google revogou o token |
| Conexão vira "Precisa reconectar" sozinha | App em modo de teste: o Google expira refresh tokens em **7 dias** |

**Sobre os 7 dias:** enquanto o app estiver "Em teste", o refresh token expira semanalmente. Para acabar com isso há dois caminhos: (a) publicar o app (exige verificação se você usar escopos sensíveis — os seus, `calendar.events.readonly` e `drive.metadata.readonly`, são *não sensíveis*, então normalmente não exige), ou (b) conviver com reconectar semanalmente. O `needsReauthorization` já sinaliza isso na tela em vez de falhar em silêncio.
