# Jarbas — auditoria e versão candidata de 19/10/2026

## Estado da entrega
Código implementado e testado localmente. **Não publicado**. Site principal e Worker existente não foram alterados. Nenhum dado de produção foi excluído ou sobrescrito. Nenhum faturamento foi ativado.

## Auditoria confirmada
- Pasta Windows C:\Users\Felipe Ribeiro\Downloads\jarbas-v1 não está montada neste ambiente Linux.
- Cópia local anterior disponível e preservada em backup.
- Código público do canal teste-gemini recuperado: app.js de 5.804 bytes, configuração pública, HTML, CSS e manifesto.
- Site principal: app.js 5.987 bytes e secureApiBaseUrl vazio (sem IA conectada no frontend principal). Preview: app.js 5.804 bytes; contém o parser antigo de valores. Ambos preservados.
- Configuração do preview aponta para jarbas-cerebro.felipevieiraribeiro19.workers.dev.
- Worker: origem não autorizada retorna 403; chamada sem token pela origem do preview retorna 401; token sintético inválido retorna 401. São testes de fronteira, não uma auditoria interna de validação JWT.
- Firebase CLI não está mais autenticada. Wrangler também não está autenticado. Não foi possível ler regras remotas, inventariar dados, obter código do Worker, listar modelos com sua chave ou publicar.
- Backup inclui arquivos, não um backup dos seus dados Firestore. A exportação autenticada de dados foi implementada na candidata e aguarda teste real.

## Implementado no frontend candidato
- Dashboard e navegação adaptável a telas menores; chat, memória, finanças, estudos, diário, agenda e configurações.
- Dados em users/{uid}, preservando transactions e messages existentes.
- Propostas determinísticas de receita/despesa e estudo com revisão e edição antes de salvar. Relato completo pode ser salvo separadamente no diário.
- IDs determinísticos e transação Firestore para bloquear duplicata exata de novo registro. Não deduplica retroativamente os IDs aleatórios da V1.
- Busca nos dados carregados, paginação, indicação explícita de relatórios parciais, filtros por datas e categoria, gráficos de despesas, comparação entre mês atual e anterior, meta de receitas e CSV.
- Resultado financeiro separado de saldo bancário; lucro só estimado quando todos os custos foram registrados.
- Acertos/total/erros, minutos, assunto, dificuldade e data de revisão dos estudos.
- Memórias editáveis, lixeira reversível, categorias de perfil, trabalho, academia, projetos e documentos.
- Tarefas com data e status e exportação .ics; lembretes visíveis ao abrir. Não há notificação com site fechado.
- Ditado com SpeechRecognition quando disponível, síntese de fala e botão parar. Requer navegador/dispositivo compatível e permissão; não testado em iPhone/iPad físicos. Não há palavra-chave permanente ou escuta com tela bloqueada.
- Importação de TXT/Markdown até 6 mil caracteres; sem PDF/imagens/OCR.
- Exportação JSON de todas as seções conhecidas com paginação; restauração na mesma conta, adicionando somente IDs ausentes, até 2 mil documentos por operação. Exportação não é snapshot transacional entre coleções.
- Interface de catálogo/modelos compatível com o Worker candidato. O Worker atual não foi confirmado como compatível.

## Backend candidato (pasta backend)
É uma implementação separada para comparação; **não substitui nem representa o código atual do jarbas-cerebro**.
- JWT via jose com assinatura RS256, emissor, audiência, expiração, data de autenticação e UID.
- Email verificado restrito ao proprietário configurado. Não verifica revogação de sessão imediatamente; tokens são aceitos até expirar.
- CORS por lista exata de origens, limite de corpo, prazo de chamadas, erro sem conteúdo pessoal em logs e limite nativo de requisições.
- Somente leitura: recupera até 30 registros de cada uma de cinco coleções do usuário autenticado, escolhe até seis trechos e não escreve no Firestore. Recuperação lexical limitada, não busca vetorial nem acesso a todo o histórico.
- Consulta real a models.list quando implantado e configurado. Disponibilidade NÃO é evidência de gratuidade. FREE_MODELS inicia vazio e bloqueia geração até verificar plano/cota administrativamente. Não ativamos um modelo avançado nem presumimos Gemini 3.8 Flash disponível.
- Seleção simples por complexidade entre modelos aprovados; escolha explícita limitada à mesma lista. Erros de cota não iniciam novas tentativas nem trocam para modelo pago.
- O rate limiter é por localização de execução, não um contador financeiro/dia global. Ainda falta limite diário durável e aferição de consumo real.
- Segredo GEMINI_API_KEY não incluído. Não tentamos extraí-lo da Cloudflare.
- Configuração exemplo tem outro nome para evitar sobrescrever o Worker atual acidentalmente. Não executar deploy antes da comparação e da configuração do segredo.

