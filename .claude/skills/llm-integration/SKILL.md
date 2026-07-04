---
name: llm-integration
description: LLM集成 — 包括API使用、流式传输、函数调用、嵌入和向量数据库的集成模式。
---

# LLM 集成

## API 客户端模式

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function generateResponse(
  systemPrompt: string,
  userMessage: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: options?.maxTokens ?? 1024,
    temperature: options?.temperature ?? 0,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find(block => block.type === "text");
  return textBlock?.text ?? "";
}
```

## 流式响应

```typescript
async function streamResponse(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  onChunk: (text: string) => void
): Promise<string> {
  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages,
  });

  let fullText = "";

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onChunk(event.delta.text);
      fullText += event.delta.text;
    }
  }

  return fullText;
}

const response = await streamResponse(
  [{ role: "user", content: "Explain async/await in TypeScript" }],
  (chunk) => process.stdout.write(chunk)
);
```

## 函数调用（工具使用）

```typescript
const tools: Anthropic.Tool[] = [
  {
    name: "search_database",
    description: "Search the product database by name, category, or price range",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        category: { type: "string", description: "Product category filter" },
        max_price: { type: "number", description: "Maximum price" },
      },
      required: ["query"],
    },
  },
];

async function agentLoop(userMessage: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      tools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const text = response.content.find(b => b.type === "text");
      return text?.text ?? "";
    }

    const toolUse = response.content.find(b => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") break;

    const result = await executeToolCall(toolUse.name, toolUse.input);

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUse.id, content: result }],
    });
  }

  return "";
}
```

## RAG 流水线

```typescript
import { embed } from "./embeddings";

interface Chunk {
  id: string;
  text: string;
  metadata: Record<string, string>;
  embedding: number[];
}

async function retrieveAndGenerate(query: string): Promise<string> {
  const queryEmbedding = await embed(query);

  const relevantChunks = await vectorDb.search({
    vector: queryEmbedding,
    topK: 5,
    filter: { source: "documentation" },
  });

  const context = relevantChunks
    .map((chunk, i) => `[${i + 1}] ${chunk.text}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: `Answer questions using the provided context. Cite sources with [n] notation. If the context doesn't contain the answer, say so.`,
    messages: [
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${query}`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}
```

## 文档分块

```typescript
function chunkDocument(
  text: string,
  options: { chunkSize: number; overlap: number }
): string[] {
  const { chunkSize, overlap } = options;
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      const words = current.split(" ");
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      current = overlapWords.join(" ") + " " + sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
```

## 成本优化

```typescript
function selectModel(task: TaskType): string {
  switch (task) {
    case "classification":
    case "extraction":
      return "claude-haiku-4-20250514";
    case "analysis":
    case "coding":
      return "claude-sonnet-4-20250514";
    case "complex-reasoning":
      return "claude-opus-4-5-20251101";
    default:
      return "claude-sonnet-4-20250514";
  }
}
```

使用能满足质量要求的最小模型。尽可能缓存嵌入和响应。在延迟要求不高的场景下，对请求进行批处理。

## 反模式

- 发送整个文档，而只需要相关片段
- API 调用未实现带指数退避的重试逻辑
- 忽略 Token 用量追踪（导致意外成本）
- 对简单分类任务使用最昂贵的模型
- 在代码中使用 LLM 输出前未验证或清理
- 在未先评估检索质量的情况下构建 RAG

## 检查清单

- [ ] API 调用包装了重试逻辑和错误处理
- [ ] 面向用户的响应使用流式传输
- [ ] 函数调用 schema 包含清晰的描述
- [ ] RAG 块大小适当（500-1000 tokens）并带有重叠
- [ ] 根据任务复杂度选择模型
- [ ] 追踪和监控 Token 用量以控制成本
- [ ] LLM 输出在下游使用前经过验证
- [ ] 嵌入已缓存，避免重复 API 调用
