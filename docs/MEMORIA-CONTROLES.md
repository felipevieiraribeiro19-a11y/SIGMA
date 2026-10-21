# SIGMA — central de memória e prontidão para ativação

Este documento distingue **demonstração**, **código testado**, **persistência real** e **uso permitido**. Nenhuma etapa autoriza implantar o candidato de regras.

## Estado atual

| Peça | Estado |
|---|---|
| Painel src/MemoryCenter.tsx | DEMO com dados inventados no estado React, sem gravação ou consulta a conversas reais |
| Aprovar → corrigir → apagar | SIMULADO; reiniciar ou recarregar descarta o exemplo |
| Motor worker/src/core/memory-engine.ts | Regras de aprovação, edição, exclusão, origem e isolamento testadas com armazenamento em memória |
| Adaptador worker/src/core/memory-firestore.ts | Desconectado e testado com HTTP simulado; sem endpoint |
| Regras ativas firestore.rules | Negam acesso à coleção personalMemories |
| Candidato firestore.memory.rules.candidate | Não é citado em firebase.json, **nega todas as escritas diretas**, e não foi publicado |
| Memória pessoal permanente | **NÃO ATIVADA** |
| Histórico de conversas | Separado e sem alterações nesta fase |

## Consentimento exige mais que uma regra Firestore

O motor de memória exige confirmação para gravar, mas um cliente que possua token Firebase com permissão direta de escrita poderia ignorar a interface. **Security Rules validam identidade e dados; não comprovam que o usuário clicou em Confirmar.**

O candidato agora nega `create`, `update` e `delete` diretamente pelo cliente, inclusive para o próprio usuário autorizado. O futuro executor confiável precisará autenticar a conta, validar uma autorização de uso único vinculada à ação exata e operar com identidade de serviço restrita, sem colocar credenciais no frontend. Regras Firebase sozinhas não comprovam uma interação humana real.

**Validação concluída:** o Firestore Emulator executou 14 testes com dados fictícios: leitura do proprietário, negação de terceiros e anônimos, impossibilidade de escrita direta, manutenção de acesso ao histórico antigo e bloqueio de coleções desconhecidas.

## O que significa excluir uma memória

Apagar o conteúdo do repositório de memórias não apaga automaticamente cópias que existam em conversas antigas, documentos no Drive, anexos ou outros serviços. O SIGMA deverá deixar claros esses limites em cada confirmação.

O futuro adaptador propõe um tombstone mínimo (`deleted: true` e revisão), sem o texto pessoal, para impedir que retries antigos o restaurem. **O candidato de regras NÃO permite que clientes criem tombstones:** isso será trabalho exclusivo de um executor confiável ainda não implementado.

## Checklist de liberação

1. Conectar o núcleo de autorizações de uso único a armazenamento transacional real. `worker/src/core/approval-ledger.ts` já define a proposta, digest, aprovação, expiração, cancelamento e consumo único, mas permanece desconectado.
2. Garantir que apenas um backend confiável, com credenciais de servidor devidamente protegidas, possa escrever memórias e que nenhuma chamada direta do cliente ignore o fluxo aprovado.
3. Manter os **14 testes do Firestore Emulator** que já passaram; expandir para concorrência e testes de identidade de serviço antes de qualquer ativação.
4. Alinhar regras e formato do adaptador com limites de custo e retenção.
5. Desenvolver endpoints autenticados de proposta, aprovação, revisão, consulta e exclusão com idempotência.
6. Substituir a demonstração por painel real com registro de origem e confirmação individual.
7. Implementar exportação, correção, exclusão, política de retenção e procedimento de revogar permissões.
8. Testar tudo com conta e dados fictícios; nunca usar registros privados como teste automático.
9. Somente após aprovação expressa, publicar separadamente com rollback.
10. Validar no iPhone e em navegador real antes de permitir registros pessoais.

## Verificação atual

- Execute: npm ci && npm run build && npm run check:worker && npm test.
- Confira que firebase.json ainda aponta somente para firestore.rules.
- Confira que firestore.rules continua inalterado.
- Teste automatizado de regras isoladas: workflow `sigma-memory-emulator.yml` (PR de arquitetura ou execução manual). Passou com 14 verificações de segurança na execução de 21/10/2026.
- Os testes usam conta fictícia, emulador local e não exigem segredo Firebase ou login no Google.
- O painel é só uma demonstração de dados inventados, sem acesso a Firebase ou Gemini.

**Não faça deploy de firestore.memory.rules.candidate.** É um candidato para revisão, não uma política validada.