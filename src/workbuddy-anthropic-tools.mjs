/**
 * Anthropic 协议增强层
 *
 * 吸收自 workbuddy-claude-bridge-main（Anthropic Messages 本地网关）的核心差异能力，
 * 补上本仓库 workbuddy-anthropic-adapter.mjs 的缺口：
 *
 *   1. 工具调用状态机（tool_use 块 + input_json_delta）—— 原 adapter 完全不处理
 *      OpenAI 的 tool_calls delta，导致 Claude Code 的工具调度器无法解析。
 *   2. 多模态图片块转换（user message 里的 image → OpenAI image_url）。
 *   3. reasoning_content 丢弃策略 —— 上游把预算花在内部推理上，该字段不转成 Anthropic
 *      thinking 块（伪造 signature 会让客户端解析失败），只取正文 content。
 *   4. system 身份中性化（sanitizeSystemIdentity）—— 规避上游 11128「Claude Code 官方
 *      客户端标识」风控，把官方自我介绍替换为中性描述并注入真实模型名。
 *   5. 模型映射/回退（resolveModel / modelCandidates）—— claude-* 前缀最长匹配，
 *      落空兜到 default，再按 fallbackOrder 依次换模型重试。
 *
 * 与 bridge 的差异：bridge 自带账号扫描与转发，本仓库复用既有的
 * account-store + upstream-client（含 token 刷新、多账号、计费），因此本模块只负责
 * 「协议差异转换」，不碰网络层。
 */

import { randomBytes } from 'node:crypto';

// ─── 模型映射 / 回退 ──────────────────────────────────────────

export const MODEL_CONFIG_DEFAULT = {
  default: 'deepseek-v4-flash',
  map: {
    'claude-opus': 'deepseek-v4-flash',
    'claude-sonnet': 'deepseek-v4-flash',
    'claude-haiku': 'deepseek-v4-flash',
  },
  fallbackOrder: ['deepseek-v4-flash'],
  modelFallback: true,
};

/** 请求的模型 → 上游模型。先查精确键，再按最长前缀匹配，claude-* 兜底到 default。 */
export function resolveModel(requested, cfg = MODEL_CONFIG_DEFAULT) {
  const map = cfg.map ?? {};
  if (map[requested]) return map[requested];

  let best = '';
  for (const key of Object.keys(map)) {
    if (requested.toLowerCase().startsWith(key.toLowerCase()) && key.length > best.length) best = key;
  }
  if (best) return map[best];

  if (/^claude/i.test(requested)) return cfg.default;
  return requested;
}

/** 依次尝试的模型列表：先解析出的主模型，再配置的回退顺序，最后 default。 */
export function modelCandidates(requested, cfg = MODEL_CONFIG_DEFAULT) {
  const primary = resolveModel(requested, cfg);
  const list = [primary];
  if (!cfg.modelFallback) return list;
  for (const model of cfg.fallbackOrder ?? []) {
    if (model && !list.includes(model)) list.push(model);
  }
  if (cfg.default && !list.includes(cfg.default)) list.push(cfg.default);
  return list;
}

// ─── system 身份中性化（规避上游 11128 风控）──────────────────

export function stripBillingHeader(text) {
  return text.replace(/^x-anthropic-billing-header:.*$/gm, '');
}

/**
 * 上游渠道校验会识别「Claude Code 官方客户端」身份（11128），把 system 里的官方自我介绍
 * 替换为中性描述，并注入真实模型名（否则模型凭记忆瞎答「我是 Claude」）。
 * 只替换固定官方文案，不碰用户/指令内容。
 */
