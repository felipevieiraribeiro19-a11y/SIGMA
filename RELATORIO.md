# S.I.G.M.A. — revisão do ZIP em 19/10/2026

## Estado
Candidata corrigida e testada localmente, **não publicada**. Nenhum dado remoto foi excluído/sobrescrito e nenhum serviço pago foi habilitado. O ZIP recebido foi preservado antes das alterações. Os dados reais do Firestore não foram exportados nesta sessão.

Foram lidos os 22 arquivos do ZIP: interface, app, utilitários, Worker candidato, testes, regras, configurações, manifests, dependências e instruções. Conferidos os requisitos da conversa atual e os trechos recuperados do outro chat. A transcrição integral do outro chat não foi acessível; requisitos consolidados em docs/REQUISITOS.md.

## Corrigido ou acrescentado nesta revisão
- Identidade S.I.G.M.A., Σ e descrição completa na interface; IDs Firebase e endpoint Cloudflare preservados.
- PDF escaneado sem texto agora é rejeitado; números de páginas não contam como conteúdo. Prévia limitada a 15 páginas/6.000 caracteres informa corte explicitamente; recurso liberado mesmo em falha. Sem OCR.
- Valores monetários malformados não viram sugestões truncadas. Relatos com receita de Uber e despesa de combustível recebem categorias separadas.
- Comparação financeira no chat agora inclui mês anterior e explica diferença entre mês completo e mês em andamento.
- IDs determinísticos independem da ordem das propriedades; salvamento também consulta ID legado para preservar proteção contra duplicatas de versões anteriores. Não deduplica retroativamente IDs aleatórios.
- Validação adicional de matérias, desempenho, datas de revisão e memórias vazias; resumo ponderado por matéria no relatório de estudos.
- Histórico acessível, lixeira/restauração e seleção das últimas 12 mensagens carregadas para edição como memória. A seleção não é um resumo semântico por IA.
- Opt-in separado para contexto pessoal e histórico. Desligados por padrão. Worker candidato respeita ambos; cliente consulta capabilities antes de chamar chat.
- Resposta e pergunta são salvas juntas em transação Firestore. Checagens de sessão após operações assíncronas evitam salvar resposta na conta que entrou depois. Exportação/importação e leitura de documento cancelam após troca de conta.
- Edição preserva categorias antigas que não estão na lista predefinida. Ações dos cartões retêm a seção original enquanto aguardam confirmação.
- Backend possui adaptador de provedor, somente Gemini habilitado; não faz fallback para OpenAI ou Claude. Tratamento de JSON inválido/erros inesperados sem detalhes sensíveis.
- firebase.json não inclui mais configuração antiga de Authentication; evita sobrescrever domínios autorizados. Header contra enquadramento adicionado.
- Workflows de CI e preview preparados, mais README, gitignore e instruções atualizadas. Preview exige variável de habilitação e segredo externo. Sem publicação automática em produção.
- Candidata de regras atualizada para aceitar preferências de privacidade. Auditoria em docs/AUDITORIA-REGRAS.json.

## Validação
29 testes locais: 19 frontend (lógica, PDF via objeto controlado e fluxo de interface com SDK Firebase simulado) e 10 backend (JWT assinado localmente, origem, conta, cota, memória opcional, UID, resposta inválida). O fluxo de interface testa revisão, gravação, duplicação, estudo, preferências e logout. APIs remotas são simuladas nesses testes.

Não foram testados: login Google real, persistência no Firestore real, resposta Gemini real, PDF real no Safari, voz em iPhone/iPad, regras no emulador, aparência em dispositivos físicos e execução dos workflows no GitHub. Portanto não há aprovação técnica para produção.

## Bloqueios confirmados
- GitHub felipevieiraribeiro19-a11y/SIGMA ainda retorna 404. Não foi possível conferir se o upload ao repositório está completo ou enviar commits.
- Firebase CLI retornou “No authorized accounts”. Nenhuma publicação foi tentada.
- Worker existente não foi obtido. backend/ é candidato separado; não substituí-lo sem auditoria e integração.
- /capabilities pode não existir no Worker online. Nesse caso, IA fica bloqueada com aviso até ajuste; formulários de registros continuam disponíveis. Não publicar frontend sozinho em produção.
- FREE_MODELS segue vazio no exemplo: o candidato não gera até verificar administrativamente plano/cota. Disponibilidade de modelo não prova gratuidade.

## Pendências do projeto completo
Acesso GitHub/Firebase/Cloudflare; backup autenticado dos dados; comparação do Worker e regras remotos; testes reais fim a fim; catálogo/cota real dos modelos; compatibilidade e teste das regras; limite diário durável de consumo; OCR, anexos multimodais, extração de questões, simulados, resumo semântico, memória contextual mais profunda; OAuth Drive/Gmail/Calendar/Notion; evolução supervisionada de código; testes móveis e publicação.

O rate limiter do candidato é por localização de execução, não um teto diário global. Contexto busca no máximo 30 documentos por coleção em cinco coleções e escolhe seis trechos, sem garantir busca completa. Histórico e relatórios sinalizam paginação parcial. Tokens revogados não são consultados em tempo real. Exportação JSON não é snapshot transacional entre coleções; restauração aceita até 2.000 documentos por operação.

Site existente, sem esta atualização: https://jarbas-pessoal-felipe-2026.web.app

Referências para workflows: https://firebase.google.com/docs/hosting/github-integration e https://github.com/FirebaseExtended/action-hosting-deploy
