const fs = require('fs');
const path = 'D:/doge-code/src/services/api/claude.ts';
let content = fs.readFileSync(path, 'utf8');

// 查找并删除第1729-1768行（环境变量写入和检查代码）
// 同时需要修复 try 块缺失和缩进问题

const lines = content.split('\n');
console.log('原始行数:', lines.length);

// 要删除的范围：1729-1768（从const latestConfig到return语句）
// 删除后需要添加 try 块和查询配置的代码

const startDelete = 1728; // 0-indexed = 1729
const endDelete = 1767;   // 0-indexed = 1768

// 删除指定行
const deletedLines = lines.splice(startDelete, endDelete - startDelete + 1);

console.log('删除的行数:', deletedLines.length);

// 在删除位置插入修复后的代码
lines.splice(startDelete, 0, 
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
);

console.log('新行数:', lines.length);

// 写入文件
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('应用完成');