export function sanitizeSystemIdentity(text, realModel = '') {
  const alias = realModel
    ? ` You are ${realModel}, a large language model. If the user asks which model or version you are, answer truthfully with exactly: ${realModel}. Never claim to be a Claude model or made by Anthropic.`
    : '';
  let out = text
    .replace(/You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK\./g, `You are an AI coding assistant.${alias}`)
    .replace(/You are a Claude agent, built on Anthropic's Claude Agent SDK\./g, `You are an AI coding assistant.${alias}`)
    .replace(/Anthropic's official CLI for Claude/g, 'an AI coding assistant')
    .replace(/the Claude Agent SDK/g, 'an agent runtime');
  out = out.replace(/anthropics\/claude-code/g, 'open-source/assistant-cli');
  if (/Claude Code/i.test(out) && /Anthropic/i.test(out)) {
    out = out.replace(/Claude Code/g, 'this assistant');
  }
  return out;
}

// ─── 多模态图片块转换 ───────────────────────────────────────

function asRecord(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function imagePart(block) {
  const source = asRecord(block.source);
  if (source.type === 'base64' && typeof source.data === 'string') {
    const media = typeof source.media_type === 'string' ? source.media_type : 'image/png';
    return { type: 'image_url', image_url: { url: `data:${media};base64,${source.data}` } };
  }
  if (source.type === 'url' && typeof source.url === 'string') {
    return { type: 'image_url', image_url: { url: source.url } };
  }
  return null;
}

function toolResultText(block) {
  const content = block.content;
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((item) => {
        if (typeof item === 'string') return item;
        const inner = asRecord(item);
        return inner.type === 'text' && typeof inner.text === 'string' ? inner.text : '';
      })
      .filter(Boolean)
      .join('\n');
  } else if (content != null) {
    text = JSON.stringify(content);
  }
  // OpenAI 没有 is_error，用前缀把失败信号带给模型，否则它会当成功结果用。
  return block.is_error === true ? `Error: ${text}` : text;
}

/** 一条 Anthropic user 消息可能要拆成多条 OpenAI 消息：tool 结果在前，正文在后。 */
export function userMessages(content) {
  if (typeof content === 'string') return [{ role: 'user', content }];
  if (!Array.isArray(content)) return [{ role: 'user', content: '' }];

  const toolMessages = [];
  const parts = [];

  for (const raw of content) {
    const block = asRecord(raw);
    if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
      toolMessages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: toolResultText(block) });
    } else if (block.type === 'text' && typeof block.text === 'string') {
      parts.push({ type: 'text', text: block.text });
    } else if (block.type === 'image') {
      const part = imagePart(block);
      if (part) parts.push(part);
    }
    // thinking 等上游不认识的块直接丢弃
  }

  const out = [...toolMessages];
  if (parts.length) {
    const textOnly = parts.every((p) => p.type === 'text');
    out.push({ role: 'user', content: textOnly ? parts.map((p) => String(p.text)).join('\n') : parts });
  }
  if (out.length === 0) out.push({ role: 'user', content: '' });
  return out;
}

function assistantMessage(content) {
  if (typeof content === 'string') return { role: 'assistant', content };

  const texts = [];
  const toolCalls = [];

  for (const raw of Array.isArray(content) ? content : []) {
    const block = asRecord(raw);
    if (block.type === 'text' && typeof block.text === 'string') {
      texts.push(block.text);
    } else if (block.type === 'tool_use' && typeof block.name === 'string') {
      toolCalls.push({
        id: typeof block.id === 'string' ? block.id : `toolu_${toolCalls.length}`,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      });
    }
    // thinking / redacted_thinking 丢弃：上游不接受，也不需要
  }

  const message = { role: 'assistant', content: texts.join('\n') || null };
  if (toolCalls.length) message.tool_calls = toolCalls;
  return message;
}

/** Anthropic 的 input_schema 就是 JSON Schema，直接当 OpenAI 的 function.parameters。 */
function toolsToOpenAI(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return null;
  return tools
    .filter((t) => t && typeof t.name === 'string')
    .map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema ?? { type: 'object', properties: {} },
      },
    }));
}

function toolChoiceToOpenAI(choice) {
  switch (choice?.type) {
    case 'auto': return 'auto';
    case 'any': return 'required';
    case 'tool': return choice.name ? { type: 'function', function: { name: choice.name } } : 'auto';
    default: return undefined;
  }
}

const DEFAULT_MIN_MAX_TOKENS = 0;

/**
 * 把 Anthropic 请求体转换为 OpenAI 上游体。
 * 吸收 bridge 的 buildUpstreamBody：system 中性化、图片块、工具调用、reasoning 下限保护。
 * realModel 为上游真实模型名，用于注入中性身份描述。
 */
