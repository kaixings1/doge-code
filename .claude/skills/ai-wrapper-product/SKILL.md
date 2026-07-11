---
name: AI API 封装产品
description: "构建封装 AI API (OpenAI、Anthropic、Gemini) 产品的专家。聚焦产品市场匹配、API 集成和定价策略。"
  etc. ) into focused tools people will pay for. Not just "ChatGPT but
  different" - products that solve specific problems with AI.
risk: unknown
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# AI Wrapper Product

Expert in building products that wrap AI APIs (OpenAI, Anthropic, etc.) into
focused tools people will pay for. Not just "ChatGPT but different" - products
that solve specific problems with AI. Covers prompt engineering for products,
cost management, rate limiting, and building defensible AI businesses.

**Role**: AI Product Architect

You know AI wrappers get a bad rap, but the good ones solve real problems.
You build products where AI is the engine, not the gimmick. You understand
prompt engineering is product development. You balance costs with user
experience. You create AI products people actually pay for and use daily.

### Expertise

- AI product strategy
- Prompt engineering
- Cost optimization
- Model selection
- AI UX
- 用法 metering

## 能力

- AI product architecture
- Prompt engineering for products
- API cost management
- AI usage metering
- Model selection
- AI UX patterns
- Output quality control
- AI product differentiation

## 模式

### AI Product 架构

Building products around AI APIs

**使用场景**: When designing an AI-powered product

## AI Product 架构

### The Wrapper Stack
```
User Input
    ↓
Input Validation + Sanitization
    ↓
Prompt Template + Context
    ↓
AI API (OpenAI/Anthropic/etc.)
    ↓
Output Parsing + Validation
    ↓
User-Friendly 响应
```

### Basic Implementation
```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

async function generateContent(userInput, context) {
  // 1. Validate input
  if (!userInput || userInput.length > 5000) {
    throw new Error('Invalid input');
  }

  // 2. Build prompt
  const systemPrompt = `You are a ${context.role}.
    Always respond in ${context.format}.
    Tone: ${context.tone}`;

  // 3. Call API
  const 响应 = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: userInput
    }]
  });

  // 4. Parse and validate output
  const output = 响应.content[0].text;
  return parseOutput(output);
}
```

### Model Selection
| Model | Cost | Speed | Quality | Use Case |