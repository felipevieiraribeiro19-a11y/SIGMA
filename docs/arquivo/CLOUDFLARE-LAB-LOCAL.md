# Etapa 10 — validação no runtime local do Cloudflare

**Resultado verificado em 21/10/2026:** GitHub Actions `SIGMA - laboratorio Cloudflare offline` executou com sucesso `wrangler dev --local` e um Durable Object baseado em SQLite, incluindo reinício do processo. No workflow foram aprovados **128 testes unitários/de integração convencionais e 16 verificações HTTP no workerd local**. Isso não é um deploy no Cloudflare da conta pessoal.

## Isolamento dos testes

- Configuração separada: `worker/wrangler.offline-lab.toml`, com nome **sigma-jarvis-offline-lab** e um Durable Object exclusivo `APPROVAL_LAB` / `OfflineApprovalLab`.
- Não referencia `worker/wrangler.toml`, o Worker ativo `sigma-cerebro`, o Durable Object de cota `QUOTA`, chaves Gemini, Tavily, UID pessoal, Firebase, Google Drive ou Calendar.
- Entrypoint `worker/src/offline-approval-lab.ts` aceita somente operações de laboratório com marcador `X-SIGMA-LAB: offline-fixture` e exemplos sintéticos. **Marcador de teste não é autenticação segura para produção.**
- Persistência do emulador fica em diretório temporário exclusivo do GitHub Actions e é eliminada no final.
- Script `tests/run-cloudflare-offline-lab.sh` inicia o runtime, faz a primeira bateria, mata o processo, inicia outro processo com o **mesmo estado local** e executa a segunda bateria.
- Workflow `.github/workflows/sigma-cloudflare-lab.yml` roda somente no PR da branch Jarvis quando os arquivos do laboratório mudam, ou manualmente. Não há `wrangler deploy`, segredo ou credencial de nuvem.

## O que os 16 testes comprovaram

**Antes do reinício (8):** saúde do isolate local; bloqueio de chamada sem marcador; ausência de rota de execução; criação de proposta fictícia no Durable Object; separação de proprietário; evento inicial na auditoria; recusa de fingerprint errado; cancelamento com consumo bloqueado.

**Depois do reinício (8):** proposta sobreviveu ao reinício; impedimento de reusar ID; cancelamento permaneceu cancelado; outra conta fictícia não acessou a proposta; confirmação exigiu fingerprint exato; cinco tentativas concorrentes resultaram em **um** consumo simulado; auditoria não retornou título nem credenciais; proposta não aprovada permaneceu bloqueada.

Log final confirmado: `OFFLINE_LAB_PHASE_ONE_OK checks=8`, `OFFLINE_LAB_PHASE_TWO_OK checks=8` e `OFFLINE_CLOUDFLARE_DURABLE_RUNTIME_OK`.

## Evolução posterior (etapa 12)

A versão inicial acima verificou 16 chamadas HTTP. Em seguida, o laboratório foi ampliado para executar um provedor fictício com estado durável e teste de reinício. **A execução ampliada passou com 135 testes automatizados e 27 checagens HTTP.** Ver `docs/EXECUTOR-CLOUDFLARE-VALIDADO.md` para resultados e limites. Os números antigos permanecem aqui como histórico da etapa inicial.

## O que ainda NÃO foi validado

- Não houve chamada de operação real ao Google, nem persistência de memória pessoal; **nenhuma ação foi executada**.
- Não houve implantação numa conta Cloudflare remota, teste de carga em produção, teste com identidades Firebase verdadeiras, chaves OAuth ou aprovação feita por um usuário no iPhone.
- Durabilidade após reinício local é evidência relevante, mas não substitui testes de falha e restabelecimento em ambiente remoto nem garantia de entrega exatamente uma vez em APIs externas.
- Não há endpoints reais de `approve`/`execute` no SIGMA; as rotas `/offline-lab/*` existem **somente no entrypoint isolado dos testes**, jamais no `worker/src/index.ts` de produção.
- O consumo simulado não equivale a uma tarefa concluída, e ainda falta projetar idempotência junto ao provedor externo e reconciliar falhas entre aprovação e execução.
- Esta etapa não ativou funcionalidades novas no site publicado. Regras Firestore de produção permaneceram intactas.

## Próxima prioridade técnica

Definir um executor de **teste com serviços falsos (mock providers)** que receba autorização verificada e produza recibos auditáveis, distinguindo: planejado, aprovado, em execução, confirmado pelo provedor, falhou e resultado incerto. Validar a idempotência do provedor antes de conectar qualquer API externa.

Este laboratório pode consumir minutos gratuitos de GitHub Actions e downloads de pacotes Wrangler. O fluxo de CI é limitado a mudanças relevantes para evitar consumo desnecessário.