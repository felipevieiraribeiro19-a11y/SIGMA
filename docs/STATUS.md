# SIGMA — estudos por conversa

## Verificação ponta a ponta concluída em 21/10/2026

Tudo abaixo foi confirmado com uso real no site `https://sigma-61328.web.app`, não por inspeção de código:

| Item | Resultado |
|---|---|
| Login Google + conta autorizada | ✅ a conversa respondeu |
| Gemini (modelo e chave) | ✅ respondeu em português |
| `ALLOWED_UID` / claim administrativa | ✅ conta entrou e foi aceita |
| Gravação no Firestore | ✅ "Conversa salva no Firebase" |
| Tavily (busca gratuita) | ✅ retornou fontes com links clicáveis |

Com isso, os quatro pontos que estavam "não verificados em execução" na versão anterior deste documento estão fechados. O que resta é decisão de produto, não de infraestrutura: retenção/exclusão de registros, integração com Drive/Calendar dentro do backend e catálogo Gran.

Duas correções nasceram desse teste real (branch `arena/7a99dbb6-sigma`, PR #2):

1. **Detector de pesquisa.** A frase "quais as novidades do concurso ... esta semana? mostre as fontes" não acionava busca. Causas: "mostre as fontes" não era reconhecido; "novidades" só valia com "últimas"; e o regex de assunto era `editais?`, que **nunca** casava com o singular "edital". Corrigido, com testes nos dois sentidos — pedidos sobre "fontes do direito administrativo" e relatos pessoais continuam não gastando cota.
2. **Contexto da conversa.** A interface cortava apenas por quantidade (15 mensagens), não por tamanho, e o limite por resposta de assistente era 12.000 no servidor contra 16.000 na geração. Uma resposta longa fazia a mensagem seguinte ser recusada. Agora `src/history.ts` corta por orçamento de caracteres, garante que o histórico comece com fala do usuário e o limite por resposta foi alinhado em 16.000.

## Estado verificado em 21/10/2026 (substitui afirmações anteriores de "nada implantado")

Verificado por fora do aplicativo — GitHub (runs, branches, PRs) e leitura do site publicado:

- Worker `sigma-cerebro` publicado na Cloudflare (run `sigma-cloudflare`, concluído com sucesso).
- Site definitivo publicado em `https://sigma-61328.web.app` (run `sigma-production`, concluído com sucesso); a página carrega e renderiza.
- `public/config.json` **não está vazio**: aponta para o projeto Firebase `sigma-61328` e para a URL do Worker.
- Todo deploy parte de `sigma-work-integracao` e passa por `npm ci`, build, testes e `check:worker` antes de publicar. `main` está atrás dessa branch; merge em `main` não publica nada.

Continua **não verificado em tempo de execução** (depende de uso real, não de código):

1. existência do secret `TAVILY_API_KEY` no Worker — sem ele, pedido explícito de pesquisa retorna 503;
2. `ALLOWED_UID` e claim `sigmaAccess` corretos para a conta autorizada;
3. se as regras de `firestore.rules` publicadas no console correspondem a este arquivo — **nenhum workflow publica regras**; até 21/10 isso era feito manualmente. O workflow `sigma-firestore-rules` agora existe, mas exige execução manual com confirmação;
4. se `gemini-3.5-flash-lite` existe e responde na conta usada — se não existir, toda conversa falha com 502 mesmo com tudo publicado.

Teste que resolve os quatro, na ordem: login e conversa curta (1 e 4); pergunta com data e fontes (2); recarregar a página e conferir o histórico (3).

Risco conhecido de latência, não de segurança: a interface envia até 15 mensagens, mas o Worker recusa mensagem de assistente acima de 12.000 caracteres. Uma resposta longa (limite de 16.000) pode fazer a conversa seguinte ser recusada com "Mensagem inválida ou muito longa". Ainda não corrigido.

## Atualização 20/10/2026

Implementado: tela minimalista, menu de configurações, histórico de relatos e respostas no Firestore via Worker autenticado; carregamento ao entrar, consulta das 100 interações recentes antes de responder; gravação atômica do par relato/resposta; confirmação apenas após commit; identificador estável nas tentativas da mesma mensagem; nova conversa preserva memória; exportação dos registros carregados.

Não confundir implementação com ativação: em 21/10/2026 o site e o Worker deixaram de ser apenas código e passaram a estar publicados (ver seção de estado verificado no topo). O que continua sem verificação é o comportamento em tempo de execução: segredo Tavily, claim e UID autorizado, regras publicadas no console e o identificador do modelo Gemini. O catálogo Gran não foi importado. Progresso é interpretado a partir dos relatos originais, não há painel estatístico nem campos extraídos automaticamente. Sem exclusão/edição de histórico nesta versão; correções podem ser relatadas como nova mensagem. Sem voz completa.

Validação: build frontend e TypeScript Worker passaram; 13 testes de backend passaram, com doubles para Firebase/Gemini. Testes incluem falha de gravação sem confirmação, recuperação dos relatos e retry sem duplicação quando já recuperado. Browser QA não disponível. Regras são protótipo, não implantadas nem validadas no emulador. Tentativa de consultar bancos pelo CLI bloqueada por cancelamento da aprovação de rede; nenhuma nova tentativa realizada. Standard é o alvo previsto pelo projeto original, a edição do banco real ainda deve ser conferida.

Ativação pendente: identificar novo projeto Firebase Standard/Spark; habilitar Google; autorizar domínio do site; configurar usuário ALLOWED_UID e claim sigmaAccess por ambiente administrativo; validar regras no emulador e implantar; configurar Worker e segredo Gemini; preencher configuração pública; testar login, bloqueio de outra conta, conversa real, recarregar e perguntar onde parou. Não publicar regras sem validação.

Limites: consulta no máximo 100 interações por pergunta. Histórico antigo permanece guardado mas pode não ser recuperado. Não gerar totais históricos completos. Dois envios concorrentes com mesmo id podem consumir duas chamadas de IA, mas create-only impede duplicação de documento. Um timeout pode ocorrer após commit; retry reutiliza id nesta página. Não trocar o texto antes do retry se quiser reutilizar id. Por enquanto não há retenção automática.

Ajuste visual adicional: identidade futurista moderada, núcleo com anéis orbitais, fundo com grade sutil, acabamento luminoso azul/ciano. Mesmos controles e fluxo. Movimento decorativo respeita prefers-reduced-motion. Compilação verificada; sem QA de navegador disponível.

Fundo refinado conforme pedido: rede orgânica em canvas, ramificações entre pontos e pulsos azul-claro. Animação limitada a ~30fps, densidade proporcional à tela, DPR máximo 2, pausa com página oculta e versão estática com redução de movimento. Não representa estado real de IA/conectividade.
