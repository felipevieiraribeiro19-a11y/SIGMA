# SIGMA — Agenda e Drive (somente leitura)

## O que foi implementado

- Botão **Conectar Agenda e Drive** no menu do SIGMA. Só ele pede as permissões novas; o login normal continua igual e não depende disso.
- O SIGMA lê, quando você pede ou quando conectado:
  - **Agenda**: compromissos dos próximos 7 dias (título, início e fim).
  - **Drive**: os 10 PDFs modificados mais recentemente (nome e data). O conteúdo dos arquivos **não** é lido.
- Esses dados entram no contexto da conversa como *dados*, nunca como instruções. Se a leitura falhar, o modelo é instruído a não inventar compromissos nem nomes de arquivo.
- **Somente leitura.** Nenhum escopo de escrita foi pedido: o SIGMA não cria, altera nem apaga eventos ou arquivos.

## O que continua fora

- Não há criação de eventos por conversa ("marca aí terça às 19h"). Isso exige escopo de escrita e uma decisão sua sobre deixar a IA alterar sua agenda.
- Não há leitura do conteúdo dos PDFs do Drive. Hoje o anexo manual já faz isso; ler direto do Drive transferiria arquivos inteiros para o Worker.
- O acesso dura **cerca de 1 hora**. Depois disso o menu mostra "Reconecte Agenda e Drive" e basta tocar no botão de novo. É consequência de uma escolha deliberada: **nenhum token do Google é guardado** — nem no navegador em disco, nem no Firestore, nem no Worker.

## Ativação (só você pode fazer — 5 minutos, sem custo)

### 1. Ativar as duas APIs no projeto Google

1. Abra `https://console.cloud.google.com/apis/library?project=sigma-61328`.
2. Procure **Google Calendar API** → **Ativar**.
3. Procure **Google Drive API** → **Ativar**.

Sem isso, a leitura falha com 403 e o menu avisa "Não consegui ler: agenda, materiais". Reconectar não resolve — é API desativada, não sessão vencida.

### 2. Autorizar os escopos na tela de consentimento

1. Abra `https://console.cloud.google.com/apis/credentials/consent?project=sigma-61328`.
2. Em **Acesso a dados** (Data access) → **Adicionar ou remover escopos**.
3. Adicione exatamente estes dois:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/drive.readonly`
4. Salve. Se o app estiver em modo **Testing**, confirme que o seu e-mail está em **Usuários de teste**.

### 3. Publicar o código

1. Merge do PR #2 em `sigma-work-integracao`.
2. Rodar `SIGMA - publicar cerebro no Cloudflare` (Worker: novas rotas e leitura do Google).
3. Rodar `SIGMA - publicar site definitivo` (interface: botão e lista).

### 4. Conectar no aplicativo

1. Abrir `https://sigma-61328.web.app`, entrar com Google.
2. Menu (☰) → **Agenda e Drive** → **Conectar Agenda e Drive**.
3. O Google vai mostrar uma tela de app não verificado (normal em app pessoal em teste): **Avançado → Acessar**.
4. Autorizar as duas permissões de leitura.

### 5. Testar

- No menu devem aparecer os próximos compromissos e os PDFs recentes.
- Na conversa: "o que eu tenho nos próximos 7 dias?" e "quais materiais de estudo eu tenho no Drive?".

## Se algo falhar

| Sintoma | Causa | Correção |
|---|---|---|
| "Não consegui ler: agenda, materiais" e reconectar não ajuda | API não ativada no projeto | passo 1 |
| A janela do Google não mostra as permissões | escopos não adicionados na tela de consentimento | passo 2 |
| "O acesso ao Google expirou" | passou de ~1 hora | tocar de novo em Conectar |
| "O Google não devolveu o acesso" | janela fechada ou permissão negada | repetir e autorizar |
| Lista vazia, sem erro | não há compromisso nos próximos 7 dias nem PDF no Drive | comportamento correto |
| `invalid_scope` | escopo digitado errado ou app sem permissão para escopo sensível | repetir o passo 2 |

## Privacidade

- O token do Google fica **somente na memória da aba**. Fechar ou recarregar apaga.
- O token transita no cabeçalho `X-Google-Token`, nunca em URL e nunca em log. Os testes verificam isso.
- Vai para o Gemini apenas: título e horário dos eventos e nome dos arquivos. O conteúdo dos PDFs não sai do Drive.
- O SIGMA não guarda cópia da agenda nem da lista de arquivos no Firestore.

## Custo

Calendar API e Drive API não têm cobrança dentro da cota gratuita, e o SIGMA faz no máximo duas leituras por solicitação, apenas com token presente. Nenhum serviço novo, nenhum plano novo. Ver `docs/CUSTOS.md`.
