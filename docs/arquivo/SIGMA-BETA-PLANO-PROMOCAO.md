# SIGMA Beta — auditoria de promoção (24/10/2026)

## Objetivo
Preparar uma versão Beta no endereço principal `https://sigma-61328.web.app`, preservando dados, autenticação e a versão atual até haver compatibilidade comprovada. O usuário autorizou preparar/publicar a Beta, mas não autorizou perda, substituição ou mistura de dados.

## Estado comprovado
- A branch de origem desta preparação é `sigma-consultar-concluir-tarefas-chat` (PR #19).
- O frontend de laboratório é `jarvis-lab.html` / `src/jarvis-lab.tsx`, compilado em `dist-jarvis-lab` com `npm run build:lab`.
- A versão LAB foi publicada no canal `jarvis-lab` com `firebase.lab.json`; 284 testes automatizados passaram, e o teste manual reportou login persistente, consulta de tarefa e proposta segura de conclusão. Não foi executada uma conclusão efetiva.
- O backend LAB é `sigma-jarvis-cerebro-lab` e o frontend aponta para ele por `VITE_JARVIS_LAB_API`. O LAB usa APIs `/api/lab/...` e armazenamento de laboratório.
- O frontend principal é `index.html` / `src/main.tsx`, compilado em `dist` com `npm run build`; lê `public/config.json` e chama `sigma-cerebro` para `/api/chat`, `/api/history`, etc.
- O backend principal (`worker/src/index.ts`, `worker/wrangler.toml`) não implementa os endpoints `/api/lab/...` de gestão e propostas. A memória de conversas do principal é persistida por seu próprio fluxo, diferente do chat do LAB, que atualmente não salva conversas.
- O workflow `.github/workflows/sigma-production.yml` na branch `sigma-work-integracao` publica o `dist` no Hosting principal mediante `workflow_dispatch`; o deploy LAB publica somente `dist-jarvis-lab` no canal `jarvis-lab`.

## Bloqueadores de promoção direta
1. Publicar o `dist-jarvis-lab` como site principal sem adaptar a API mantém dependência do Worker LAB e mistura o conceito de laboratório com produção; o frontend ainda exibe avisos de laboratório e não oferece persistência do histórico de chat principal.
2. Publicar o `dist` padrão da branch PR #19 no site principal **não** entrega a interface de projetos/tarefas do LAB: ela está em outro ponto de entrada.
3. Apontar o LAB para `sigma-cerebro` sem implementar suas APIs quebra projetos, tarefas, estudos e propostas.
4. Migrar registros do LAB ou do principal exige plano explícito de compatibilidade e testes de integridade; não apagar nem substituir dados existentes.

## Critérios mínimos para liberar o domínio principal
- Definir arquitetura da Beta: unificar interface e API sem perder histórico/memória do principal e sem misturar registros de LAB/produção.
- Criar frontend Beta com visual SIGMA (sem aviso de laboratório) e com persistência real de chat; proteger todas as gravações por UID e confirmação.
- Preservar backup/exportação dos registros antes de qualquer migração; migração aditiva, verificável e reversível.
- Validar login, histórico, memória, criação/consulta/conclusão de tarefa fictícia, estudos, refresh e Safari iPhone.
- Rodar build, testes, worker checks, preflight e publicar em canal de preview Beta separado antes de atualizar o domínio principal.
- Reutilizar WIF; não criar credenciais; não modificar produção até o gate de liberação.

## Status
**PREPARAÇÃO INICIADA. PRODUÇÃO NÃO MODIFICADA.** Este documento não é autorização para publicar automaticamente, migrar ou excluir dados.

## Decisão do usuário e primeiro incremento de código
- Usuário confirmou que a Beta deve **reunir dados existentes tanto do SIGMA principal quanto do LAB**.
- Foi criado `src/beta-data-inventory.ts`, um reconciliador determinístico de leitura que exige o mesmo UID autenticado em ambas as fontes.
- Os registros são identificados por `origem:tipo:id`, sem mesclar por texto ou sobrescrever IDs coincidentes; uma fonte indisponível interrompe o inventário, em vez de aparecer falsamente como vazia.
- O inventário não copia conteúdo de respostas do Gemini, notas financeiras nem executa escritas. `readOnly=true` e `migrationPerformed=false`.
- Testes em `tests/sigma-beta-data-inventory.test.ts` verificam isolamento por UID, colisão de IDs, duplicatas internas, integridade, fonte ausente e ausência de mutações.
- **Limite atual:** o reconciliador é um módulo de domínio ainda não ligado a endpoints autenticados ou à UI. Não houve leitura de dados reais, migração ou publicação Beta.
- Próxima implementação: adaptadores de leitura autenticada para Firestore/Worker LAB, interface unificada, persistência de chat principal e um canal preview Beta com CORS e Auth explicitamente revisados.

## Adaptadores de leitura e CI
- `src/beta-data-reader.ts`: prepara consultas `GET` autenticadas ao histórico do Worker principal e aos endpoints de memórias, Workspace e projetos do Worker LAB. Envia o mesmo token Firebase a ambos, sem persistir token nem dados; origens dos Workers são fixadas explicitamente para impedir vazamento de token a destinos inesperados.
- `tests/sigma-beta-data-reader.test.ts`: verifica GET-only, autenticação, falha fechada quando falta uma fonte e rejeição de destinos não autorizados.
- `.github/workflows/sigma-beta-preflight.yml`: build e testes sem credenciais, sem deploy, sem migração. O resultado de CI ainda deve ser confirmado antes de integração.
- **Antes de ativar no navegador:** ambos Workers devem permitir explicitamente o domínio do preview Beta via CORS; a autenticação Firebase também deve autorizar o domínio. Essas configurações ainda não foram alteradas.
- A integração atual é **somente inventário e leitura**, não migração de conteúdo nem chat unificado. Não habilitar escrita entre bases sem testes e consentimento.

## Publicação Beta autorizada e realizada em 24/10/2026
- O proprietário esclareceu que o site principal não tinha registros que precisassem ser migrados e autorizou **substituir imediatamente o frontend principal** ("mete ficha").
- O Firebase Hosting principal foi publicado com sucesso em `https://sigma-61328.web.app` usando `dist-sigma-beta`, WIF existente e validação GitHub Actions. Run de publicação: `40105214819`, jobs `validar` e `publicar` concluídos com sucesso.
- O novo frontend Beta usa os registros existentes no Worker LAB e o mesmo Firebase Auth; **não foi feita cópia nem exclusão de dados**. A interface LAB segue publicada no canal `jarvis-lab`.
- O Worker `sigma-jarvis-cerebro-lab` foi atualizado via Cloudflare API com duas origens exatas: principal Beta e preview LAB, sem curingas. O binding `ALLOWED_ORIGIN` passou a apontar para o domínio principal, e o código aceita também o preview LAB. Após a atualização, verificou-se a preservação dos 22 bindings, incluindo 3 segredos e 6 Durable Objects. Última versão de Worker confirmada: `5363daf2-189d-4f96-889b-4f2facbc9c17`.
- O workflow de publicação automática foi desabilitado após o lançamento e ficou restrito a `workflow_dispatch`, para evitar redeploys em cada commit.
- A Beta **não** implementa ainda a migração de histórico antigo do Firestore principal, nem grava o histórico de mensagens do chat LAB. Os registros confirmados de memórias, projetos e tarefas permanecem no armazenamento LAB existente.
- Validação real no navegador (login, tarefas, Safari iPhone) ainda depende de uso/teste manual. Não afirmar que foi concluída.
- Rollback: Firebase Hosting conserva versões anteriores no console; Worker mantém versão anterior `a505ad3f-297a-48ac-808c-8819265dbf74` para eventual restauração, sem tocar no armazenamento Durable Objects.
- **Importante:** `worker/wrangler.chat-lab.toml` permanece com origem LAB para testes locais. Um deploy futuro via Wrangler sem alinhar a variável `ALLOWED_ORIGIN` com o domínio Beta pode interromper a comunicação do site principal; alinhar antes de novos deploys.
