const fs = require('fs');
const path = 'D:\\doge-code\\desktop\\src\\main\\apiClient.ts';

let s = fs.readFileSync(path, 'utf-8');

// 定位 buildOpenAIRequest 的完整函数体
const startMarker = 'function buildOpenAIRequest(request: APIRequest): OpenAIChatRequest {';
const endMarker = '\n// ─── 非流式响应兜底 ───';

const startIdx = s.indexOf(startMarker);
const endIdx = s.indexOf(endMarker, startIdx);

const before = s.slice(0, startIdx);
const after = s.slice(endIdx);

// 新函数体（从函数声明后刚好插入）
const newFuncBody = `{\n
  const messages: OpenAIChatMessage[] = []\n
  for (const m of request.messages || []) {\n
    const msg = m as Record<string, unknown>\n
    let content: OpenAIChatMessage['content']\n
    if (msg.content === null || msg.content === undefined) {\n
      content = null\n
    } else if (Array.isArray(msg.content)) {\n
      const blocks = msg.content as Array<Record<string, unknown>>\n
      content = blocks\n
        .filter(b => b.type === 'text' || b.type === 'tool_result')\n
        .map(b => {\n
          const cleaned: Record<string, unknown> = { type: b.type }\n
          if (typeof b.text === 'string') cleaned.text = b.text\n
          if (typeof b.content === 'string') cleaned.content = b.content\n
          if (typeof b.tool_use_id === 'string') cleaned.tool_use_id = b.tool_use_id\n
          return cleaned\n
        })\n
    } else if (typeof msg.content === 'string') {\n
      content = msg.content\n
    } else {\n
      content = String(msg.content)\n
    }\n
    const chatMsg: OpenAIChatMessage = {\n
      role: String(msg.role || 'user') as OpenAIChatMessage['role'],\n
      content,\n
    }\n
    if (msg.tool_calls) {\n
      chatMsg.tool_calls = msg.tool_calls as OpenAIChatMessage['tool_calls']\n
    }\n
    messages.push(chatMsg)\n
  }\n
\n
  const tools = (request.tools || []).map(t => {\n
    const wrapper = t as { type?: unknown; function?: Record<string, unknown> }\n
    const fn = (wrapper as { function?: Record<string, unknown> }).function || {}\n
    const paramAttr = (fn as Record<string, unknown>).parameters\n
    const rawSchema = paramAttr instanceof Object && !Array.isArray(paramAttr) ? (paramAttr as Record<string, unknown>) : null\n
    const cleanedSchema = rawSchema ? sanitizeToolSchema(rawSchema) : null\n
    const toolDef: OpenAIChatRequest['tools'][0] = {\n
      type: 'function',\n
      function: {\n
        name: String((fn as Record<string, unknown>).name ?? ''),\n
        description: typeof (fn as Record<string, unknown>).description === 'string' ? (fn as Record<string, unknown>).description as string : undefined,\n
        ...(cleanedSchema !== null ? { parameters: cleanedSchema } : {}),\n
      },\n
    }\n
    return toolDef\n
  })\n
\n
  return {\n
    model: request.model,\n
    messages,\n
    stream: true,\n
    max_tokens: request.max_tokens,\n
    temperature: request.temperature ?? 0,\n
    ...(tools.length > 0 ? { tools } : {}),\n
  }\n
}\n`;

const result = before + startMarker + newFuncBody + after;
fs.writeFileSync(path, result, 'utf-8');
console.log('Repair complete, length:', result.length);
