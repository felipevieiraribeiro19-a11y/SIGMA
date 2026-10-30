# Roteiro — trocar de provedor de modelo (laboratório)

O roteador está em `worker/src/core/providers.ts`. Ele monta a requisição e normaliza a resposta; nada mais no Worker mudou de contrato.

**Situação padrão: Gemini.** Sem a variável `LAB_PROVIDER`, o caminho de código executado é *exatamente* o anterior. Isso é garantido por teste (`sigma-provider-router.test.ts`).

| Provedor | Modelo padrão | Formato |
|---|---|---|
| `gemini` | `gemini-3.5-flash-lite` | API própria do Google (mantida) |
| `deepseek` | `deepseek-flash` | OpenAI-compatible |
| `openai` | `gpt-6-luna` | OpenAI-compatible |
| `anthropic` | `claude-sonnet-4-5` | Messages API |

## Como ligar

1. Grave a chave como secret do Worker de laboratório:
   ```bash
   cd worker
   npx wrangler secret put DEEPSEEK_API_KEY --name sigma-jarvis-cerebro-lab
   ```
   (ou `OPENAI_API_KEY`, ou `ANTHROPIC_API_KEY`)

2. No `worker/wrangler.chat-lab.toml`, descomente e ajuste:
   ```toml
   LAB_PROVIDER = "deepseek"
   # DEEPSEEK_MODEL = "deepseek-flash"     # opcional
   ```

3. Publique:
   ```bash
   npx wrangler deploy --config wrangler.chat-lab.toml
   ```

A resposta do chat passa a trazer `"provider": "deepseek"`. Se você pedir um provedor sem a chave correspondente, ele **volta para o Gemini** em vez de falhar — e a resposta mostra `"provider": "gemini"`, então dá para perceber.

## Limitação desta etapa, de propósito

Provedores diferentes de Gemini respondem **somente texto**. A resposta vem com `"toolProposalsDisabled": true`.

O motivo é concreto: as propostas de tarefa, projeto e ação externa dependem de `parts[].functionCall`, que é o formato do Gemini. Traduzir function calling para OpenAI/Anthropic exigiria mexer no fluxo de confirmação e auditoria — justamente a parte que não pode quebrar. Fica para quando houver uso real dos outros provedores.

Consequência prática: com `LAB_PROVIDER` em DeepSeek ou Claude, o chat conversa, consulta memória, pesquisa e lê agenda — mas **não cria tarefas automaticamente**.

## Custo

Nenhum provedor é acionado sem a chave existir, e nada roda em background. Trocar de provedor é uma linha no `.toml`; voltar ao Gemini é apagar essa linha.

## O que **não** foi feito

- Produção (`sigma-cerebro` / `index.ts`) continua 100% Gemini. Nenhuma linha alterada.
- Sem medição de custo por requisição, sem contador de tokens durável.
- Sem fallback automático em caso de erro do provedor escolhido — se a chamada falhar, a resposta é 502, como já era.
