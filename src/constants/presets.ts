// Auto-generated provider presets
// Source: OpenClaw zero-token extensions + provider-configs/auth/

export type CompatibleApiProvider = 'anthropic' | 'openai';

export type PresetEndpoint = {
  label: string;
  provider: CompatibleApiProvider;
  baseURL: string;
  defaultModel: string;
  apiKeyRequired: boolean;
  group?: string;
  docs?: string;
};

// 本地网络预设（原有 14 个，保持兼容）
export const LOCAL_PRESETS: PresetEndpoint[] = [
  { label: 'Local Proxy (8080)', provider: 'openai', baseURL: 'http://127.0.0.1:8080/v1/chat/completions', defaultModel: 'claude-3-haiku', apiKeyRequired: false },
  { label: 'Local Anthropic (8080)', provider: 'anthropic', baseURL: 'http://127.0.0.1:8080/', defaultModel: 'claude-3-haiku', apiKeyRequired: false },
  { label: 'Ollama (11434)', provider: 'openai', baseURL: 'http://127.0.0.1:11434/v1/chat/completions', defaultModel: 'qwen3.5:0.8b', apiKeyRequired: false },
  { label: 'LMStudio Server (1234)', provider: 'openai', baseURL: 'http://127.0.0.1:1234/v1/chat/completions', defaultModel: 'claude-3-haiku', apiKeyRequired: false },
  { label: 'LMStudio Anthropic (1234)', provider: 'anthropic', baseURL: 'http://127.0.0.1:1234/', defaultModel: 'claude-3-haiku', apiKeyRequired: false },
  { label: 'CC Switch (15721)', provider: 'openai', baseURL: 'http://127.0.0.1:15721/v1/chat/completions', defaultModel: 'qwen9b', apiKeyRequired: false },
  { label: 'ModelScope', provider: 'openai', baseURL: 'https://api-inference.modelscope.cn/v1/chat/completions', defaultModel: 'Qwen/Qwen3.5-397B-A17B', apiKeyRequired: true },
  { label: 'NVIDIA NIM', provider: 'openai', baseURL: 'https://integrate.api.nvidia.com/v1/chat/completions', defaultModel: 'deepseek-ai/deepseek-v4-pro', apiKeyRequired: true },
  { label: 'Zhipu (BigModel)', provider: 'openai', baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', defaultModel: 'GLM-4.7-Flash', apiKeyRequired: true },
  { label: 'DeepSeek API', provider: 'openai', baseURL: 'https://api.deepseek.com/chat/completions', defaultModel: 'deepseek-chat', apiKeyRequired: true },
  { label: 'DeepSeek Anthropic', provider: 'anthropic', baseURL: 'https://api.deepseek.com/Anthropic', defaultModel: 'deepseek-chat', apiKeyRequired: true },
  { label: 'Volcengine Ark', provider: 'openai', baseURL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', defaultModel: 'ep-202...', apiKeyRequired: true },
  { label: 'ZenMux', provider: 'openai', baseURL: 'https://zenmux.ai/api/v1/chat/completions', defaultModel: 'deepseek/deepseek-v4-flash-free', apiKeyRequired: true },
  { label: 'OpenRouter', provider: 'openai', baseURL: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'tencent/hy3-preview:free', apiKeyRequired: true },
];

// OpenClaw 云端/本地 API 预设
export const OPENCLAW_PRESETS: PresetEndpoint[] = [
  // --- Chinese AI ---
  { label: 'DeepSeek (OpenAI)', provider: 'openai', baseURL: 'https://api.deepseek.com/v1/chat/completions', defaultModel: 'deepseek-chat', apiKeyRequired: true, group: 'Chinese AI', docs: 'DEEPSEEK_API_KEY' },
  { label: 'Kimi (Moonshot)', provider: 'openai', baseURL: 'https://api.moonshot.cn/v1/chat/completions', defaultModel: 'moonshot-v1-8k', apiKeyRequired: true, group: 'Chinese AI', docs: 'MOONSHOT_API_KEY' },
  { label: 'Moonshot', provider: 'openai', baseURL: 'https://api.moonshot.cn/v1/chat/completions', defaultModel: 'moonshot-v1-8k', apiKeyRequired: true, group: 'Chinese AI', docs: 'MOONSHOT_API_KEY' },
  { label: 'Baidu Qianfan', provider: 'openai', baseURL: 'https://qianfan.baidubce.com/v2/chat/completions', defaultModel: 'ernie-4.0', apiKeyRequired: true, group: 'Chinese AI', docs: 'QIANFAN_API_KEY' },
  { label: 'Volcengine Ark', provider: 'openai', baseURL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', defaultModel: 'ep-202...', apiKeyRequired: true, group: 'Chinese AI', docs: 'VOLC_API_KEY' },
  { label: 'BytePlus', provider: 'openai', baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions', defaultModel: 'ep-202...', apiKeyRequired: true, group: 'Chinese AI', docs: 'BYTEPLUS_API_KEY' },
  { label: 'ModelStudio', provider: 'openai', baseURL: 'https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions', defaultModel: 'Qwen3.5-27B', apiKeyRequired: true, group: 'Chinese AI', docs: 'MODELSTUDIO_API_KEY' },
  { label: 'MiniMax', provider: 'openai', baseURL: 'https://api.minimax.chat/v1/chat/completions', defaultModel: 'MiniMax-Text-01', apiKeyRequired: true, group: 'Chinese AI', docs: 'MINIMAX_API_KEY' },
  { label: 'Z.AI', provider: 'openai', baseURL: 'https://api.z.ai/v1/chat/completions', defaultModel: 'zai-default', apiKeyRequired: true, group: 'Chinese AI', docs: 'ZAI_API_KEY' },

  // --- US AI ---
  { label: 'OpenAI', provider: 'openai', baseURL: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o', apiKeyRequired: true, group: 'US AI', docs: 'OPENAI_API_KEY' },
  { label: 'Groq', provider: 'openai', baseURL: 'https://api.groq.com/openai/v1/chat/completions', defaultModel: 'llama-3.3-70b-versatile', apiKeyRequired: true, group: 'US AI', docs: 'GROQ_API_KEY' },
  { label: 'Mistral AI', provider: 'openai', baseURL: 'https://api.mistral.ai/v1/chat/completions', defaultModel: 'mistral-large-latest', apiKeyRequired: true, group: 'European AI', docs: 'MISTRAL_API_KEY' },
  { label: 'Codestral', provider: 'openai', baseURL: 'https://codestral.mistral.ai/v1/chat/completions', defaultModel: 'codestral-latest', apiKeyRequired: true, group: 'European AI', docs: 'CODESTRAL_API_KEY' },
  { label: 'Together AI', provider: 'openai', baseURL: 'https://api.together.xyz/v1/chat/completions', defaultModel: 'mistralai/Mixtral-8x22B-Instruct-v0.1', apiKeyRequired: true, group: 'US AI', docs: 'TOGETHER_API_KEY' },
  { label: 'Perplexity', provider: 'openai', baseURL: 'https://api.perplexity.ai/chat/completions', defaultModel: 'sonar-pro', apiKeyRequired: true, group: 'Search AI', docs: 'PERPLEXITY_API_KEY' },
  { label: 'xAI Grok', provider: 'openai', baseURL: 'https://api.x.ai/v1/chat/completions', defaultModel: 'grok-beta', apiKeyRequired: true, group: 'US AI', docs: 'XAI_API_KEY' },
  { label: 'Google Gemini', provider: 'openai', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', defaultModel: 'gemini-2.0-flash', apiKeyRequired: true, group: 'US AI', docs: 'GOOGLE_API_KEY' },
  { label: 'HuggingFace', provider: 'openai', baseURL: 'https://router.huggingface.co/v1/chat/completions', defaultModel: 'mistralai/Mixtral-8x7B-Instruct-v0.1', apiKeyRequired: true, group: 'Community', docs: 'HUGGINGFACE_API_KEY' },
  { label: 'NVIDIA NIM (Cloud)', provider: 'openai', baseURL: 'https://integrate.api.nvidia.com/v1/chat/completions', defaultModel: 'meta/llama-3.1-70b-instruct', apiKeyRequired: true, group: 'GPU Cloud', docs: 'NVIDIA_API_KEY' },
  { label: 'GitHub Copilot', provider: 'openai', baseURL: 'https://api.githubcopilot.com/v1/chat/completions', defaultModel: 'gpt-4o-copilot', apiKeyRequired: true, group: 'US AI', docs: 'COPILOT_GITHUB_TOKEN' },
  { label: 'Chutes AI', provider: 'openai', baseURL: 'https://llm.chutes.ai/v1/chat/completions', defaultModel: 'chutes-default', apiKeyRequired: true, group: 'US AI', docs: 'CHUTES_API_KEY' },
  { label: 'Synthetic', provider: 'openai', baseURL: 'https://api.synthetic.new/v1/chat/completions', defaultModel: 'synthetic-default', apiKeyRequired: true, group: 'US AI', docs: 'SYNTHETIC_API_KEY' },
  { label: 'Venice AI', provider: 'openai', baseURL: 'https://api.venice.ai/v1/chat/completions', defaultModel: 'venice-default', apiKeyRequired: true, group: 'US AI', docs: 'VENICE_API_KEY' },
  { label: 'Fireworks AI', provider: 'openai', baseURL: 'https://api.fireworks.ai/inference/v1/chat/completions', defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct', apiKeyRequired: true, group: 'US AI', docs: 'FIREWORKS_API_KEY' },
  { label: 'Cerebras', provider: 'openai', baseURL: 'https://api.cerebras.ai/v1/chat/completions', defaultModel: 'cerebras-llama-3.3-70b', apiKeyRequired: true, group: 'US AI', docs: 'CEREBRAS_API_KEY' },

  // --- Gateway ---
  { label: 'Vercel AI Gateway', provider: 'openai', baseURL: 'https://ai-gateway.vercel.sh/v1/chat/completions', defaultModel: 'gateway-default', apiKeyRequired: true, group: 'Gateway', docs: 'VERCEL_AI_GATEWAY_API_KEY' },
  { label: 'Cloudflare AI', provider: 'openai', baseURL: 'https://api.cloudflare.com/client/v4/ai/chat/completions', defaultModel: '@cf/meta/llama-3.1-70b', apiKeyRequired: true, group: 'Gateway', docs: 'CLOUDFLARE_API_KEY' },
  { label: 'LiteLLM (Local)', provider: 'openai', baseURL: 'http://localhost:4000/v1/chat/completions', defaultModel: 'gpt-4o', apiKeyRequired: false, group: 'Gateway' },
  { label: 'Wafer', provider: 'anthropic', baseURL: 'https://pass.wafer.ai/v1/', defaultModel: 'claude-sonnet-4-6', apiKeyRequired: true, group: 'Gateway', docs: 'WAFER_API_KEY' },
  { label: 'OpenCode Zen', provider: 'openai', baseURL: 'https://api.opencode.ai/v1/chat/completions', defaultModel: 'opencode-zen', apiKeyRequired: true, group: 'Gateway', docs: 'OPENCODE_API_KEY' },
  { label: 'OpenCode Go', provider: 'openai', baseURL: 'https://api.opencode.ai/v1/chat/completions', defaultModel: 'opencode-go', apiKeyRequired: true, group: 'Gateway', docs: 'OPENCODE_API_KEY' },
  { label: 'AskOnce', provider: 'openai', baseURL: 'http://localhost:3456/v1/chat/completions', defaultModel: 'gpt-4o', apiKeyRequired: false, group: 'Tool' },

  // --- Local ---
  { label: 'vLLM (Local)', provider: 'openai', baseURL: 'http://localhost:8000/v1/chat/completions', defaultModel: 'Qwen2.5-7B-Instruct', apiKeyRequired: false, group: 'Local' },
  { label: 'SGLang (Local)', provider: 'openai', baseURL: 'http://localhost:30000/v1/chat/completions', defaultModel: 'default', apiKeyRequired: false, group: 'Local' },
  { label: 'Copilot Proxy (Local)', provider: 'openai', baseURL: 'http://localhost:8080/v1/chat/completions', defaultModel: 'gpt-4o', apiKeyRequired: false, group: 'Local' },
  { label: 'OpenProse (Local)', provider: 'openai', baseURL: 'http://localhost:8081/v1/chat/completions', defaultModel: 'default', apiKeyRequired: false, group: 'Local' },
  { label: 'Browser (Local)', provider: 'openai', baseURL: 'http://localhost:9222/v1/chat/completions', defaultModel: '', apiKeyRequired: false, group: 'Local' },

  // --- Cloud ---
  { label: 'AWS Bedrock', provider: 'openai', baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com/v1/chat/completions', defaultModel: 'anthropic.claude-3-sonnet', apiKeyRequired: false, group: 'Cloud', docs: 'AWS_ACCESS_KEY_ID' },
  { label: 'Azure OpenAI', provider: 'openai', baseURL: 'https://api.openai.azure.com/v1/chat/completions', defaultModel: 'gpt-4o', apiKeyRequired: true, group: 'Cloud', docs: 'AZURE_API_KEY' },
  { label: 'Microsoft Foundry', provider: 'openai', baseURL: 'https://foundry.azure.com/v1/chat/completions', defaultModel: 'gpt-4o', apiKeyRequired: true, group: 'Cloud', docs: 'AZURE_API_KEY' },

  // --- Tools (non-LLM API) ---
  { label: 'Firecrawl', provider: 'openai', baseURL: 'https://api.firecrawl.dev/v1/chat/completions', defaultModel: '', apiKeyRequired: true, group: 'Tool', docs: 'FIRECRAWL_API_KEY' },
  { label: 'Exa Search', provider: 'openai', baseURL: 'https://api.exa.ai/v1/chat/completions', defaultModel: '', apiKeyRequired: true, group: 'Tool', docs: 'EXA_API_KEY' },
  { label: 'Tavily', provider: 'openai', baseURL: 'https://api.tavily.com/v1/chat/completions', defaultModel: '', apiKeyRequired: true, group: 'Tool', docs: 'TAVILY_API_KEY' },
  { label: 'Brave Search', provider: 'openai', baseURL: 'https://api.search.brave.com/v1/chat/completions', defaultModel: '', apiKeyRequired: true, group: 'Tool', docs: 'BRAVE_API_KEY' },
  { label: 'FAL AI', provider: 'openai', baseURL: 'https://fal.run/v1/chat/completions', defaultModel: '', apiKeyRequired: true, group: 'Tool', docs: 'FAL_KEY' },
  { label: 'ElevenLabs', provider: 'openai', baseURL: 'https://api.elevenlabs.io/v1/chat/completions', defaultModel: '', apiKeyRequired: true, group: 'Tool', docs: 'ELEVENLABS_API_KEY' },
  { label: 'Deepgram', provider: 'openai', baseURL: 'https://api.deepgram.com/v1/chat/completions', defaultModel: '', apiKeyRequired: true, group: 'Tool', docs: 'DEEPGRAM_API_KEY' },
];

export const ALL_PRESETS: PresetEndpoint[] = [...LOCAL_PRESETS, ...OPENCLAW_PRESETS];
