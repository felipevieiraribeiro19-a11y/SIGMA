# SIGMA — estudos por conversa

Atualização 20/10/2026

Implementado: tela minimalista, menu de configurações, histórico de relatos e respostas no Firestore via Worker autenticado; carregamento ao entrar, consulta das 100 interações recentes antes de responder; gravação atômica do par relato/resposta; confirmação apenas após commit; identificador estável nas tentativas da mesma mensagem; nova conversa preserva memória; exportação dos registros carregados.

Não confundir implementação com ativação: config.json continua vazio. Nenhuma integração real Firebase/Gemini foi verificada. Worker e regras precisam ser implantados nas contas do usuário. O catálogo Gran não foi importado. Progresso é interpretado a partir dos relatos originais, não há painel estatístico nem campos extraídos automaticamente. Sem exclusão/edição de histórico nesta versão; correções podem ser relatadas como nova mensagem. Sem voz completa.

Validação: build frontend e TypeScript Worker passaram; 13 testes de backend passaram, com doubles para Firebase/Gemini. Testes incluem falha de gravação sem confirmação, recuperação dos relatos e retry sem duplicação quando já recuperado. Browser QA não disponível. Regras são protótipo, não implantadas nem validadas no emulador. Tentativa de consultar bancos pelo CLI bloqueada por cancelamento da aprovação de rede; nenhuma nova tentativa realizada. Standard é o alvo previsto pelo projeto original, a edição do banco real ainda deve ser conferida.

Ativação pendente: identificar novo projeto Firebase Standard/Spark; habilitar Google; autorizar domínio do site; configurar usuário ALLOWED_UID e claim sigmaAccess por ambiente administrativo; validar regras no emulador e implantar; configurar Worker e segredo Gemini; preencher configuração pública; testar login, bloqueio de outra conta, conversa real, recarregar e perguntar onde parou. Não publicar regras sem validação.

Limites: consulta no máximo 100 interações por pergunta. Histórico antigo permanece guardado mas pode não ser recuperado. Não gerar totais históricos completos. Dois envios concorrentes com mesmo id podem consumir duas chamadas de IA, mas create-only impede duplicação de documento. Um timeout pode ocorrer após commit; retry reutiliza id nesta página. Não trocar o texto antes do retry se quiser reutilizar id. Por enquanto não há retenção automática.

Ajuste visual adicional: identidade futurista moderada, núcleo com anéis orbitais, fundo com grade sutil, acabamento luminoso azul/ciano. Mesmos controles e fluxo. Movimento decorativo respeita prefers-reduced-motion. Compilação verificada; sem QA de navegador disponível.

Fundo refinado conforme pedido: rede orgânica em canvas, ramificações entre pontos e pulsos azul-claro. Animação limitada a ~30fps, densidade proporcional à tela, DPR máximo 2, pausa com página oculta e versão estática com redução de movimento. Não representa estado real de IA/conectividade.