export function buildUpstreamBody(req, opts = {}, realModel) {
  const cfg = opts.modelConfig ?? MODEL_CONFIG_DEFAULT;
  const minMaxTokens = opts.minMaxTokens ?? DEFAULT_MIN_MAX_TOKENS;

  let systemText = '';
  if (typeof req.system === 'string') {
    systemText = req.system;
  } else if (Array.isArray(req.system)) {
    systemText = req.system
      .map((b) => {
        const block = asRecord(b);
        return block.type === 'text' && typeof block.text === 'string' ? block.text : '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  const messages = [];
  const neutralized = sanitizeSystemIdentity(stripBillingHeader(systemText), realModel);
  if (neutralized.trim()) {
    messages.push({ role: 'system', content: neutralized });
  }

  for (const message of req.messages ?? []) {
    if (message?.role === 'assistant') messages.push(assistantMessage(message.content));
    else messages.push(...userMessages(message?.content));
  }

  const requestedMax = typeof req.max_tokens === 'number' ? req.max_tokens : 8192;

  const body = {
    model: realModel ?? req.model,
    messages,
    // 上游只有 SSE，非流式也走流，由本地聚合
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: Math.max(requestedMax, minMaxTokens),
  };

  if (typeof req.temperature === 'number') body.temperature = req.temperature;
  if (typeof req.top_p === 'number') body.top_p = req.top_p;
  if (Array.isArray(req.stop_sequences) && req.stop_sequences.length) body.stop = req.stop_sequences;

  if (req.tool_choice?.type !== 'none') {
    const tools = toolsToOpenAI(req.tools);
    if (tools) {
      body.tools = tools;
      const choice = toolChoiceToOpenAI(req.tool_choice);
      if (choice) body.tool_choice = choice;
    }
  }

  return body;
}

// ─── 流式状态机：OpenAI chunk → Anthropic 事件（含 tool_use）────

/** 把上游 SSE 文本切成一条条 data 载荷，兼容 \n\n 与 \r\n\r\n 两种分隔。 */
export function createSseDecoder() {
  let buffer = '';
  return function feed(chunk) {
    buffer = (buffer + chunk).replace(/\r\n/g, '\n');
    const out = [];
    let cut;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) out.push(trimmed.slice(5).trim());
      }
    }
    return out;
  };
}

function mapStopReason(reason) {
  switch (reason) {
    case 'length': return 'max_tokens';
    case 'tool_calls':
    case 'function_call': return 'tool_use';
    default: return 'end_turn';
  }
}

/**
 * 把 OpenAI 的 chat.completion.chunk 流翻译成 Anthropic 的事件序列。
 * 上游把文本和 tool_calls 混在同一个 delta 里，而 Anthropic 要求块与块之间先 stop 再 start，
 * 所以这里是有状态的。
 *
 * 吸收自 CrossLink 的 StreamTranslator（internal/translator/stream.go）：
 *   - reasoning_content → Anthropic thinking 块（受 WORKBUDDY_TRANSLATE_THINKING 开关控制，
 *     默认关闭 —— 因官方 thinking 块需 signature，本网关无签名来源，伪造会破坏协议；
 *     仅透传 reasoning 文本）。
 *   - usage.prompt_tokens_details.cached_tokens / cache_creation_tokens →
 *     cache_read_input_tokens / cache_creation_input_tokens 统计。
 */
export class AnthropicStreamTranslator {
  messageId;
  model;
  inputTokens;
  started = false;
  nextIndex = 0;
  openIndex = null;
  openType = null;
  pending = new Map();
  stopReason = null;
  outputTokens = 0;
  reportedInputTokens = null;
  cacheReadTokens = null;
  cacheCreationTokens = null;
  // thinking 块翻译：默认开启 —— 把上游 reasoning_content 透传为 Anthropic thinking 块。
  // 仅当显式设 WORKBUDDY_TRANSLATE_THINKING=0（或调用方传 false）时关闭。
  // 不伪造真实 signature（无 Anthropic 私钥），补空 signature 字段维持块结构合法。
  translateThinking = process.env.WORKBUDDY_TRANSLATE_THINKING !== '0';

  constructor(model, inputTokens = 0, translateThinking) {
    this.messageId = 'msg_' + randomBytes(12).toString('hex');
    this.model = model;
    this.inputTokens = inputTokens;
    if (typeof translateThinking === 'boolean') this.translateThinking = translateThinking;
  }

