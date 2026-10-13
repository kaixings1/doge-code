/**
 * 国内大模型 provider 预设表 + 模型关键词映射
 *
 * 吸收自 claude-code-nexus（github.com/KroMiose/claude-code-nexus）的
 * src/config/defaultModelMappings.ts。
 *
 * 该库维护了一份「将 Claude 三个固定档位（haiku/sonnet/opus）映射到任意
 * OpenAI 兼容后端目标模型」的预设，以及一份国内主流大模型供应商的 baseUrl 表。
 * 本仓库 workbuddy-providers.mjs 已有国际供应商（Groq/OpenRouter/Together/Google），
 * 此处补充「国内供应商预设」与之互补，便于 Web 控制台一键填入后端地址。
 *
 * 注意：本模块只提供「预设数据 + 纯函数映射」，不引入任何运行期依赖或网络请求。
 */

// ─── 国内供应商 baseUrl 预设 ──────────────────────────────────
// 仅提供地址与说明，凭据仍由用户在控制台填写，本代理不替任何第三方存储密钥。

export const CN_PRESET_PROVIDERS = Object.freeze([
  { name: 'NekroAI 中转', baseUrl: 'https://api.nekro.ai/v1', description: 'Nekro AI 中转服务' },
  { name: '谷歌 Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', description: 'Google Gemini API 服务' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', description: '阿里云通义千问 API 服务' },
  { name: '豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', description: '字节跳动豆包 API 服务' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', description: '月之暗面 Kimi API 服务' },
  { name: '智谱清言', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', description: '智谱 AI 清言 API 服务' },
  { name: '百度千帆', baseUrl: 'https://qianfan.baidubce.com/v2', description: '百度千帆大模型 API 服务' },
  { name: '科大讯飞', baseUrl: 'https://spark-api-open.xf-yun.com/v1', description: '科大讯飞星火 API 服务' },
  { name: '百川', baseUrl: 'https://api.baichuan-ai.com/v1', description: '百川智能 API 服务' },
  { name: '腾讯混元', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', description: '腾讯混元大模型 API 服务' },
  { name: '商汤日日新', baseUrl: 'https://api.sensenova.cn/compatible-mode/v1', description: '商汤科技日日新 API 服务' },
]);

// ─── 固定三档模型关键词 ──────────────────────────────────────
// Claude 只暴露这三档语义档位；实际后端目标模型由用户映射表决定。

export const FIXED_MODEL_RULES = Object.freeze([
  { keyword: 'haiku', description: '轻量级模型，在快速响应和简单任务中使用' },
  { keyword: 'sonnet', description: '平衡性能的通用模型，在大多数场景中使用' },
  { keyword: 'opus', description: '高性能模型，在复杂推理编码任务中使用' },
]);

/** 系统默认映射（映射到 Gemini 兼容档位，与 nexus 默认一致）。 */
export const DEFAULT_MODEL_MAPPING = Object.freeze({
  haiku: 'gemini-2.5-flash-nothinking',
  sonnet: 'gemini-2.5-pro',
  opus: 'gemini-2.5-pro',
});

/**
 * 根据模型关键词（来自请求 model 字符串）查找目标后端模型。
 * 子串匹配 haiku/sonnet/opus，命中返回映射值；未命中原样返回关键词。
 *
 * @param {string} keyword 请求中的 model 片段（如 "claude-3-5-sonnet-..."）
 * @param {{haiku:string,sonnet:string,opus:string}} config 用户映射表
 * @returns {string}
 */
export function findTargetModel(keyword, config = DEFAULT_MODEL_MAPPING) {
  const normalized = String(keyword || '').toLowerCase();
  for (const rule of FIXED_MODEL_RULES) {
    if (normalized.includes(rule.keyword)) {
      return config[rule.keyword] ?? keyword;
    }
  }
  return keyword;
}

/**
 * 校验用户映射表是否完整（三档都有非空字符串）。
 * @param {any} config
 * @returns {boolean}
 */
export function isValidModelMapping(config) {
  return !!(
    config &&
    typeof config.haiku === 'string' && config.haiku.length > 0 &&
    typeof config.sonnet === 'string' && config.sonnet.length > 0 &&
    typeof config.opus === 'string' && config.opus.length > 0
  );
}
