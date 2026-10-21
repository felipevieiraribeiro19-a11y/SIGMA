# SIGMA — LEIA PRIMEIRO: passar trabalho de publicação para o próximo chat

**Conferido em 21/10/2026.** O usuário tem um guia mais completo, de 244 linhas, para anexar ao novo chat: `SIGMA_GUIA_COMPLETO_PARA_PROXIMO_CHAT.md`.

## Tarefa imediata

O usuário quer **publicar SOMENTE o laboratório Jarvis em um canal temporário do Firebase Hosting**, obter a URL real e abrir no Safari do iPhone. **Não publicar/mesclar o novo Jarvis completo.**

- GitHub privado: https://github.com/felipevieiraribeiro19-a11y/SIGMA
- PR Jarvis: https://github.com/felipevieiraribeiro19-a11y/SIGMA/pull/3 (**draft, ainda não mesclado**)
- Branch: `sigma-jarvis-arquitetura`
- Base do PR: `sigma-work-integracao`
- Site principal (NÃO ALTERAR): https://sigma-61328.web.app
- Worker principal (NÃO ALTERAR): https://sigma-cerebro.felipevieiraribeiro19.workers.dev
- Firebase project: `sigma-61328`, project number `428047765465`
- Console: https://console.firebase.google.com/project/sigma-61328/overview
- Workflows: https://github.com/felipevieiraribeiro19-a11y/SIGMA/actions

## Status preciso

- O site SIGMA principal existe e funciona em versão anterior.
- O Jarvis novo está **em desenvolvimento**: contratos de memória, autorizações, auditoria, orquestração e executores fictícios testados; **não estão ativos no site**.
- Laboratório independente para iPhone tem build validado e versão de HTML único **offline** (`SIGMA_Jarvis_Demonstracao_Offline.html`), via workflow `.github/workflows/sigma-jarvis-lab-build.yml`. Artefatos privados `sigma-jarvis-lab-estatico` e `sigma-jarvis-lab-html-unico` expiram em 5 dias.
- **NÃO EXISTE URL HTTPS do laboratório confirmada ainda.** O workflow de deploy temporário foi preparado, mas **não executado**.
- No commit `9f728025f2b89370038613fe6660a99c21276069` os workflows `Verify`, `SIGMA - validar laboratorio Jarvis isolado` e `SIGMA - laboratorio Cloudflare offline` estavam concluídos com **success**. Revalidar HEAD antes de usar.

## Workflows e arquivos fundamentais

- `.github/workflows/sigma-jarvis-lab-preview-manual.yml`: execução manual, exige input `PUBLICAR-APENAS-LAB` e branch `sigma-jarvis-arquitetura`.
- `firebase.lab.json`: configura **somente** `dist-jarvis-lab`, sem Firestore rules.
- `npm run build:lab`: compila somente a interface fictícia.
- `node tests/verify-jarvis-lab-build.mjs`: verifica isolamento do bundle.
- `node scripts/build-jarvis-offline.mjs`: produz HTML único offline.
- `docs/JARVIS-LAB-IPHONE.md`: manual completo do laboratório.
- `.github/workflows/sigma-preview.yml`: workflow que já implantou o canal `integracao` pela branch `sigma-work-integracao`; NÃO confundir com Jarvis.
- `firestore.rules` e `worker/wrangler.toml`: produção, NÃO ALTERAR NESTA FASE.

## Reutilizar autenticação existente — sem criar chaves

WIF: `projects/428047765465/locations/global/workloadIdentityPools/sigma-github/providers/github`

Service account: `sigma-github-deploy@sigma-61328.iam.gserviceaccount.com`

O deploy existente usa `google-github-actions/auth@v2` com `id-token: write`. **Pode haver restrição da WIF à branch de integração**. Verificar antes de publicar o laboratório; não recriar credenciais, não criar JSON service account.

## Caminho seguro

1. Verificar HEAD do PR #3 e workflows verdes.
2. Ler os workflows manual e `sigma-preview.yml`, checar se `workflow_dispatch` aparece no GitHub. Workflow manual numa branch não padrão pode não aparecer. **Não fazer merge geral para corrigir isso**; preparar alternativa mínima com revisão.
3. Verificar restrições do WIF para `sigma-jarvis-arquitetura`.
4. **Pedir autorização explícita** do usuário para publicar APENAS o canal temporário `jarvis-lab`.
5. Após autorização, a operação preparada é:

   ```bash
   npx --yes firebase-tools@latest hosting:channel:deploy jarvis-lab \
     --config firebase.lab.json \
     --project sigma-61328 --expires 2d --non-interactive
   ```

6. Extrair e informar o **link exato** dos logs; não inventar URL.
7. Testar no Safari do iPhone: memória fictícia, revisão sem execução, login Google opcional. Novo domínio temporário pode precisar de autorização em Firebase Authentication → Authorized domains.
8. Confirmar que `https://sigma-61328.web.app` e o canal `integracao` ficaram intocados.

## Riscos

O laboratório tem **apenas dados inventados** e execução de tarefas sempre desabilitada. O login Firebase no preview é **opcional** e não equivale a integração autenticada ponta a ponta com o Worker. Nenhuma memória permanente, Calendar/Drive write ou conversa nova com IA foi habilitada pelo laboratório. O canal de preview pode ser visível a quem possuir o link e expira em 2 dias. Não publicar `firestore.memory.rules.candidate` nem `worker/wrangler.offline-lab.toml` — este último é só emulador e não usa autenticação de produção.

**Preferência do usuário:** tomar as ações possíveis diretamente no GitHub, e, se exigir operação manual, explicar **um passo curto por vez**.
