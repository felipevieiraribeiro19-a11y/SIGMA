# SIGMA — Etapa 16B: leitura consentida da memória no Gemini

Implementação **apenas no Worker e frontend isolados Jarvis LAB**, sem Firestore e sem deploy automático.

## Experiência
1. O usuário salva memórias manualmente na etapa 16A.
2. No chat, clica em **Escolher memórias para esta pergunta**.
3. O navegador consulta os registros da conta autenticada e apresenta a lista, desmarcada por padrão.
4. O usuário seleciona até 3 memórias e envia a pergunta.
5. O navegador envia somente `memoryIds` além das mensagens, **nunca o texto da memória fornecido pelo navegador**.
6. O Worker valida Firebase ID token, origem e UID proprietário; consulta o Durable Object `LAB_MEMORY` da própria conta, verifica IDs existentes e injeta apenas esses textos no Gemini **nesta solicitação**.
7. A resposta inclui metadado de confirmação `memory: {consulted:true,count}` sem conteúdo da memória.
8. Seleção de memórias e lista carregada são descartadas após a resposta e ao sair do Google.
9. Sem seleção, o Worker não consulta LAB_MEMORY e não acrescenta dados ao modelo.

## Limitações importantes
- **Não é memória automática**, não há memória sem consentimento explícito para a pergunta; ainda não existe ranqueamento semântico de relevância.
- Notas são dados de contexto, nunca instruções superiores ao sistema.
- Memórias **não são enviadas à Tavily**; as buscas usam somente a pergunta atual sem ampliar automaticamente com memórias.
- Memórias **são enviadas ao Gemini** quando selecionadas; não inserir senhas nem informações sensíveis reais.
- Não escreve memória a partir do chat, não modifica Drive/Agenda/Firestore e não retém o histórico de mensagens no backend.
- A conta e chave Google são verificadas somente no Worker do LAB.
- O código de validação global de mensagens do SIGMA principal permanece intacto.
- Não afirma criptografia ponta a ponta ou exclusão imediata de backups do fornecedor.

## Testes
- Sem `memoryIds`: nenhuma leitura de memória e nenhuma nota incluída no Gemini.
- Seleção explícita com IDs reais: consulta somente as notas escolhidas.
- Nota removida, ID inválido, seleção duplicada, quatro notas ou flag desligada: falha fechada.
- Usuários e origens externos: bloqueados antes da leitura.
- Tavily não recebe o conteúdo das memórias, mesmo com pesquisa ativa.
- Recebimento no navegador contém no máximo confirmação de contagem, jamais a lista usada no prompt.

## Publicação
O workflow manual `sigma-jarvis-lab-preview-manual.yml` publica somente `jarvis-lab`, com `connect_lab_chat=true`, `connect_lab_web=true`, `connect_lab_memory=true` e confirmação `PUBLICAR-APENAS-LAB`. É proibido alterar Worker `sigma-cerebro` ou Firebase Hosting live.

## Teste manual recomendado
Com nota fictícia "Meu projeto de teste se chama Projeto Alfa e minha cor favorita é azul.":
- Sem selecionar memórias: perguntar "Qual minha cor favorita?" e confirmar que o SIGMA não presume a informação.
- Escolher a nota e repetir: verificar menção a azul e recibo "1 registro consultado".
- Excluir a memória na seção 4, atualizar seleção no chat e confirmar que a informação não aparece mais.
