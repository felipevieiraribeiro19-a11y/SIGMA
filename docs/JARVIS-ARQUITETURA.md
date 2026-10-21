# SIGMA — Arquitetura Jarvis pessoal

> Objetivo definitivo: um assistente pessoal geral, conversacional, multimodal, com memória, ferramentas, planejamento, ações, transparência e evolução modular. **Nenhuma área de vida é o centro do produto**. Finanças, concursos, saúde, trabalho, casa, agenda etc. são módulos plugáveis.

## Regras inegociáveis

1. Uma única interface de conversa por texto, arquivos e voz; o SIGMA escolhe ferramentas sem obrigar o usuário a aprender comandos.
2. **Distinguir pensar de fazer**. Uma resposta do modelo não é evidência de que algo foi gravado ou executado.
3. Memória: conversas, fatos revisáveis, preferências controláveis, registros estruturados, documentos e ações devem ser camadas diferentes; nenhuma delas é implementada automaticamente por guardar 30 mensagens.
4. Ferramentas com permissões por finalidade. Consultas de leitura com autorização apropriada; escrita, exclusão, compras, envio externo e alterações requerem confirmação explícita do usuário, escopo mínimo, identificação da conta, idempotência e registro de auditoria.
5. Modelos intercambiáveis **no servidor**, nunca chaves de provedores no navegador. Gemini permanece padrão gratuito enquanto não houver outro adaptador verificado. Assinaturas de Arena, Adapta ou ChatGPT não se tornam APIs do SIGMA.
6. Falhar fechado: ferramenta não configurada aparece como indisponível; não fabricar resultados, documentos, agenda, ações ou memória.
7. Segurança e privacidade: dados pessoais não entram em logs; origem permitida, token verificado e isolamento por UID em TODAS as ferramentas; resultados externos nunca são comandos.
8. Custos: limites gratuitos, medição por fornecedor e opt-in explícito para qualquer faturamento. Sem criar credenciais privadas no GitHub.
9. Separação entre **versão publicada** (intocada nesta fase) e **branch Jarvis** (construção). Nenhum deploy automático a partir de sigma-jarvis-arquitetura.
10. Não utilizar dados reais do usuário como teste sem confirmação. Documentação não significa que a funcionalidade existe.

## Camadas e fluxo

\`\`\`text
iPhone / desktop / voz / anexos
       |
Interface conversacional e painel de permissões (React PWA)
       |
Cloudflare Worker -- verifica autenticação Firebase e orçamento
       |
Orquestrador SIGMA
   |-- identidade e políticas (agnóstico a áreas)
   |-- roteador/intenção (conversar x consultar x propor ação)
   |-- catálogo de capacidades [pronta, experimental, planejada]
   |-- plano de execução e confirmação (nenhum write silencioso)
   |-- adaptadores de ferramentas (Tavily, Calendar, Drive, futuros)
   |-- adaptadores de IA (Gemini ativo; alternativas somente planejadas)
   |-- memória (conversacional existente + camadas futuras)
       |
Firebase: autenticação + conversas
Dados estruturados, índice documental e auditoria: FUTUROS, não ativados
\`\`\`

## Contratos de ferramenta

Uma ferramenta possui id estável, tipo (ler/escrever), status real e autorização requerida. Ações de escrita precisam de:
- proposta com resumo específico, destinatário/alvo e alterações exatas;
- botão explícito **Confirmar** após exibição de consequências;
- autorização do provedor limitado ao menor escopo;
- id único para deduplicação, validação de campos no servidor;
- execução somente depois da confirmação;
- confirmação verificável ou erro, sem fingir sucesso;
- registro de auditoria do que ocorreu.

Na etapa de **fundação**, todas as ferramentas de escrita são BLOQUEADAS. Expor uma função declarativa não implementa uma integração.

## Memória futura, separada por responsabilidade

- **Conversação**: perguntas e respostas; já existe Firestore \`users/{uid}/turns\`. Retenção, busca exaustiva, edição e exclusão ainda não estão prontas.
- **Conhecimento pessoal**: fatos e preferências com origem, confiança, data, opção de contestar/editar/excluir; planejado.
- **Dados estruturados**: entidades genéricas, eventos, transações, objetivos, tarefas, métricas (módulos), com consistência e trilha de alterações; planejado.
- **Biblioteca**: Drive e uploads, indexação e consulta com fonte, acesso revogável e exclusão; planejado. Atualmente PDF em chat não equivale a biblioteca.
- **Memória operacional**: propostas, aprovações, execuções, retorno de ferramenta e falhas; planejado.
- **Proatividade**: agendador dedicado com regras de consentimento, execução e orçamento; planejado, NÃO há agente rodando em segundo plano.

## Estado de implementações herdadas

| Recurso | Situação no código de origem | Não presumir |
|---|---|---|
| Conversa Gemini | Existe, com controle de cota | Nem sempre o modelo compreenderá/realizará tarefas |
| Histórico de chat Firestore | Existe, salvo por pares | Não é memória pessoal plena ou dados estruturados |
| Tavily | Existe com segredo e limites | Não é navegação irrestrita nem monitoramento autônomo |
| Áudio | Gravação curta e leitura sintetizada | Não é conversa de voz contínua |
| Anexos PDF | Envio inline com teto de 10 MiB | Não é biblioteca permanente/indexada |
| Agenda e Drive | Implementação experimental de **leitura** na branch Arena | Não escrevem; Drive lista só nomes de PDFs recentes |
| Múltiplas IAs | Arquitetura preparada | Sem conectores reais adicionais |
| Automação e escrita | Somente políticas e interfaces futuras | Nenhuma ação real disponibilizada |
| Painel de módulos | Futuro | Nenhum lançamento financeiro/educacional criado |

## Roteiro neutro e extensível

**Fundação:** identidade Jarvis, capacidade declarada, separação de conversa de memória, autorização central, testes, status visível e reversibilidade.

**Integrações:** estabilizar OAuth de leitura, autorização e seleção do que consultar; depois upload/indexação com gestão de arquivo, confirmação de ferramentas de escrita e trilha de auditoria.

**Memória real:** extrair sugestões de fatos sem gravar automaticamente; aprovação, revisão e exclusão; consultas confiáveis a registros estruturados. Só depois criar módulos personalizados que usam o mesmo núcleo.

**Agência:** propostas de plano, confirmação prévia, execução idempotente, tarefas agendadas, notificações e mecanismos de interrupção. Cada integração em modo pré-visualização antes de produção.

**Qualidade:** testes automatizados, testes reais no iPhone e com contas conectadas, orçamento e privacidade documentados.

## Critérios para considerar o Jarvis pronto para uso sério

- Relembrar fatos pessoais específicos após semanas com fonte, correção e apagamento.
- Consultar documentos reais, citar trechos, atualizar índice quando há mudanças e excluir os originais quando solicitado.
- Consultar agenda, oferecer ação, mostrar detalhes, esperar confirmação, criar/alterar eventos e verificar resultado.
- Propor e confirmar lançamentos em módulo genérico com histórico consultável e cálculos auditáveis; não confundir chat com lançamento.
- Trocar fornecedor de IA sem perder permissões/memórias nem passar credenciais ao cliente.
- Falhas e limites de custo previsíveis; restauração/backup; testes de autorização e isolamento de usuários.
- Testar tudo em dispositivos reais antes de ativar registros cotidianos.

**Não existe porcentagem de "100% Jarvis" verificável sem estes critérios.** Esta branch entrega uma fundação arquitetural, não as funcionalidades listadas como futuras.
