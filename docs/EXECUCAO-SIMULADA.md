# SIGMA — Etapa 11: execução simulada com resultado verificável

## Objetivo

Separar **autorização de tarefa** de **execução verificada**, para que o Jarvis não confunda uma confirmação humana com uma operação efetivamente realizada. Esse componente é uma infraestrutura geral e não prioriza nenhuma área de vida.

## Fluxo de teste

1. O motor de consentimento devolve um recibo de uso único após autorização.
2. `mock-executor.ts` gera um identificador idempotente associado à conta e à ação.
3. Um diário de execução de testes registra que uma tentativa foi reivindicada antes de chamar o provedor fictício.
4. O provedor de teste simula uma confirmação, rejeição, indisponibilidade ou operação concluída com resposta perdida.
5. A execução retorna um dos estados `confirmed-in-mock`, `rejected-in-mock` ou `uncertain-in-mock` (ou `claimed` enquanto o processo não terminou).
6. Quando o resultado é incerto, o sistema consulta o status do provedor pelo identificador. **Nunca reenvia automaticamente uma ação incerta**.
7. Nenhuma conclusão de mock significa que Google Calendar, Drive, Firestore ou qualquer outro serviço real foi alterado.

## Segurança e limitações

- Os componentes `FictionalIdempotentProvider` e `TestExecutionJournal` só usam memória volátil e dados inventados.
- Não há endpoint HTTP, UI de execução ou conexão do novo executor com o Worker ativo.
- A validação do recibo nesta fase é estrutural. A origem confiável do recibo depende do motor de autorização, que **deve ser invocado pelo servidor**, nunca com recibos fornecidos livremente pelo navegador.
- Exatamente uma execução no sistema real depende também de suporte do serviço externo a chave idempotente ou a consulta confiável por identificador. Não é uma garantia universal.
- Um recibo consumido sem resultado do provedor continua incerto e requer reconciliação; o sistema não deve afirmar que completou a tarefa.
- Os testes simulados não provam que Google ou outros provedores oferecem idempotência para todas as operações.
- Antes de produção: autenticação do executor, armazenamento transacional com prazo de retenção, proteção contra concorrência multi-instância, revalidação das permissões, integração real no sandbox do fornecedor, auditoria e plano de recuperação.

## Testes

`tests/mock-executor.test.ts` valida confirmação de mock, perda de resposta depois de aplicação, indisponibilidade, rejeição, concorrência, prevenção de repetir a operação e impedimento de mudar uma tarefa reaproveitando o mesmo identificador.

**Próximo marco:** implementar um executor genérico de provedores em sandbox com retorno comprovável, respeitando os limites da camada gratuita e só permitindo ativação voluntária após revisão.

A versão publicada do SIGMA e a configuração de produção não foram alteradas.