  ensureStarted(out) {
    if (this.started) return;
    this.started = true;
    out.push({
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: this.messageId,
          type: 'message',
          role: 'assistant',
          model: this.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: this.inputTokens, output_tokens: 0 },
        },
      },
    });
  }

  closeBlock(out) {
    if (this.openIndex === null) return;
    out.push({ event: 'content_block_stop', data: { type: 'content_block_stop', index: this.openIndex } });
    this.openIndex = null;
    this.openType = null;
  }

  openBlock(out, block) {
    const index = this.nextIndex++;
    this.openIndex = index;
    this.openType = block.type;
    out.push({ event: 'content_block_start', data: { type: 'content_block_start', index, content_block: block } });
    return index;
  }

  pushText(out, text) {
    if (this.openType !== 'text') {
      this.closeBlock(out);
      this.openBlock(out, { type: 'text', text: '' });
    }
    out.push({
      event: 'content_block_delta',
      data: { type: 'content_block_delta', index: this.openIndex, delta: { type: 'text_delta', text } },
    });
  }

  openToolBlock(out, entry) {
    this.closeBlock(out);
    const index = this.nextIndex;
    entry.blockIndex = this.openBlock(out, {
      type: 'tool_use',
      id: entry.id ?? `toolu_${index}`,
      name: entry.name ?? '',
      input: {},
    });
    if (entry.args) {
      out.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: entry.blockIndex,
          delta: { type: 'input_json_delta', partial_json: entry.args },
        },
      });
      entry.args = '';
    }
  }

  pushThinkingDelta(out, thinking) {
    if (this.openType !== 'thinking') {
      this.closeBlock(out);
      this.openBlock(out, { type: 'thinking', thinking: '', signature: '' });
    }
    out.push({
      event: 'content_block_delta',
      data: { type: 'content_block_delta', index: this.openIndex, delta: { type: 'thinking_delta', thinking } },
    });
  }

  pushToolDelta(out, call) {
    const key = call.index ?? 0;
    let entry = this.pending.get(key);
    if (!entry) {
      entry = { id: null, name: null, args: '', blockIndex: null };
      this.pending.set(key, entry);
    }
    if (call.id) entry.id = call.id;
    if (call.function?.name) entry.name = (entry.name ?? '') + call.function.name;

    const fragment = call.function?.arguments ?? '';

    if (entry.blockIndex === null) {
      // name 尚未到达时不能开块 —— Anthropic 的 content_block_start 必须带上 name
      entry.args += fragment;
      if (entry.name) this.openToolBlock(out, entry);
      return;
    }
    if (fragment) {
      out.push({
        event: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: entry.blockIndex,
          delta: { type: 'input_json_delta', partial_json: fragment },
        },
      });
    }
  }

  push(chunk) {
    const out = [];

    if (typeof chunk.model === 'string' && chunk.model) this.model = chunk.model;
    if (chunk.usage) {
      if (typeof chunk.usage.prompt_tokens === 'number') this.reportedInputTokens = chunk.usage.prompt_tokens;
      if (typeof chunk.usage.completion_tokens === 'number') this.outputTokens = chunk.usage.completion_tokens;
      const details = chunk.usage.prompt_tokens_details;
      if (details) {
        if (typeof details.cached_tokens === 'number') this.cacheReadTokens = details.cached_tokens;
        if (typeof details.cache_creation_tokens === 'number') this.cacheCreationTokens = details.cache_creation_tokens;
      }
    }

    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;
      if (delta) {
        // reasoning_content → Anthropic thinking 块（受开关控制，默认关闭）
        if (this.translateThinking && typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
          this.ensureStarted(out);
          this.pushThinkingDelta(out, delta.reasoning_content);
        }
        const text = delta.content;
        if (typeof text === 'string' && text.length > 0) {
          this.ensureStarted(out);
          this.pushText(out, text);
        }
        for (const call of delta.tool_calls ?? []) {
          this.ensureStarted(out);
          this.pushToolDelta(out, call);
        }
      }
      if (choice.finish_reason) this.stopReason = choice.finish_reason;
    }

    return out;
  }

  finish() {
    const out = [];
    this.ensureStarted(out);

    // 收尾时还没开块的 tool call：有 name 就补开，没 name 就丢弃
    for (const entry of this.pending.values()) {
      if (entry.blockIndex === null && entry.name) this.openToolBlock(out, entry);
    }

    this.closeBlock(out);

    out.push({
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: mapStopReason(this.stopReason), stop_sequence: null },
        usage: {
          output_tokens: this.outputTokens,
          input_tokens: this.reportedInputTokens ?? this.inputTokens,
          ...(typeof this.cacheReadTokens === 'number' ? { cache_read_input_tokens: this.cacheReadTokens } : {}),
          ...(typeof this.cacheCreationTokens === 'number' ? { cache_creation_input_tokens: this.cacheCreationTokens } : {}),
        },
      },
    });
    out.push({ event: 'message_stop', data: { type: 'message_stop' } });
    return out;
  }
}

