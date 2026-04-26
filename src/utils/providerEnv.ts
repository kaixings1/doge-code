// src/utils/providerEnv.ts

export type ProviderEnvKeys = {
  baseURL: string
  apiKey: string
  model: string
}

const PROVIDER_ENV_MAP: Record<string, ProviderEnvKeys> = {
  deepseek: {
    baseURL: 'DEEPSEEK_BASE_URL',
    apiKey: 'DEEPSEEK_API_KEY',
    model: 'DEEPSEEK_MODEL',
  },
  zhipu: {
    baseURL: 'ZHIPU_BASE_URL',
    apiKey: 'ZHIPU_API_KEY',
    model: 'ZHIPU_MODEL',
  },
  ark: {
    baseURL: 'ARK_BASE_URL',
    apiKey: 'ARK_API_KEY',
    model: 'ARK_MODEL',
  },
  ollama: {
    baseURL: 'OLLAMA_BASE_URL',
    apiKey: 'OLLAMA_API_KEY',
    model: 'OLLAMA_MODEL',
  },
  dashscope: {
    baseURL: 'DASHSCOPE_BASE_URL',
    apiKey: 'DASHSCOPE_API_KEY',
    model: 'DASHSCOPE_MODEL',
  },
  kimi: {
    baseURL: 'KIMI_BASE_URL',
    apiKey: 'KIMI_API_KEY',
    model: 'KIMI_MODEL',
	},
  lms8080: {
    baseURL: '127.0.0.1:1234',
    apiKey: 'LMS8080_API_KEY',
    model: 'lms8080',
	},
  llamaserver: {
    baseURL: '127.0.0.1:8080',
    apiKey: 'LLAMASERVER_API_KEY',
    model: 'LLAMASERVER_MODEL',
	},
	
	
  // 按需添加其他服务商
}

const GENERIC_ENV = {
  baseURL: 'ANTHROPIC_BASE_URL',
  apiKey: 'DOGE_API_KEY',
  model: 'ANTHROPIC_MODEL',
}

/**
 * 根据预设名称尝试读取专属环境变量，失败时回退到通用环境变量。
 */
export function loadConfigFromEnv(presetName?: string): {
  baseURL?: string
  apiKey?: string
  model?: string
} {
  // 防御：确保 presetName 是字符串
  const safeName = typeof presetName === 'string' ? presetName.toLowerCase() : undefined;
  const keys = safeName ? PROVIDER_ENV_MAP[safeName] : undefined;

  const baseURL = keys
    ? process.env[keys.baseURL] || process.env[GENERIC_ENV.baseURL]
    : process.env[GENERIC_ENV.baseURL];
  const apiKey = keys
    ? process.env[keys.apiKey] || process.env[GENERIC_ENV.apiKey]
    : process.env[GENERIC_ENV.apiKey];
  const model = keys
    ? process.env[keys.model] || process.env[GENERIC_ENV.model]
    : process.env[GENERIC_ENV.model];

  return {
    baseURL: baseURL || undefined,
    apiKey: apiKey || undefined,
    model: model || undefined,
  };
}