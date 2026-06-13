const fs = require('fs');
let content = fs.readFileSync('D:/doge-code/src/services/api/claude.ts', 'utf8');
const lines = content.split('\n');

// 第1729-1768行存在问题（环境变量写入）
// 这些行需要被删除并替换为只读配置逻辑

const problematicCodeStart = 1728; // 1729行（0-indexed）
const problematicCodeEnd = 1767;     // 1768行（0-indexed）

// 提取并删除问题代码
const beforeCode = lines.slice(0, problematicCodeStart);
const afterCode = lines.slice(problematicCodeEnd + 1);

// 构建替换代码：删除环境变量写入，改为局部变量
const replacementCode = [
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
  "        // 进程隔离：仅读取配置，不修改环境变量",
  "        const apiStorage = readCustomApiStorage()",
  "        const baseURL = apiStorage.baseURL || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'",
  "        const compatProvider = apiStorage.baseURL ? (apiStorage.provider || 'openai') : 'openai'",
  "",
  "        if (compatProvider === 'openai') {"
];

// 替换
const newLines = [...beforeCode, ...replacementCode, ...afterCode];

// 移除重复的旧代码（1773-1820范围内）
// 查找重复的 "const generator = withRetry" 
const secondGeneratorIndex = newLines.findIndex((line, idx) => 
  idx > 1750 && line.includes('const generator = withRetry')
);

if (secondGeneratorIndex > 0) {
  // 删除重复的块，直到找到 "} catch" 为止
  let deleteEnd = secondGeneratorIndex;
  for (let i = secondGeneratorIndex; i < newLines.length; i++) {
    if (newLines[i].includes('} catch')) {
      deleteEnd = i;
      break;
    }
  }
  console.log(`发现重复代码，从 ${secondGeneratorIndex} 到 ${deleteEnd}`);
  newLines.splice(secondGeneratorIndex, deleteEnd - secondGeneratorIndex + 1);
}

fs.writeFileSync('D:/doge-code/src/services/api/claude.ts', newLines.join('\n'), 'utf8');
console.log('修复完成，新行数:', newLines.length);