## Testes executados
- 12 testes frontend: 11 de lógica e 1 fluxo DOM com SDK Firestore isolado, incluindo revisão, gravação, duplicação e logout. Não são testes contra seu Firestore.
- 7 testes backend: assinatura real de JWT de teste, emissor/audiência/expiração, bloqueio de modelos não aprovados, contas/origens/tokens inválidos, rate limit e ausência de fallback após 429. Google/Gemini e Firestore são substitutos controlados nesses testes.
- Sintaxe JavaScript verificada.
- Três testes HTTP reais no Worker público: 403 de origem, 401 sem token, 401 com token inválido.
- Sem teste visual em navegador da nova interface, sem teste móvel físico, sem teste fim a fim autenticado nem consumo real de Gemini nesta rodada.
- firestore.next.rules é uma candidata com validação de esquema e exclusão física bloqueada. NÃO compilada nem publicada; precisa emulador, testes de acesso entre dois usuários e teste dos documentos antigos. firebase.json mantém as regras originais, deliberadamente.

## Integrações
Exportação CSV/JSON/.ics e abertura do chat por Atalhos estão implementadas no código. Calendar, Gmail, Drive e Notion NÃO estão conectados ao app. As conexões do ChatGPT não concedem tokens automaticamente ao Jarbas. Futuros adaptadores devem usar OAuth próprio, menor escopo e confirmação antes de ações externas. Nenhum envio de mensagem, alteração de calendário ou arquivo remoto foi implementado ou simulado.

## Como testar e publicar após reconectar
1. Na raiz: npm ci; npm test. Em backend: npm ci; npm test.
2. Comparar o Worker exportado com backend/worker.js e preservar os recursos existentes. Confirmar plano Free/Spark e limites da chave no painel administrativo.
3. Autenticar Firebase CLI. Verificar as regras e fazer backup autenticado dos dados antes de alterações remotas.
4. Ajustar backend do ambiente candidato, origem exata e catálogo de modelos aprovados. Não copiar segredo para o frontend.
5. Publicar SOMENTE preview: npx -y firebase-tools@latest hosting:channel:deploy jarbas-evolucao --project jarbas-pessoal-felipe-2026 --expires 7d
6. Autorizar o domínio exato retornado no Firebase Authentication e no CORS do backend, preservando os existentes. Esses ajustes ainda não foram feitos.
7. Testar login real, gravação/leitura/recarregamento, isolamento entre usuários, lixeira/restauração, exportação/importação, voz em Safari iOS e seleção de modelos/cota.
8. Mostrar resultado do preview a Felipe. **Produção só após autorização explícita.** Nunca fazer deploy genérico de auth a partir da configuração antiga: isso pode remover domínios adicionados posteriormente.

## Pendências principais
Acessos administrativos; backup dos dados reais; auditoria do Worker existente; regras remotas e migração compatível; catálogo real e cota Gemini; resumo persistente de conversas; limite diário durável; anexos multimodais; notificações push; OAuth dos serviços externos; teste visual/mobile e publicação.

## Referências técnicas consultadas
https://firebase.google.com/docs/auth/admin/verify-id-tokens
https://ai.google.dev/api/models
https://ai.google.dev/gemini-api/docs/pricing
https://ai.google.dev/gemini-api/docs/rate-limits
https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
