# SIGMA — Etapa 16D: memória contextual com consentimento permanente

## O que mudou
A consulta contextual de memórias existentes fica disponível automaticamente
quando o proprietário **ativa uma vez** a opção "Lembrar automaticamente
nas próximas conversas". Esse consentimento é armazenado no Durable Object
`LAB_MEMORY` da conta identificada pelo Firebase Auth. O navegador não guarda
a preferência em localStorage; ao voltar à página o servidor informa seu estado.

### Segurança e dados
- **Desligado por padrão**: contas antigas não recebem ativação automática.
- Um `PATCH /api/lab/memory/settings` com exatamente
  `{"recallEnabled":true}` habilita, e `false` revoga.
- O servidor revalida a preferência armazenada **em cada mensagem**, mesmo
  quando o navegador passa dados antigos, travou ou foi recarregado.
- Nenhum parâmetro `memoryMode` do navegador ativa essa capacidade sozinho.
- A rota exige origem exata, token Firebase válido, Google autorizado e UID
  do proprietário; requer flag `LAB_MEMORY_AUTO_ENABLED=true` do Worker LAB.
- Ao desligar, a consulta automática termina imediatamente, mas **não
  apaga as memórias**. Apagar/corrigir dados continua possível no painel próprio.
- Quando ligada, o Worker procura até três memórias por relevância textual
  semântica **não garantida**; só os registros selecionados são encaminhados ao
  Gemini na solicitação. As mensagens não são salvas automaticamente.
- O Gemini não recebe toda a base; a Tavily **não recebe textos das notas**.
- A escolha manual de memórias para uma pergunta continua disponível quando
  o recall permanente está desativado.
- Sem Firestore, Drive, Google Calendar, Worker `sigma-cerebro` ou Hosting live.
  Os dados persistem no Durable Object exclusivo de laboratório por UID.

### Limitações
O ranking de memórias atual é lexical e pode falhar com sinônimos ou perguntas
muito vagas. "Lembrar sempre" significa recuperar contextos relevantes quando
a conta autorizou, não capacidade infalível ou histórico total de conversas.
Conteúdos ainda exigem registro explícito na seção de memórias; não há
captura automática de mensagens nem proposta automática de novos registros.

### Publicação e testes
O fluxo é manual e isolado: `sigma-jarvis-lab-preview-manual.yml` na branch
`main`, senha de confirmação `PUBLICAR-APENAS-LAB`, quatro caixas
`connect_lab_chat`, `connect_lab_web`, `connect_lab_memory`,
`connect_lab_memory_auto` habilitadas.

Após publicação: (1) confirmar que a configuração inicia desligada;
(2) ligar com um clique; (3) perguntar "Qual é minha cor favorita?" e
recuperar a nota fictícia sem selecioná-la; (4) fechar/reabrir o Safari e
perguntar novamente, confirmando recuperação; (5) desligar e confirmar que
nenhuma nota é enviada sem seleção explícita; (6) confirmar que nada foi
salvo do chat e que a conta principal SIGMA permaneceu intacta.
