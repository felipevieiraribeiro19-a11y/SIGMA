# SIGMA — Etapa 9: laboratório integrado de autorizações e auditoria

## Objetivo

Verificar o circuito completo **conversa → prévia autenticada → revisão → aprovação/cancelamento → consumo simulado → auditoria**, com dados fictícios e sem operações de Google Calendar, Drive, Firebase pessoal ou Gemini.

## Componentes

- `worker/src/core/audited-approval.ts`: implementação alternativa de `ApprovalStore` para futura persistência transacional em Durable Object, com trilha de eventos **mínima** armazenada na mesma transação da mudança de estado.
- `tests/action-audit-integration.test.ts`: laboratório de integração entre a rota autenticada de prévia do Worker e aprovação/auditoria com armazenamento transacional simulado.
- Todo o código continua em `sigma-jarvis-arquitetura`, sem merge e sem publicação.

## Estados e evidências

| Mudança | Evento de auditoria | Significado |
|---|---|---|
| Uma proposta é emitida | `proposed` | Solicitação preparada; nenhum provedor foi acionado |
| Usuário aprova os detalhes exatos | `approved` | Consentimento de teste; não é execução |
| Usuário cancela | `cancelled` | Autorização inutilizada |
| Teste consome o recibo | `simulation-consumed` | Simulação de uso único; **`executed:false`** |

Todas as entradas de auditoria usam sequência, tipo, horário, digest da proposta e `executed:false`. **Não incluem** título de evento, nome de documento, texto da conversa, token OAuth ou conteúdo de memória. Os detalhes da proposta ainda residem no registro de autorização — o teste só minimiza a trilha de auditoria, não elimina toda informação sensível do armazenamento.

## Verificações

- Prévia HTTP só funciona em teste com `ACTION_PREVIEW_ENABLED:'true'`, sessão Firebase simulada e origem permitida.
- Nenhum envio a Google, Gemini ou Firebase é feito pelo circuito auditado.
- Rejeição por outra conta, cancelamento, dados faltantes e expiração não geram registro falso de tarefa executada.
- Dois consumidores simultâneos produzem um único evento `simulation-consumed`.
- Quando a transação falha, **nem o estado nem sua auditoria** são confirmados; é possível tentar novamente.
- Reinicializações são simuladas criando uma nova instância sobre o mesmo armazenamento de testes.

## Restrições antes de produção

**Este laboratório NÃO prova ainda a segurança em Durable Objects de produção.** O teste simula o contrato transacional em memória e não executa o emulador do Cloudflare com serviços de terceiros. Ainda faltam testes no runtime real, expurgo/limite de retenção, tratamento de dados pessoais, auditoria imutável contra agentes privilegiados, verificações de identidade, scopes mínimos, confirmação humana efetiva, idempotência também no provedor externo e reconciliação de ações parcialmente concluídas.

Ações reais devem ter um registro de resultado confirmado pela API provedora: sem isso o SIGMA **nunca** deve responder que algo foi feito. Uma aprovação não é prova de execução.

**Não foram criados endpoints de autorização, nem habilitadas ações ou memórias pessoais.** A rota de prévia existente permanece desligada por padrão.