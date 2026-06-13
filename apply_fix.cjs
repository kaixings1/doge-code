const fs = require('fs');
const path = 'D:/doge-code/src/services/api/claude.ts';
let content = fs.readFileSync(path, 'utf8');

const lines = content.split('\n');
console.log('原始行数:', lines.length);

// 插入 try 块和修复后的代码
const insertLines = [
  "  try {",
  "    queryCheckpoint('query_client_creation_start')",
  "",
  "    const generator = withRetry(",
  "      () =>",
  "        getAnthropicClient({",
  "          maxRetries: 0, // 禁用自动重试，转而采用手动实现",
  "          model: options.model,",
  "          fetchOverride: options.fetchOverride,",
  "          source: options.querySource,",
  "        }),",
  "      async (anthropic, attempt, context) => {",
  "        attemptNumber = attempt",
  "        isFastModeRequest = context.fastMode ?? false",
  "        start = Date.now()",
  "        attemptStartTimes.push(start)",
  "",
  "        // 👇 添加这三行，别的不要动",
  "        const cbp = process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER || 'openai';",
  "        const rawBase = process.env.ANTHROPIC_BASE_URL || '';",
  "        if (cbp !== 'openai') anthropic.baseURL = rawBase.replace(/\\/+$/, '');",
  "        // 👆",
  "",
  "        const params = paramsFromContext(context)",
  "        captureAPIRequest(params, options.querySource)",
  "",
  "        maxOutputTokens = params.max_tokens",
  "",
  "        queryCheckpoint('query_api_request_sent')",
  "        if (!options.agentId) {",
  "          headlessProfilerCheckpoint('api_request_sent')",
  "        }",
  "",
  "        clientRequestId =",
  "          getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()",
  "            ? randomUUID()",
  "            : undefined",
  "",
  "        // 进程隔离：在每次请求中读取配置（不修改环境变量）",
  "        const apiStorage = readCustomApiStorage()",
  "        const baseURL = apiStorage.baseURL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'",
  "        const compatProvider = apiStorage.baseURL ? (apiStorage.provider || 'openai') : 'openai'",
  "",
  "        if (compatProvider === 'openai') {"
];

// 在1728行（索引1728）后插入
lines.splice(1728, 0, ...insertLines);

console.log('新行数:', lines.length);
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('应用完成');