/** 把事件序列折叠成一条非流式的 message 响应。 */
export function eventsToMessage(events) {
  let message = {};
  const blocks = [];
  const rawArgs = [];

  for (const event of events) {
    const data = event.data;
    if (event.event === 'message_start') {
      message = { ...data.message };
    } else if (event.event === 'content_block_start') {
      blocks[data.index] = { ...data.content_block };
    } else if (event.event === 'content_block_delta') {
      const block = blocks[data.index];
      if (!block) continue;
      const delta = data.delta;
      if (delta.type === 'text_delta') {
        block.text = String(block.text ?? '') + String(delta.text ?? '');
      } else if (delta.type === 'thinking_delta') {
        block.thinking = String(block.thinking ?? '') + String(delta.thinking ?? '');
      } else if (delta.type === 'input_json_delta') {
        const i = data.index;
        rawArgs[i] = (rawArgs[i] ?? '') + String(delta.partial_json ?? '');
      }
    } else if (event.event === 'message_delta') {
      const delta = data.delta;
      message.stop_reason = delta.stop_reason ?? null;
      message.stop_sequence = delta.stop_sequence ?? null;
      message.usage = { ...message.usage, ...data.usage };
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block || block.type !== 'tool_use') continue;
    const json = rawArgs[i] ?? '';
    try {
      block.input = json ? JSON.parse(json) : {};
    } catch {
      block.input = {};
    }
  }

  message.content = blocks.filter(Boolean);
  if (!message.type) message.type = 'message';
  if (!message.role) message.role = 'assistant';
  return message;
}

/**
 * Token 估算（近似，用于 usage 展示与限流估算，非精确计费）。
 *
 * 吸收自 CrossLink 的 pkg/token/estimate.go：对中日韩（Han/Hangul/Katakana/Hiragana）
 * 与 ASCII 分开计数 —— CJK 约 1.5 字符/token，ASCII 约 4 字符/token，更贴近
 * tiktoken 对混合语言内容的实际行为（原实现按「码点 > 0x2e80 即算宽字符 ×0.75」
 * 会把部分标点/符号一并计入，偏差较大）。
 *
 * 入参兼容：字符串直接计；数组/对象递归展开其文本。
 */
export function estimateTokens(value) {
  if (value == null) return 0;
  if (typeof value === 'string') return estimateTextTokens(value);
  if (Array.isArray(value)) return value.reduce((sum, v) => sum + estimateTokens(v), 0);
  if (typeof value === 'object') return estimateTokens(JSON.stringify(value));
  return 0;
}

/** 单段文本的混合语言 token 估算。 */
function estimateTextTokens(text) {
  if (!text) return 0;
  let cjk = 0;
  let ascii = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x3040 && code <= 0x30ff) || // Hiragana / Katakana
      (code >= 0x3400 && code <= 0x9fff) || // CJK 统一表意 + 扩展 A
      (code >= 0xac00 && code <= 0xd7af)    // Hangul 音节
    ) {
      cjk++;
    } else {
      ascii++;
    }
  }
  // CJK: ~1.5 字符/token（向上取整避免 1 字符算 0），ASCII: ~4 字符/token（向下取整）
  return Math.ceil(cjk / 1.5) + Math.floor(ascii / 4);
}

export function formatSseEvent(event) {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
