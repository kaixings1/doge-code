/**
 * Anthropic Messages API → OpenAI Chat Completions 适配器
 *
 * Claude Code 发送 Anthropic 格式（/v1/messages），
 * 这里转换为 OpenAI 格式后转发到 WorkBuddy 上游。
 */

import { randomUUID } from 'node:crypto';
import { findTargetModel } from './workbuddy-cn-providers.mjs';

/**
 * Anthropic → OpenAI 请求转换
 *
 * @param {object} body            Anthropic 请求体
 * @param {string} [defaultModel]  客户端未点名模型时的回退值
 * @param {{haiku:string,sonnet:string,opus:string}} [modelMapping]
 *        Claude 三档关键词映射；命中 haiku/sonnet/opus 时改写为目标模型，
 *        未命中则保留客户端原始 model（或 defaultModel）。
 */
export function anthropicToOpenAI(body, defaultModel = 'deepseek-v4-flash', modelMapping) {
  const requested = body.model || defaultModel;
  const model = modelMapping ? findTargetModel(requested, modelMapping) : requested;
  const openai = {
    model,
    max_tokens: body.max_tokens || 1024,
    stream: body.stream || false,
    messages: [],
  };

  // system prompt → messages[0]
  if (body.system) {
    const systemText = typeof body.system === 'string'
      ? body.system
      : body.system?.map(b => b.text).join('') || '';
    if (systemText) {
      openai.messages.push({ role: 'system', content: systemText });
    }
  }

  // messages 转换
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (msg.role === 'user') {
        if (typeof msg.content === 'string') {
          openai.messages.push({ role: 'user', content: msg.content });
        } else if (Array.isArray(msg.content)) {
          const text = msg.content.map(b => b.type === 'text' ? b.text : '').join('');
          openai.messages.push({ role: 'user', content: text });
        }
      } else if (msg.role === 'assistant') {
        const assistantMsg = { role: 'assistant', content: msg.content || '' };
        if (msg.stop_reason) assistantMsg.stop_reason = msg.stop_reason;
        openai.messages.push(assistantMsg);
      }
    }
  }

  // tools 转换（Anthropic 和 OpenAI 格式基本兼容）
  if (Array.isArray(body.tools)) {
    openai.tools = body.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema || tool.parameters || { type: 'object', properties: {} },
      },
    }));
  }

  // tool_choice
  if (body.tool_choice) {
    openai.tool_choice = body.tool_choice;
  }

  return openai;
}

/**
 * OpenAI → Anthropic 响应转换（非流式）
 *
 * reasoning_content 转 thinking 块：默认开启，仅当 WORKBUDDY_TRANSLATE_THINKING=0 时关闭。
 * 不伪造真实 signature（无 Anthropic 私钥），补空 signature 字段维持块结构合法。
 */
export function openaiToAnthropicCompletion(openaiResp, model = 'deepseek-v4-flash', translateThinking) {
  const choice = openaiResp.choices?.[0];
  const message = choice?.message || {};
  const content = message.content || '';
  const enabled = typeof translateThinking === 'boolean' ? translateThinking : process.env.WORKBUDDY_TRANSLATE_THINKING !== '0';

  const blocks = [{ type: 'text', text: content }];
  if (enabled && typeof message.reasoning_content === 'string' && message.reasoning_content.length > 0) {
    blocks.unshift({ type: 'thinking', thinking: message.reasoning_content, signature: '' });
  }

  const details = openaiResp.usage?.prompt_tokens_details;
  const usage = {
    input_tokens: openaiResp.usage?.prompt_tokens || 0,
    output_tokens: openaiResp.usage?.completion_tokens || 0,
  };
  if (details?.cached_tokens != null) usage.cache_read_input_tokens = details.cached_tokens;
  if (details?.cache_creation_tokens != null) usage.cache_creation_input_tokens = details.cache_creation_tokens;

  return {
    id: randomUUID(),
    type: 'message',
    role: 'assistant',
    content: blocks,
    model,
    stop_reason: choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    stop_sequence: null,
    usage,
  };
}

export function openaiToAnthropicChunk(chunk, model) {
  const choice = chunk.choices?.[0];
  const delta = choice?.delta || {};
  return {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: delta.content || '' },
  };
}

/**
 * OpenAI SSE chunk → Anthropic SSE event 转换
 *
 * 注意：message_start / content_block_start / message_stop 等结构事件
 * 由外层 wrappedTransform 在首帧/尾帧统一注入，这里只产出
 * content_block_delta / message_delta，避免重复。
 */
export function openaiSseChunkToAnthropic(chunk, model, messageId) {
  const events = [];
  const choice = chunk.choices?.[0];
  const delta = choice?.delta || {};
  const finishReason = choice?.finish_reason;

  // Anthropic 格式没有独立的 reasoning 字段，将 content 和 reasoning_content 合并为文本增量
  const text = [delta.content, delta.reasoning_content].filter(Boolean).join('');
  if (text) {
    events.push({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text },
      },
    });
  }

  // 结束标记
  if (finishReason) {
    const stopReason = finishReason === 'length' ? 'max_tokens' : 'end_turn';
    events.push({
      event: 'message_delta',
      data: {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 0 },
      },
    });
  }

  return events;
}

import { writeSse } from './workbuddy-sse.mjs';

/** Anthropic SSE 格式写入（event: xxx\ndata: json\n\n） */
export async function writeAnthropicSse(res, event, controller) {
  const eventName = event.event || 'message';
  const data = JSON.stringify(event.data);
  const text = `event: ${eventName}\ndata: ${data}\n\n`;
  await writeSse(res, Buffer.from(text, 'utf8'), controller);
}
