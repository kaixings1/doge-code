/**
 * 多上游 provider 路由层
 *
 * 按 model 前缀把请求分发到不同供应商：
 *   groq/llama-3.3-70b-versatile   → api.groq.com
 *   google/gemini-2.0-flash-exp    → Google AI
 *   openrouter/auto                → openrouter.ai
 *   together/...                   → Together AI
 *   无前缀 / deepseek-*            → copilot.tencent.com（WorkBuddy，默认）
 *
 * 环境变量凭据：
 *   GROQ_API_KEY / OPENROUTER_API_KEY / TOGETHER_API_KEY / GOOGLE_API_KEY
 */

// ─── provider 定义 ───────────────────────────────────────────

export const PROVIDERS = Object.freeze({
  workbuddy: {
    id: 'workbuddy',
    label: 'WorkBuddy',
    prefix: '',
    baseUrl: null, // 动态取 session.endpoint
    authType: 'session',
    apiKeyEnv: null,
    openaiCompatible: true,
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    prefix: 'groq/',
    baseUrl: 'https://api.groq.com/openai/v1',
    authType: 'apiKey',
    apiKeyEnv: 'GROQ_API_KEY',
    openaiCompatible: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    prefix: 'openrouter/',
    baseUrl: 'https://openrouter.ai/api/v1',
    authType: 'apiKey',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    openaiCompatible: true,
  },
  together: {
    id: 'together',
    label: 'Together AI',
    prefix: 'together/',
    baseUrl: 'https://api.together.xyz/v1',
    authType: 'apiKey',
    apiKeyEnv: 'TOGETHER_API_KEY',
    openaiCompatible: true,
  },
  google: {
    id: 'google',
    label: 'Google AI',
    prefix: 'google/',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'apiKey',
    apiKeyEnv: 'GOOGLE_API_KEY',
    openaiCompatible: false, // Gemini 格式不同，需转换
  },
});

// ─── 路由解析 ────────────────────────────────────────────────

/**
 * 根据 modelId 解析 provider 和原始模型 ID。
 * 返回 { provider, rawModelId }。
 * 无前缀匹配时落到 workbuddy。
 */
export function resolveProvider(modelId) {
  if (!modelId) return { provider: PROVIDERS.workbuddy, rawModelId: '' };
  const id = String(modelId).trim();
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    if (key === 'workbuddy') continue;
    if (id.startsWith(provider.prefix)) {
      return { provider, rawModelId: id.slice(provider.prefix.length) };
    }
  }
  return { provider: PROVIDERS.workbuddy, rawModelId: id };
}

/**
 * 读取 provider 的 API key（环境变量）。
 * WorkBuddy 返回 null（走 session 鉴权）。
 */
export function loadProviderApiKey(provider) {
  if (!provider || provider.authType !== 'apiKey' || !provider.apiKeyEnv) return null;
  const key = process.env[provider.apiKeyEnv];
  return key && key.trim() ? key.trim() : null;
}

/**
 * 判断 provider 是否已配置（有 API key 或走 session）。
 */
export function isProviderAvailable(provider) {
  if (!provider) return false;
  if (provider.authType === 'session') return true;
  return !!loadProviderApiKey(provider);
}

// ─── 内置免费模型目录 ────────────────────────────────────────

export const PROVIDER_MODELS = Object.freeze({
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Groq)', maxOutputTokens: 32000, maxInputTokens: 128000, supportsToolCall: true, supportsImages: false, isDefault: true, descriptionZh: 'Groq 免费加速，Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Groq)', maxOutputTokens: 8000, maxInputTokens: 128000, supportsToolCall: true, supportsImages: false, descriptionZh: 'Groq 免费加速，Llama 3.1 8B' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)', maxOutputTokens: 32000, maxInputTokens: 32768, supportsToolCall: true, supportsImages: false, descriptionZh: 'Groq 免费加速，Mixtral 8x7B' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Groq)', maxOutputTokens: 8000, maxInputTokens: 8000, supportsToolCall: true, supportsImages: false, descriptionZh: 'Groq 免费加速，Gemma 2 9B' },
  ],
  openrouter: [
    { id: 'auto', name: 'Auto (OpenRouter)', maxOutputTokens: 32000, maxInputTokens: 128000, supportsToolCall: true, supportsImages: true, isDefault: true, descriptionZh: 'OpenRouter 自动选择' },
    { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick (OpenRouter Free)', maxOutputTokens: 32000, maxInputTokens: 128000, supportsToolCall: true, supportsImages: true, descriptionZh: 'OpenRouter 免费模型' },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (OpenRouter Free)', maxOutputTokens: 32000, maxInputTokens: 128000, supportsToolCall: true, supportsImages: true, descriptionZh: 'OpenRouter 免费模型' },
  ],
  together: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', name: 'Llama 3.3 70B Turbo Free (Together)', maxOutputTokens: 32000, maxInputTokens: 128000, supportsToolCall: true, supportsImages: false, isDefault: true, descriptionZh: 'Together AI 免费模型' },
  ],
  google: [
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp (Google)', maxOutputTokens: 32000, maxInputTokens: 128000, supportsToolCall: true, supportsImages: true, isDefault: true, descriptionZh: 'Google AI Studio 免费实验模型' },
  ],
});

/**
 * 为所有已配置 provider 生成带前缀的模型列表，供合并到目录。
 */
export function allProviderModels() {
  const result = [];
  for (const [providerId, models] of Object.entries(PROVIDER_MODELS)) {
    const provider = PROVIDERS[providerId];
    if (!provider || !isProviderAvailable(provider)) continue;
    for (const m of models) {
      result.push({ ...m, id: provider.prefix + m.id });
    }
  }
  return result;
}

/**
 * 获取 provider 的可用模型列表（远程 /v1/models 或内置目录）。
 */
export async function fetchProviderModels(provider, fetchImpl = globalThis.fetch) {
  if (!provider || !provider.openaiCompatible || !provider.baseUrl) return [];
  const apiKey = loadProviderApiKey(provider);
  if (!apiKey) return [];

  try {
    const resp = await fetchImpl(`${provider.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return [];
    const payload = await resp.json();
    const remote = Array.isArray(payload?.data) ? payload.data : [];
    // 过滤为对话模型（有 max_output_tokens 或 context_length）
    return remote
      .filter(m => typeof m.id === 'string' && m.id)
      .map(m => ({
        id: provider.prefix + m.id,
        name: m.name || m.id,
        owned_by: provider.id,
        maxOutputTokens: m.max_output_tokens || m.maxOutputTokens || 8192,
        maxInputTokens: m.context_length || 8192,
        supportsToolCall: true,
        supportsImages: false,
        isDefault: false,
      }));
  } catch {
    return [];
  }
}
