import fs from 'fs';
// 1. 修复.env.example中baseURL提取问题
let c = fs.readFileSync('D:/doge-code/provider-configs/.env.example', 'utf-8');
// 清理baseURL行中多余的引号和分号
c = c.split('# Base URL: api.deepseek.com//x22;//n').join('# Base URL: https://api.deepseek.com//n');
c = c.split('api.together.').join('https://api.together.xyz');
c = c.split('ai-gateway.vercel.sh//x22;//ne').join('https://ai-gateway.vercel.sh');
c = c.split('//x22;//n').join('//n');
fs.writeFileSync('D:/doge-code/provider-configs/.env.example', c, 'utf-8');

// 2. 统计结果
const authFiles = fs.readdirSync('D:/doge-code/provider-configs/auth').length;
const modelsPath = 'D:/doge-code/provider-configs/models/all-providers.json';
const models = JSON.parse(fs.readFileSync(modelsPath, 'utf-8'));
const totalModels = models.reduce((s, p) => s + p.modelCount, 0);
const withUrl = models.filter(p => p.baseUrl).length;
const withEnv = models.filter(p => p.envVars.length > 0).length;

console.log('========== 整合完成统计 ==========');
console.log('Provider总数: ' + authFiles);
console.log('可提取模型数: ' + totalModels);
console.log('有BaseURL: ' + withUrl);
console.log('有环境变量: ' + withEnv);
console.log('');
console.log('生成文件:');
console.log(' provider-configs/PROVIDER_INDEX.md - 83个Provider索引');
console.log(' provider-configs/auth/*.json - 83个认证配置文件');
console.log(' provider-configs/models/all-providers.json - 模型统计数据');
console.log(' provider-configs/models/core-providers.json - 核心提供商数据');
console.log(' provider-configs/.env.example - 环境变量参考');
console.log(' provider-configs/provider-env-map.json - 环境变量映射表');
console.log('');
console.log('Provider分类:');
const categories = {
 modelApi: ['deepseek','ollama','openai','anthropic','google','groq','mistral','openrouter','vllm','xai','nvidia','together','perplexity','huggingface','sglang','deepgram','elevenlabs','fal','chutes','synthetic','venice','byteplus','volcengine','modelstudio','cloudflare-ai-gateway','github-copilot','kimi-coding','moonshot','minimax','qianfan','kilocode','open-prose','litellm','vercel-ai-gateway','microsoft','microsoft-foundry','amazon-bedrock','copilot-proxy','openai','opencode','opencode-go'],
 messaging: ['discord','telegram','slack','whatsapp','signal','line','feishu','irc','matrix','msteams','nextcloud-talk','nostr','tlon','twitch','googlechat','imessage','lobster','mattermost','synology-chat','zalo','zalouser','xiaomi','bluebubbles'],
 tools: ['acpx','device-pair','diagnostics-otel','diffs','llm-task','openshell','phone-control','thread-ownership','browser','brave','duckduckgo','exa','firecrawl','tavily','memory-core','memory-lancedb','askonce','talk-voice','voice-call']
};
Object.entries(categories).forEach(([k, v]) => {
 const available = v.filter(name => fs.existsSync('D:/doge-code/provider-configs/auth/' + name + '.json'));
 console.log(' ' + k + ': ' + available.length + '个');
});
