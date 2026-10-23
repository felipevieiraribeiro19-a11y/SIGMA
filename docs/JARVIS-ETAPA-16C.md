# SIGMA — Etapa 16C: consulta contextual opt-in (LAB)

## Escopo
O chat do Jarvis de laboratório pode recuperar até **três memórias** existentes
pertinentes à **última pergunta** após autorização explícita na interface.
Não há memória automática na produção, gravação automática, leitura do Drive
ou importação de histórico.

### Fluxo de consentimento
- Checkbox "Buscar memórias relevantes automaticamente nesta sessão" desligado
  por padrão; React guarda o estado apenas na página aberta, sem localStorage
  nem banco. Sai do Google, fecha ou recarrega, volta a desligado.
- A requisição do chat contém `memoryMode:"relevant"` **somente com checkbox
  ativado**. O Worker requer `LAB_MEMORY_AUTO_ENABLED=true`,
  `LAB_MEMORY_ENABLED=true` e token Firebase de UID permitido.
- Seleção manual `memoryIds` e `memoryMode` são **mutuamente exclusivos**.
- Sem autorização não há leitura de memórias pelo chat.
- A leitura é feita diretamente no DO separado `LAB_MEMORY` do UID verificado.
  O frontend não fornece conteúdo das memórias ao chat.

### Recuperação
- Ranking textual local e genérico no backend, sem chamada adicional a IA.
- Normalização de caixa e acentos, eliminação de termos gramaticais genéricos,
  interseção de palavras e teto de três registros.
- É uma **heurística lexical**, não uma busca semântica completa. Pode deixar
  de encontrar sinônimos ou, ocasionalmente, relacionar duas notas com termos
  em comum sem verdadeira pertinência. Não afirmar compreensão perfeita.
- Se nada corresponder, nenhum texto da memória será enviado ao Gemini.
- O contexto inserido no Gemini trata memórias como dados inferiores a
  instruções, nunca autorizações para ações.
- O chat retorna apenas metadados `memory: {consulted,count,mode:'auto'}`
  e não copia os textos de memória ao browser na resposta.
- A Tavily continua recebendo só a pergunta da pessoa, nunca o texto das notas.
- **Nenhuma memória é criada, corrigida ou apagada pelo chat.** Essas operações
  permanecem na interface separada de registro manual com aprovação.

## Deploy
- Worker exclusivo `sigma-jarvis-cerebro-lab` (nunca `sigma-cerebro`).
- `LAB_MEMORY_AUTO_ENABLED="false"` no TOML versionado.
- Workflow manual `sigma-jarvis-lab-preview-manual.yml` na branch `main`,
  `publish_ack=PUBLICAR-APENAS-LAB`, seleções `connect_lab_chat=true`,
  `connect_lab_web=true`, `connect_lab_memory=true`,
  `connect_lab_memory_auto=true`.
- Nunca ampliar domínios, permissões de Firebase ou migrar banco de produção
  para esse teste.

## Validação manual com dados inventados
1. Sem ligar o checkbox: "Qual era o meu Projeto Alfa?" não deve recuperar
   a nota automaticamente.
2. Ligue o checkbox: "Qual é a minha cor favorita?" deve recuperar a nota
   "Meu projeto fictício é Alfa e minha cor favorita é azul".
3. Pergunte algo sem relação com a nota. O chat deve avisar que não encontrou
   memória pertinente e não enviar notas ao Gemini.
4. Recarregue o Safari: o checkbox deve voltar desligado, mesmo que a memória
   permaneça no banco.
5. Exclua o registro fictício pela seção de memória, e confirme que deixa de
   poder ser recuperado.
6. A qualidade do ranking lexical deverá ser avaliada antes de qualquer
   consulta automática permanente.

## Dados e privacidade
A recuperação autorizada transmite ao Gemini **somente memórias relevantes**
aprovadas que o proprietário armazenou. Não prometer privacidade total,
criptografia ponta a ponta nem ausência de retenção nos provedores.
Não cadastrar segredos ou dados pessoais sensíveis nos testes.
