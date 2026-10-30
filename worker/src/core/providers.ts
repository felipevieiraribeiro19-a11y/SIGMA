/**
 * Roteador de provedores de modelo. Leve de propósito: apenas monta a requisição
 * e normaliza a resposta. Não guarda estado, não escolhe por heurística de custo
 * e não altera o contrato que o Worker já consome.
 *
 * O Gemini continua sendo o único provedor com function calling traduzido, porque
 * o restante do laboratório lê `parts[].functionCall`. Provedores novos servem texto.
 */
export type ProviderId = 'gemini' | 'deepseek' | 'openai' | 'anthropic';

export type ChatMessage = { role: 'user' | 'assistant'; text: string };

export type ProviderEnv = {
  LAB_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
};

export type ModelRoute = { provider: ProviderId; model: string; key: string };

/** Formato que o restante do laboratório já sabe ler (o do Gemini). */
export type ReplyPart = { text?: string; thought?: boolean; functionCall?: unknown };
export type NormalizedReply = { parts: ReplyPart[]; provider: ProviderId };

export type ChatRequestInput = {
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  timeoutMs: number;
  /** Só é usado quando o provedor suporta tool calling no formato esperado. */
  geminiTools?: unknown[];
};

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: 'gemini-3.5-flash-lite',
  deepseek: 'deepseek-flash',
  openai: 'gpt-6-luna',
  anthropic: 'claude-sonnet-4-5',
};

const PROVIDERS: ProviderId[] = ['gemini', 'deepseek', 'openai', 'anthropic'];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDERS as string[]).includes(value);
}

/** Chave configurada para um provedor, ou '' quando ausente. */
export function providerKey(env: ProviderEnv, provider: ProviderId): string {
  const key =
    provider === 'gemini' ? env.GEMINI_API_KEY :
    provider === 'deepseek' ? env.DEEPSEEK_API_KEY :
    provider === 'openai' ? env.OPENAI_API_KEY :
    env.ANTHROPIC_API_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

export function providerModel(env: ProviderEnv, provider: ProviderId): string {
  const configured =
    provider === 'gemini' ? env.GEMINI_MODEL :
    provider === 'deepseek' ? env.DEEPSEEK_MODEL :
    provider === 'openai' ? env.OPENAI_MODEL :
    env.ANTHROPIC_MODEL;
  const value = typeof configured === 'string' ? configured.trim() : '';
  return value || DEFAULT_MODELS[provider];
}

/**
 * Escolha do provedor:
 * - `LAB_PROVIDER` ausente ou inválido  -> Gemini (comportamento atual, sem surpresa)
 * - `LAB_PROVIDER` definido e sem chave -> Gemini, marcando `fellBack`
 * Nunca escolhe sozinho por presença de chave: ligar um provedor é decisão explícita.
 */
export function resolveModelRoute(env: ProviderEnv): { route: ModelRoute; fellBack: boolean; requested: string } {
  const raw = typeof env.LAB_PROVIDER === 'string' ? env.LAB_PROVIDER.trim().toLowerCase() : '';
  const requested = raw || 'gemini';
  const wanted: ProviderId = isProviderId(raw) ? raw : 'gemini';
  if (wanted !== 'gemini') {
    const key = providerKey(env, wanted);
    if (key) return { route: { provider: wanted, model: providerModel(env, wanted), key }, fellBack: false, requested };
    // Chave ausente: cai no Gemini em vez de falhar, para o laboratório seguir utilizável.
  }
  const geminiKey = providerKey(env, 'gemini');
  if (!geminiKey) throw new Error('Nenhum provedor de modelo configurado.');
  return {
    route: { provider: 'gemini', model: providerModel(env, 'gemini'), key: geminiKey },
    fellBack: wanted !== 'gemini',
    requested,
  };
}

/** Provedores que aceitam function calling no formato que o laboratório já interpreta. */
export const supportsTools = (provider: ProviderId): boolean => provider === 'gemini';

const toOpenAiMessages = (input: ChatRequestInput) => [
  { role: 'system', content: input.system },
  ...input.messages.map(m => ({ role: m.role, content: m.text })),
];

const toAnthropicMessages = (input: ChatRequestInput) =>
  input.messages.map(m => ({ role: m.role, content: m.text }));

export function buildChatRequest(route: ModelRoute, input: ChatRequestInput): { url: string; init: RequestInit } {
  const signal = AbortSignal.timeout(input.timeoutMs);
  if (route.provider === 'gemini') {
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(route.model) + ':generateContent';
    return {
      url,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': route.key },
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: input.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
          generationConfig: { maxOutputTokens: input.maxOutputTokens },
          ...(input.geminiTools?.length ? { tools: input.geminiTools } : {}),
        }),
      },
    };
  }
  if (route.provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': route.key,
          'anthropic-version': '2023-06-01',
        },
        signal,
        body: JSON.stringify({
          model: route.model,
          max_tokens: input.maxOutputTokens,
          system: input.system,
          messages: toAnthropicMessages(input),
        }),
      },
    };
  }
  // deepseek e openai compartilham o formato OpenAI.
  const base = route.provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com';
  return {
    url: base + '/v1/chat/completions',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + route.key },
      signal,
      body: JSON.stringify({
        model: route.model,
        max_tokens: input.maxOutputTokens,
        messages: toOpenAiMessages(input),
      }),
    },
  };
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Normaliza a resposta de qualquer provedor para `parts` no formato do laboratório. */
export function parseChatReply(provider: ProviderId, payload: unknown): NormalizedReply {
  const body = (payload || {}) as Record<string, any>;
  if (provider === 'gemini') {
    const parts: ReplyPart[] = [];
    for (const part of body.candidates?.[0]?.content?.parts || []) {
      if (!part || typeof part !== 'object') continue;
      parts.push({
        ...(typeof part.text === 'string' ? { text: part.text } : {}),
        ...(part.thought === true ? { thought: true } : {}),
        ...(part.functionCall !== undefined ? { functionCall: part.functionCall } : {}),
      });
    }
    return { parts, provider };
  }
  if (provider === 'anthropic') {
    const parts: ReplyPart[] = [];
    for (const block of body.content || []) {
      if (block?.type === 'text') parts.push({ text: asText(block.text) });
    }
    return { parts, provider };
  }
  const content = body.choices?.[0]?.message?.content;
  // Alguns gateways devolvem array de blocos; aceitamos os dois formatos.
  const text = Array.isArray(content)
    ? content.map((chunk: any) => asText(chunk?.text ?? chunk?.content)).join('')
    : asText(content);
  return { parts: text ? [{ text }] : [], provider };
}
