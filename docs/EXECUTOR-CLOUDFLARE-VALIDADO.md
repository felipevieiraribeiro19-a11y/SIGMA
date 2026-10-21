# SIGMA — Etapa 12: executor fictício validado em Cloudflare local

Esta etapa testa um pedaço do futuro Jarvis: após autorização específica, o sistema não pode afirmar que uma tarefa foi executada antes de verificar a resposta do provedor. **Nenhum provedor real está conectado**.

## Resultados efetivamente verificados

No GitHub Actions, a execução da branch Jarvis de 21/10/2026 passou com **135 testes automatizados** e **27 verificações HTTP** usando `wrangler dev --local` e um Durable Object real do ambiente de desenvolvimento. O laboratório foi reiniciado entre as etapas, preservando os registros simulados. Logs: `OFFLINE_LAB_PHASE_ONE_OK checks=13`, `OFFLINE_LAB_PHASE_TWO_OK checks=14`, `OFFLINE_CLOUDFLARE_DURABLE_RUNTIME_OK`.

## Componentes criados

- `worker/src/core/offline-mock-store.ts`: diário de execução com controle de versões e gravação transacional; provedor fictício que persiste sua confirmação, recusa ou estado incerto. Todos os identificadores e textos são artificiais.
- `worker/src/offline-approval-lab.ts`: endpoints exclusivos de laboratório (`mock-execute`, `mock-reconcile`, `mock-status`) que só operam sobre propostas fictícias previamente aprovadas. O entrypoint principal de produção não importa nenhum deles.
- `tests/cloudflare-offline-lab.mjs`: testes antes e depois do reinício do runtime local, cobrindo aprovação, execução fictícia, auditoria, recuperação e concorrência.
- `.github/workflows/sigma-cloudflare-lab.yml`: garante execução do laboratório quando seus arquivos ou o provedor fictício são alterados, sem utilizar credenciais da conta Cloudflare.

## Cenários comprovados

1. Provedor fictício confirma uma operação → `confirmed-in-mock`, sempre com `executed:false` para tarefas reais.
2. Provedor fictício rejeita → `rejected-in-mock`, sem sucesso artificial.
3. Provedor fictício persiste a execução mas perde a resposta → `uncertain-in-mock`; depois do reinício, consulta por chave idempotente recupera `confirmed-in-mock` **sem segunda aplicação**.
4. Provedor fictício indisponível → resultado segue incerto; sem novas tentativas automáticas.
5. Cinco chamadas simultâneas → somente uma aplicação no provedor fictício.
6. Proposta pendente ou cancelada não pode executar. Identidades fictícias diferentes não compartilham a informação.
7. Após reiniciar o Worker, o estado de execução fictícia e o contador de aplicações permanecem disponíveis.

## Limitações e portas fechadas

- `worker/wrangler.offline-lab.toml` é exclusivo de desenvolvimento local. Não há `wrangler deploy`, token de conta, acesso a serviços privados ou chamada a provedores externos.
- A autenticação do laboratório usa marcador público **que não é seguro em produção**. Nunca publicá-lo como endpoint real.
- A simulação guarda um resultado de provedor artificial e uma autorização artificial. **Não prova idempotência de Google Calendar, Google Drive ou qualquer serviço real**.
- Ainda há risco de interrupção entre o consumo da autorização e a criação da reivindicação de execução. O laboratório evita alegar sucesso nessa lacuna, mas não automatiza a recuperação de toda falha distribuída.
- A execução real depende de verificação de UID no servidor, escopos OAuth mínimos, confirmação na interface real, persistência e retenção dos registros, limites de custo, testes de APIs sandbox e auditoria de resultados.
- As memórias pessoais seguem desativadas. Não há gravação em Firestore pessoal nem mudança no Worker publicado.

## Próximo marco proposto

Integrar **identidade autenticada e revisão real de propostas** em uma implantação separada de testes, ainda sem operações externas, para exercitar o circuito do iPhone ao Worker. Somente depois escolher uma primeira ferramenta real para leitura/escrita com confirmação e plano de reversão.

**A produção de SIGMA continua na versão anterior. Este componente pertence apenas à branch `sigma-jarvis-arquitetura`.**