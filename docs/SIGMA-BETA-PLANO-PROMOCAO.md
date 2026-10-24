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
