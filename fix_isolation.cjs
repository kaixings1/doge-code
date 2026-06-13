const fs = require('fs');
let content = fs.readFileSync('D:/doge-code/src/services/api/claude.ts', 'utf8');

// 要删除的代码块（第1729-1768行，包括环境变量写入和检查）
const oldBlock = `const latestConfig = readCustomApiStorage();
if (latestConfig.baseURL) {
		process.env.ANTHROPIC_BASE_URL = latestConfig.baseURL;
		if (latestConfig.apiKey) process.env.DOGE_API_KEY = latestConfig.apiKey; else delete process.env.DOGE_API_KEY;
		process.env.ANTHROPIC_MODEL = latestConfig.model || '';
		process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = latestConfig.provider || 'openai';
}

  try {
    queryCheckpoint('query_client_creation_start')
		
		const baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
		const compatProvider = process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER || 'openai';

		// 构建请求地址（不写回环境变量，防止重启后路径叠加）
		const requestUrl = new URL(
		  compatProvider === 'anthropic' ? '/v1/messages' : '/',
		  baseURL.replace(/\/+$/, '')
		).toString();

		// 原有的调试输出可以删除，或保留一行观察
		logForDebugging(\`[request] \${requestUrl} (provider=\${compatProvider})\`, { level: 'debug' });
		logForDebugging(\`[request] ANTHROPIC_BASE_URL=\${process.env.ANTHROPIC_BASE_URL}\`, { level: 'debug' });
		logForDebugging(\`[request] CLAUDE_CODE_COMPATIBLE_API_PROVIDER=\${process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER}\`, { level: 'debug' });


	// 防止在无端点配置时发出真实请求
if (process.env.ANTHROPIC_BASE_URL === 'http://0.0.0.0:1' || !process.env.DOGE_API_KEY) {
  return (async function* () {
    yield {
      type: 'assistant',
      message: {
        model: options.model,
        content: [{ type: 'text', text: '请先使用 /login 配置 API 端点。' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 }
      }
    }
  })() as any;
}`;

// 替换为进程隔离版本
const newBlock = `  try {
    queryCheckpoint('query_client_creation_start')

    const generator = withRetry(`;

// 检查是否找到匹配
if (content.includes('const latestConfig = readCustomApiStorage();')) {
  console.log('找到匹配代码');
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync('D:/doge-code/src/services/api/claude.ts', content, 'utf8');
  console.log('替换完成');
} else {
  console.log('未找到匹配代码，查看附近内容');
  const idx = content.indexOf('let isAdvisorInProgress = false');
  if (idx > 0) {
    console.log(content.substring(idx, idx + 500));
  }
}
