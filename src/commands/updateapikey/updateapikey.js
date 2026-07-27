/**
 * updateapikey - 从多个数据源拉取免费 API Key 并更新到 .doge/free*.json
 *
 * 数据源:
 *   1. GitHub 公开 Key (alistaitsacle/free-llm-api-keys) — 预算共享 Key
 *   2. GitHub 永久免费层清单 (nejib1/Free-LLM) — 解析注册链接
 *   3. GitHub 永久免费层清单 (amardeeplakshkar/awesome-free-llm-apis) — 解析注册链接
 *   4. 内置永久免费层预设 — 直接生成配置文件（无需 Key）
 *
 * 用法: /updateapikey [all|free5|...|preset|status]
 *   /updateapikey      - 列出当前 Key 状态
 *   /updateapikey all  - 拉取最新 Key 并更新到 free5~freeN
 *   /updateapikey free5 - 仅更新指定编号的配置文件
 *   /updateapikey preset - 生成永久免费层预设配置（free37~free50）
 *   /updateapikey status - 查看所有数据源状态
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// ---------- 日志模块 ----------
const LOG_FILE = path.resolve('updateapikey.log');
const MAX_LOG_SIZE = 2 * 1024 * 1024; // 2MB 自动轮转
function log(level, msg, extra) {
    const timestamp = new Date().toISOString();
    const extraStr = extra ? ' | ' + JSON.stringify(extra) : '';
    const line = `[${timestamp}] [${level}] ${msg}${extraStr}${os.EOL}`;
    try {
        if (fs.existsSync(LOG_FILE)) {
            const stat = fs.statSync(LOG_FILE);
            if (stat.size > MAX_LOG_SIZE) {
                const content = fs.readFileSync(LOG_FILE, 'utf-8');
                const truncated = content.slice(-MAX_LOG_SIZE / 2);
                fs.writeFileSync(LOG_FILE, '[日志截断: 旧日志已清理]\n' + truncated, 'utf-8');
            }
        }
        fs.appendFileSync(LOG_FILE, line, 'utf-8');
    }
    catch {
        // 日志写入失败不阻塞主流程
    }
}
// ---------- 常量 ----------
const RAW_URLS = [
    // 主数据源: 公开共享 Key
    'https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
    'https://raw.fastgit.org/alistaitsacle/free-llm-api-keys/main/README.md',
    'https://gh.axlg.workers.dev/https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
    'https://mirror.ghproxy.com/https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
    // 备用镜像源
    'https://ghfast.top/https://raw.githubusercontent.com/alistaitsacle/free-llm-api-keys/main/README.md',
    'https://raw.gitmirror.com/alistaitsacle/free-llm-api-keys/main/README.md',
    // 辅助数据源: 永久免费层清单（用于扩展可选项）
    'https://ghfast.top/https://raw.githubusercontent.com/nejib1/Free-LLM/main/README.md',
    'https://ghfast.top/https://raw.githubusercontent.com/amardeeplakshkar/awesome-free-llm-apis/main/README.md',
    'https://ghfast.top/https://raw.githubusercontent.com/pacocartones/free-llm-api-hub/main/providers.json',
];
const BASE_OPENAI = 'https://aiapiv2.pekpik.com/v1/chat/completions';
const BASE_ANTHROPIC = 'https://aiapiv2.pekpik.com/';
/** 多端点轮换池：第一个有效端点优先，其余作为 fallback */
const OPENAI_ENDPOINTS = [
    'https://aiapiv2.pekpik.com/v1/chat/completions',
    'https://aiapiv2.pekpik.com/v1/chat/completions',
    'https://openrouter.ai/api/v1/chat/completions',
];
const ANTHROPIC_ENDPOINTS = [
    'https://aiapiv2.pekpik.com/',
];
const DOGE_DIR = path.resolve('.doge');
const TEST_TIMEOUT = 15000; // 每个 Key 测试超时 15 秒
const TEST_MAX_TOKENS = 50; // 请求 50 个 token 验证实际可用性
const SERIAL_DELAY_MS = 2000; // 串行测试时每个 Key 间隔（毫秒），防止触发限流
const FREE_TIER_PRESETS = [
    {
        id: 'free37', name: 'SiliconFlow-Qwen2.5', provider: 'openai',
        baseURL: 'https://api.siliconflow.cn/v1',
        model: 'Qwen/Qwen2.5-7B-Instruct',
        registerURL: 'https://siliconflow.cn',
        note: '国内直连，永久免费模型（需 SMS 注册）'
    },
    {
        id: 'free38', name: 'Zhipu-GLM4.7Flash', provider: 'openai',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
        model: 'glm-4.7-flash',
        registerURL: 'https://open.bigmodel.cn',
        note: '国内直连，永久免费，无明确速率限制'
    },
    {
        id: 'free39', name: 'Aliyun-DashScope', provider: 'openai',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        model: 'qwen2.5-7b-instruct',
        registerURL: 'https://help.aliyun.com/zh/model-studio',
        note: '100万 token/月 免费，国内直连'
    },
    {
        id: 'free40', name: 'Moonshot-v1', provider: 'openai',
        baseURL: 'https://api.moonshot.cn/v1',
        model: 'moonshot-v1-8k',
        registerURL: 'https://platform.moonshot.cn',
        note: '注册送 1500万 token，国内直连'
    },
    {
        id: 'free41', name: 'Groq-LLaMA', provider: 'openai',
        baseURL: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        registerURL: 'https://console.groq.com/keys',
        note: '30 RPM 免费，超快推理（需海外）'
    },
    {
        id: 'free42', name: 'Cerebras-LLaMA', provider: 'openai',
        baseURL: 'https://inference.cerebras.ai/v1',
        model: 'llama-3.1-70b',
        registerURL: 'https://inference.cerebras.ai',
        note: '1M tokens/天 免费（需海外）'
    },
    {
        id: 'free43', name: 'OpenRouter-Free', provider: 'openai',
        baseURL: 'https://openrouter.ai/api/v1',
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        registerURL: 'https://openrouter.ai/settings/keys',
        note: '20+ 免费模型，50 RPD（需海外）'
    },
    {
        id: 'free44', name: 'Google-Gemini', provider: 'openai',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        model: 'gemini-2.5-flash',
        registerURL: 'https://aistudio.google.com/app/apikey',
        note: 'Gemini 2.5 Flash，20 RPD 免费（需海外）'
    },
    {
        id: 'free45', name: 'Mistral-Small', provider: 'openai',
        baseURL: 'https://api.mistral.ai/v1',
        model: 'mistral-small-latest',
        registerURL: 'https://console.mistral.ai/api-keys',
        note: '1 req/s, 1B tokens/month（需海外）'
    },
    {
        id: 'free46', name: 'Cloudflare-AI', provider: 'openai',
        baseURL: 'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct',
        model: '@cf/meta/llama-3.1-8b-instruct',
        registerURL: 'https://dash.cloudflare.com/profile/api-tokens',
        note: '10K neurons/天，需替换 {ACCOUNT_ID}'
    },
    {
        id: 'free47', name: 'Tencent-Hunyuan', provider: 'openai',
        baseURL: 'https://hunyuan.tencentcloudapi.com/v1',
        model: 'hunyuan-lite',
        registerURL: 'https://cloud.tencent.com/product/hunyuan',
        note: '注册送额度，国内直连'
    },
    {
        id: 'free48', name: 'ByteDance-Doubao', provider: 'openai',
        baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
        model: 'doubao-lite-32k',
        registerURL: 'https://console.volcengine.com/ark',
        note: '注册送额度，国内直连'
    },
    {
        id: 'free49', name: 'StepFun-Step1', provider: 'openai',
        baseURL: 'https://api.stepfun.com/v1',
        model: 'step-1-8k',
        registerURL: 'https://platform.stepfun.com',
        note: '注册送额度，国内直连'
    },
    {
        id: 'free50', name: 'Ollama-Local', provider: 'openai',
        baseURL: 'http://localhost:11434/v1',
        model: 'llama3.1:8b',
        registerURL: 'https://ollama.com',
        note: '完全本地，需先 ollama pull llama3.1:8b'
    },
];
/** 从 README 中解析 Key 列表 */
function parseKeys(text) {
    const lines = text.split('\n');
    const keys = [];
    for (const line of lines) {
        // 匹配表格行: | `sk-xxx` | model | budget | ... | expires | status
        const row = line
            .split('|')
            .map(c => c.trim().replace(/^`|`$/g, ''))
            .filter(c => c.length > 0);
        // 表格行应有至少 5 列，且第一列为 sk- 开头
        if (row.length >= 5 && row[0].startsWith('sk-')) {
            keys.push({
                key: row[0],
                model: row[1] || '?',
                budget: row[2] || '?',
                expires: row[row.length - 2] || '?',
                status: row[row.length - 1]?.includes('New') ? '🆕' : row[row.length - 1] || '',
            });
        }
    }
    return keys;
}
/** 从 GitHub 拉取最新 README（自动尝试多个镜像源） */
async function fetchLatestKeys() {
    let lastError = '';
    log('INFO', '开始拉取免费 API Key', { totalUrls: RAW_URLS.length, urls: RAW_URLS });
    for (let i = 0; i < RAW_URLS.length; i++) {
        const url = RAW_URLS[i];
        const startTime = Date.now();
        log('INFO', `尝试镜像源 #${i + 1}`, { url });
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(url, {
                signal: controller.signal,
                // 跳过 SSL 证书验证（Windows 上 GitHub 证书链有时不完整）
                ...(process.platform === 'win32' ? { tls: { rejectUnauthorized: false } } : {}),
            });
            clearTimeout(timeout);
            const elapsed = Date.now() - startTime;
            log('INFO', `镜像源 #${i + 1} 响应`, { url, status: res.status, statusText: res.statusText, elapsedMs: elapsed });
            if (!res.ok) {
                const bodyPreview = await res.text().then(t => t.slice(0, 200)).catch(() => '');
                log('WARN', `镜像源 #${i + 1} 状态码异常`, { url, status: res.status, bodyPreview });
                continue;
            }
            const text = await res.text();
            log('INFO', `镜像源 #${i + 1} 返回数据`, { url, length: text.length, elapsedMs: Date.now() - startTime });
            if (text && text.length > 100) {
                const keys = parseKeys(text);
                log('INFO', `解析成功`, { url, keyCount: keys.length, keys: keys.map(k => ({ model: k.model, budget: k.budget })) });
                return keys;
            }
            else {
                log('WARN', `镜像源 #${i + 1} 返回数据过短`, { url, length: text.length });
            }
        }
        catch (err) {
            const elapsed = Date.now() - startTime;
            const errMsg = err?.message || String(err);
            log('WARN', `镜像源 #${i + 1} 请求失败`, { url, error: errMsg, elapsedMs: elapsed });
            lastError = errMsg;
        }
    }
    log('ERROR', '所有镜像源均失败', { lastError });
    return [];
}
/** 获取当前的 freeN.json 配置文件列表 */
function getExistingConfigs() {
    if (!fs.existsSync(DOGE_DIR))
        return [];
    try {
        return fs.readdirSync(DOGE_DIR)
            .filter(f => /^free\d+\.json$/.test(f))
            .sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, ''));
            const nb = parseInt(b.replace(/\D/g, ''));
            return na - nb;
        });
    }
    catch {
        return [];
    }
}
/** 读取 freeN.json 的内容 */
function readConfig(filename) {
    try {
        const p = path.join(DOGE_DIR, filename);
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    catch {
        return null;
    }
}
/** 写入 freeN.json */
function writeConfig(filename, data) {
    if (!fs.existsSync(DOGE_DIR)) {
        fs.mkdirSync(DOGE_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(DOGE_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
}
/** 获取可用的模型中文名 */
function modelChineseName(model) {
    const names = {
        'deepseek/deepseek-v4-flash': 'DeepSeek-V4-Flash',
        'deepseek/deepseek-v4-pro': 'DeepSeek-V4-Pro',
        'openai/gpt-5.5': 'GPT-5.5',
        'openai/gpt-5.5-pro': 'GPT-5.5-Pro',
        'x-ai/grok-4.3': 'Grok-4.3',
        'google/gemini-3.1-flash-lite': 'Gemini-3.1-Flash-Lite',
        'claude-opus-4-7': 'Claude Opus 4.7',
        'gemini-2.5-flash': 'Gemini 2.5 Flash',
        'qwen/qwen3.5-plus-20260420': 'Qwen3.5-Plus',
        'qwen/qwen3.6-max-preview': 'Qwen3.6-Max',
        // 国内平台
        'Qwen/Qwen2.5-7B-Instruct': 'Qwen2.5-7B',
        'Qwen/Qwen2.5-72B-Instruct': 'Qwen2.5-72B',
        'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B': 'DeepSeek-R1-Distill-7B',
        'deepseek-ai/DeepSeek-V3': 'DeepSeek-V3',
        'GLM-4.7-Flash': 'GLM-4.7-Flash',
        'glm-4.7-flash': 'GLM-4.7-Flash',
        'glm-4.5-flash': 'GLM-4.5-Flash',
        'moonshot-v1-8k': 'Moonshot-v1-8k',
        'moonshot-v1-32k': 'Moonshot-v1-32k',
        'llama-3.3-70b-versatile': 'LLaMA-3.3-70B',
        'llama-3.1-70b': 'LLaMA-3.1-70B',
        'llama-3.1-8b-instant': 'LLaMA-3.1-8B',
        'qwen2.5-7b-instruct': 'Qwen2.5-7B',
        'qwen2.5-72b-instruct': 'Qwen2.5-72B',
        'mistral-small-latest': 'Mistral-Small',
        'hunyuan-lite': 'Hunyuan-Lite',
        'doubao-lite-32k': 'Doubao-Lite-32K',
        'step-1-8k': 'Step-1-8K',
        '@cf/meta/llama-3.1-8b-instruct': 'CF-LLaMA-3.1-8B',
    };
    return names[model] || model;
}
/** 通过多个端点轮换测试单个 Key，429 时自动切换到下一个端点 */
async function testKey(entry) {
    const isAnthropic = entry.model.includes('claude') && !entry.model.includes('openai');
    const endpoints = isAnthropic ? ANTHROPIC_ENDPOINTS : OPENAI_ENDPOINTS;
    const startTime = Date.now();
    for (let epIdx = 0; epIdx < endpoints.length; epIdx++) {
        const endpoint = endpoints[epIdx];
        const epLabel = endpoint.replace(/https?:\/\//, '').split('/')[0];
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT);
            let res;
            if (isAnthropic) {
                res = await fetch(`${endpoint}v1/messages`, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': entry.key,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify({
                        model: entry.model,
                        max_tokens: TEST_MAX_TOKENS,
                        messages: [{ role: 'user', content: 'hi' }],
                    }),
                    ...(process.platform === 'win32' ? { tls: { rejectUnauthorized: false } } : {}),
                });
            }
            else {
                res = await fetch(endpoint, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${entry.key}`,
                    },
                    body: JSON.stringify({
                        model: entry.model,
                        max_tokens: TEST_MAX_TOKENS,
                        messages: [{ role: 'user', content: 'hi' }],
                    }),
                    ...(process.platform === 'win32' ? { tls: { rejectUnauthorized: false } } : {}),
                });
            }
            clearTimeout(timeout);
            const elapsed = Date.now() - startTime;
            if (res.ok) {
                const providerLabel = isAnthropic ? 'Anthropic' : 'OpenAI';
                log('INFO', `Key 测试通过 (${providerLabel})`, { endpoint: epLabel, model: entry.model, elapsedMs: elapsed, keyPreview: entry.key.substring(0, 12) + '...' });
                return { ok: true, status: res.status, message: `通过 (${elapsed}ms, ${epLabel})`, endpoint };
            }
            // 429 / 403 时尝试下一个端点，其他错误直接返回
            if (res.status === 429 || res.status === 403) {
                log('WARN', `端点被限流，尝试备用端点`, { endpoint: epLabel, status: res.status, model: entry.model });
                continue;
            }
            const body = await res.text().catch(() => '');
            const reason = isAnthropic
                ? (body.includes('max_tokens') || body.includes('credits') ? '额度不足' :
                    body.includes('no access') ? '无权访问' :
                        body.includes('expired') ? '已过期' :
                            `状态码 ${res.status}`)
                : (body.includes('402') || body.includes('credits') ? '额度不足' :
                    body.includes('no access') ? '无权访问' :
                        body.includes('expired') ? '已过期' :
                            `状态码 ${res.status}`);
            log('WARN', `Key 测试失败`, { endpoint: epLabel, model: entry.model, status: res.status, reason, elapsedMs: elapsed, keyPreview: entry.key.substring(0, 12) + '...' });
            return { ok: false, status: res.status, message: reason };
        }
        catch (err) {
            const elapsed = Date.now() - startTime;
            const errMsg = err?.message || String(err);
            log('WARN', `端点请求异常，尝试备用端点`, { endpoint: epLabel, error: errMsg, elapsedMs: elapsed });
            // 网络异常时继续尝试下一个端点
            continue;
        }
    }
    const elapsed = Date.now() - startTime;
    log('WARN', `所有端点均失败`, { model: entry.model, elapsedMs: elapsed });
    return { ok: false, message: '所有端点均超时/限流' };
}
/** 生成永久免费层预设配置文件（free37~free50） */
function generateFreeTierPresets() {
    const now = new Date();
    const timeStamp = `[${now.toLocaleString()}]`;
    let output = `${timeStamp} 📋 正在生成永久免费层预设配置 (free37~free${36 + FREE_TIER_PRESETS.length})...\n\n`;
    for (const preset of FREE_TIER_PRESETS) {
        const filename = `${preset.id}.json`;
        const config = {
            provider: preset.provider,
            baseURL: preset.baseURL,
            apiKey: '请替换为你的真实Key', // 用户需要自行填入 Key
            model: preset.model,
            _preset: true,
            _registerURL: preset.registerURL,
            _note: preset.note,
        };
        writeConfig(filename, config);
        output += `  ${filename} ← ${preset.name}\n`;
        output += `    端点: ${preset.baseURL}\n`;
        output += `    模型: ${preset.model}\n`;
        output += `    注册: ${preset.registerURL}\n`;
        output += `    备注: ${preset.note}\n\n`;
    }
    output += `✅ 已生成 ${FREE_TIER_PRESETS.length} 个预设配置\n`;
    output += `💡 使用方式:\n`;
    output += `   1. 访问注册链接获取 API Key\n`;
    output += `   2. 编辑 .doge/${FREE_TIER_PRESETS[0].id}.json 等文件填入 Key\n`;
    output += `   3. 使用 d.bat ${FREE_TIER_PRESETS[0].id} 启动对应配置\n`;
    output += `\n📋 详细日志已写入 updateapikey.log\n`;
    log('INFO', '生成永久免费层预设', { count: FREE_TIER_PRESETS.length });
    return output;
}
/** 查看所有数据源状态 */
function checkDataSourceStatus() {
    const now = new Date();
    const timeStamp = `[${now.toLocaleString()}]`;
    let output = `${timeStamp} 📊 数据源状态检查:\n\n`;
    // 检查 GitHub 源
    output += `=== GitHub 公开 Key 源 ===\n`;
    for (let i = 0; i < RAW_URLS.length; i++) {
        const url = RAW_URLS[i];
        output += `  [${i + 1}] ${url.replace('https://', '')}\n`;
    }
    output += `  主仓库: alistaitsacle/free-llm-api-keys\n`;
    output += `  状态: 可能已被 GitHub 封禁（需备用镜像）\n\n`;
    // 检查现有配置
    const configs = getExistingConfigs();
    output += `=== 当前配置文件 (${configs.length} 个) ===\n`;
    for (const f of configs) {
        const cfg = readConfig(f);
        if (cfg) {
            const keyMask = cfg.apiKey?.length > 15
                ? cfg.apiKey.substring(0, 10) + '...' + cfg.apiKey.slice(-5)
                : cfg.apiKey;
            const preset = cfg._preset ? ' [预设]' : '';
            output += `  ${f}${preset}: ${cfg.model || '?'} | ${cfg.baseURL?.substring(0, 50)}\n`;
        }
    }
    output += `\n`;
    // 列出可用的预设
    output += `=== 可用预设 (free37~free50) ===\n`;
    for (const preset of FREE_TIER_PRESETS) {
        output += `  ${preset.id}: ${preset.name} — ${preset.note}\n`;
    }
    output += `\n`;
    // 可用命令
    output += `=== 可用命令 ===\n`;
    output += `  /updateapikey           - 查看当前状态\n`;
    output += `  /updateapikey all      - 从 GitHub 拉取 Key，更新 free5~free36\n`;
    output += `  /updateapikey free5    - 仅更新指定文件\n`;
    output += `  /updateapikey preset   - 生成永久免费层预设 (free37~free50)\n`;
    output += `  /updateapikey status   - 查看数据源状态（本命令）\n`;
    return output;
}
export const call = async (args, context) => {
    const now = new Date();
    const timeStamp = `[${now.toLocaleString()}]`;
    const cmd = (args || '').trim().toLowerCase();
    /** 通过 context.setMessages 追加或替换最后一条消息 */
    function pushProgress(text, replaceLast = false) {
        if (context?.setMessages) {
            context.setMessages(prev => {
                if (replaceLast && prev.length > 0) {
                    const last = prev[prev.length - 1];
                    if (last.type === 'assistant' && last.isMeta) {
                        return [
                            ...prev.slice(0, -1),
                            { ...last, uuid: `progress-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, message: { content: [{ type: 'text', text }] } },
                        ];
                    }
                }
                return [
                    ...prev,
                    {
                        type: 'assistant',
                        isMeta: true,
                        uuid: `progress-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                        message: { content: [{ type: 'text', text }] },
                    },
                ];
            });
        }
    }
    if (cmd === 'all' || cmd === 'update') {
        log('INFO', '开始执行全量更新', { mode: 'all' });
        pushProgress(`${timeStamp} 🚀 正在从 GitHub 获取最新 Key...`);
        const keys = await fetchLatestKeys();
        if (keys.length === 0) {
            log('ERROR', '全量更新失败：获取 Key 为空');
            return { type: 'text', value: `${timeStamp} ❌ 无法从 GitHub 获取最新 Key。\n\n` +
                    `可能原因:\n` +
                    `  1. 原仓库 alistaitsacle/free-llm-api-keys 已被 GitHub 封禁\n` +
                    `  2. 你的网络环境无法访问 GitHub (DNS 被劫持)\n` +
                    `  3. 项目方可能已更换仓库地址\n\n` +
                    `建议:\n` +
                    `  • 过一两天再试，项目方可能已建新仓库\n` +
                    `  • 关注官网 https://aiapiv2.pekpik.com 获取最新动态\n` +
                    `  • 关注 X/Twitter @getkeyway 获取 Key 投放通知\n` +
                    `📋 详情请查看 updateapikey.log` };
        }
        let output = `✅ 从 GitHub 获取到 ${keys.length} 个免费 Key，开始逐串行测试可用性...\n`;
        output += `   端点池: ${OPENAI_ENDPOINTS.length} 个 (429/403 自动轮换) | 间隔: ${SERIAL_DELAY_MS}ms\n\n`;
        pushProgress(output);
        // 更新 free5~freeN（free1~free4 为注册方案，跳过）
        const startIdx = 5;
        const maxFiles = Math.min(keys.length, 32); // free5~free36，充分利用全部 Key
        let updated = 0;
        let passed = 0;
        let failed = 0;
        for (let localIdx = 0; localIdx < maxFiles; localIdx++) {
            const entry = keys[localIdx];
            const i = startIdx + localIdx; // 实际 free 编号
            const filename = `free${i}.json`;
            const displayName = modelChineseName(entry.model);
            const isAnthropic = entry.model.includes('claude') && !entry.model.includes('openai');
            // 间隔延迟，防止并发触发限流
            if (localIdx > 0) {
                await new Promise(resolve => setTimeout(resolve, SERIAL_DELAY_MS));
            }
            // 先输出正在测试的提示
            pushProgress(`  ${filename} ← ${displayName} ... ⏳`);
            const testResult = await testKey(entry);
            if (testResult.ok) {
                // 测试通过，写入配置（记录实际生效的 endpoint）
                const usedEndpoint = testResult.endpoint || (isAnthropic ? BASE_ANTHROPIC : BASE_OPENAI);
                const config = {
                    provider: isAnthropic ? 'anthropic' : 'openai',
                    baseURL: usedEndpoint,
                    apiKey: entry.key,
                    model: entry.model,
                };
                writeConfig(filename, config);
                log('INFO', `写入配置文件`, { filename, model: entry.model, budget: entry.budget, baseURL: usedEndpoint, keyPreview: entry.key.substring(0, 12) + '...' });
                output += `  ${filename} ← ${displayName} ... ✅ ${testResult.message}\n`;
                passed++;
                updated++;
                pushProgress(`  ${filename} ← ${displayName} ... ✅ ${testResult.message}`, true);
            }
            else {
                output += `  ${filename} ← ${displayName} ... ❌ ${testResult.message}\n`;
                failed++;
                log('INFO', `跳过写入`, { filename, reason: testResult.message });
                pushProgress(`  ${filename} ← ${displayName} ... ❌ ${testResult.message}`, true);
            }
        }
        output += `\n📊 测试结果: ✅ ${passed} 个可用 | ❌ ${failed} 个不可用`;
        output += `\n✅ 已更新 ${updated} 个配置文件（仅写入测试通过的 Key）`;
        if (updated === 0) {
            output += '\n⚠️ 所有 Key 均不可用，可能是代理服务器或 GitHub 源有问题';
        }
        output += `\n💡 现在可以使用 d.bat free${startIdx}~free${startIdx + updated - 1} 启动`;
        log('INFO', '全量更新完成', { total: maxFiles, passed, failed, updated });
        return { type: 'text', value: timeStamp + '\n' + output };
    }
    else if (cmd.startsWith('free')) {
        // 更新单个文件
        const idx = parseInt(cmd.replace(/\D/g, ''));
        if (idx < 5) {
            return { type: 'text', value: `${timeStamp} ❌ free${idx} 是注册方案，本命令仅支持更新 free5 及以上配置文件。` };
        }
        log('INFO', `开始更新单个配置文件`, { filename: `free${idx}.json` });
        pushProgress(`${timeStamp} 🚀 正在从 GitHub 获取最新 Key...`);
        const keys = await fetchLatestKeys();
        if (keys.length === 0) {
            log('ERROR', `free${idx} 更新失败：获取 Key 为空`);
            return { type: 'text', value: `${timeStamp} ❌ 无法从 GitHub 获取最新 Key。\n\n` +
                    `可能原因:\n` +
                    `  1. 原仓库 alistaitsacle/free-llm-api-keys 已被 GitHub 封禁\n` +
                    `  2. 你的网络环境无法访问 GitHub (DNS 被劫持)\n` +
                    `  3. 项目方可能已更换仓库地址\n\n` +
                    `建议:\n` +
                    `  • 过一两天再试，项目方可能已建新仓库\n` +
                    `  • 关注官网 https://aiapiv2.pekpik.com 获取最新动态\n` +
                    `  • 关注 X/Twitter @getkeyway 获取 Key 投放通知\n` +
                    `📋 详情请查看 updateapikey.log` };
        }
        // free5 对应 keys[0]
        const localIdx = idx - 5;
        if (localIdx < 0 || localIdx >= keys.length) {
            log('WARN', `free${idx} 超出范围`, { localIdx, keyCount: keys.length });
            return { type: 'text', value: `${timeStamp} ❌ free${idx} 超出范围，目前可用免费 Key 范围 free5~free${keys.length + 4}` };
        }
        const entry = keys[localIdx];
        const filename = `free${idx}.json`;
        const isAnthropic = entry.model.includes('claude') && !entry.model.includes('openai');
        const displayName = modelChineseName(entry.model);
        // 先输出正在测试的提示
        pushProgress(`📡 正在测试 ${displayName} ... ⏳`);
        // 先测试可用性
        const testResult = await testKey(entry);
        let output = `📡 测试 ${displayName} ... ${testResult.ok ? '✅' : '❌'} ${testResult.message}\n`;
        if (testResult.ok) {
            // 测试通过才写入
            const config = {
                provider: isAnthropic ? 'anthropic' : 'openai',
                baseURL: isAnthropic ? BASE_ANTHROPIC : BASE_OPENAI,
                apiKey: entry.key,
                model: entry.model,
            };
            writeConfig(filename, config);
            log('INFO', `配置文件已更新`, { filename, model: entry.model, budget: entry.budget, keyPreview: entry.key.substring(0, 12) + '...' });
            output += `\n✅ free${idx}.json 已更新\n  模型: ${displayName}\n  预算: ${entry.budget}\n  过期: ${entry.expires}\n  端点: ${isAnthropic ? BASE_ANTHROPIC : BASE_OPENAI}\n\n💡 使用 d.bat free${idx} 启动`;
            pushProgress(`📡 测试 ${displayName} ... ✅ ${testResult.message}`, true);
        }
        else {
            output += `\n❌ free${idx}.json 跳过更新（Key 不可用）\n  原因: ${testResult.message}`;
            pushProgress(`📡 测试 ${displayName} ... ❌ ${testResult.message}`, true);
        }
        return { type: 'text', value: timeStamp + '\n' + output };
    }
    else if (cmd === 'preset') {
        // 生成永久免费层预设配置
        log('INFO', '开始生成永久免费层预设', { count: FREE_TIER_PRESETS.length });
        pushProgress(`${timeStamp} 📋 正在生成 ${FREE_TIER_PRESETS.length} 个永久免费层预设配置...`);
        const output = generateFreeTierPresets();
        return { type: 'text', value: timeStamp + '\n' + output };
    }
    else if (cmd === 'status') {
        // 查看数据源状态
        const output = checkDataSourceStatus();
        return { type: 'text', value: output };
    }
    else {
        // 默认: 列出当前状态
        const configs = getExistingConfigs();
        let output = '📋 当前免费 API 配置文件状态:\n\n';
        for (const f of configs) {
            const cfg = readConfig(f);
            if (cfg) {
                const keyMask = cfg.apiKey?.length > 15
                    ? cfg.apiKey.substring(0, 10) + '...' + cfg.apiKey.slice(-5)
                    : cfg.apiKey;
                const preset = cfg._preset ? ' [预设]' : '';
                output += `  ${f}${preset}: ${cfg.model || '?'} | Key: ${keyMask} | ${cfg.baseURL}\n`;
            }
            else {
                output += `  ${f}: 读取失败\n`;
            }
        }
        output += '\n用法:\n';
        output += '  /updateapikey           - 查看当前状态\n';
        output += '  /updateapikey all      - 从 GitHub 拉取最新 Key，更新 free5~free36\n';
        output += '  /updateapikey free5    - 仅更新指定编号的配置文件\n';
        output += '  /updateapikey preset   - 生成永久免费层预设 (free37~free50)\n';
        output += '  /updateapikey status   - 查看数据源和配置状态\n';
        output += '\n📋 详细日志已写入 updateapikey.log\n';
        return { type: 'text', value: timeStamp + '\n' + output };
    }
};
//# sourceMappingURL=updateapikey.js.map