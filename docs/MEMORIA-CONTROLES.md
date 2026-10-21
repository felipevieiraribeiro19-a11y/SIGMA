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
| Candidato firestore.memory.rules.candidate | Não é citado em firebase.json e **não foi publicado** |
| Memória pessoal permanente | **NÃO ATIVADA** |
| Histórico de conversas | Separado e sem alterações nesta fase |

## Consentimento exige mais que uma regra Firestore

O motor de memória exige confirmação para gravar, mas um cliente que possua token Firebase com permissão direta de escrita poderia ignorar a interface. **Security Rules validam identidade e dados; não comprovam que o usuário clicou em Confirmar.**

Por isso, não publique as regras candidatas. Antes de liberar o recurso, será necessária uma estratégia de autorização de escrita com prova de aprovação e execução confiável, sem chaves administrativas no navegador ou GitHub. Testes de bypass direto deverão falhar.

## O que significa excluir uma memória

Apagar o conteúdo do repositório de memórias não apaga automaticamente cópias que existam em conversas antigas, documentos no Drive, anexos ou outros serviços. O SIGMA deverá deixar claros esses limites em cada confirmação.

O candidato mantém um tombstone mínimo (deleted: true e revisão), sem o texto pessoal, para impedir que retries antigos o restaurem. Essa política deverá ser revisada antes da liberação.

## Checklist de liberação

1. Finalizar autenticação, separação por proprietário, limites e autorização de ações.
2. Impedir que um cliente com token do Firebase grave memórias ignorando o fluxo aprovado.
3. Testar Security Rules em **Firestore Emulator**: outras contas, campos inválidos, concorrência, exclusão e tentativas de bypass.
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
- O painel é só uma demonstração de dados inventados, sem acesso a Firebase ou Gemini.

**Não faça deploy de firestore.memory.rules.candidate.** É um candidato para revisão, não uma política validada.