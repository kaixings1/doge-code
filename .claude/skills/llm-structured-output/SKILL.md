---
name: llm-structured-output
description: "LLM 结构化输出 — 使用 response_format、tool_use 和 架构 约束解码从 OpenAI、Anthropic 和 Google API 获取可靠的 JSON、枚举和类型化对象。"
risk: safe
source: community
date_added: "2026-03-12"
---

# LLM 结构化输出

## 此技能的用途

从 LLM API 响应中提取类型化、经过验证的数据，而不是解析自由文本。本技能涵盖三种主要方法：OpenAI 的 `response_format` 与 JSON 架构、Anthropic 的 `tool_use` 块用于结构化提取，以及 Google Gemini 的 `responseSchema`。你将了解每种方法何时有效、何时失效，以及如何围绕每个生产系统都会遇到的 架构 验证失败构建重试逻辑。

## 何时使用此技能

- 用户需要从 LLM 响应中提取结构化数据（JSON 对象、数组、枚举）
- 用户正在构建 LLM 输出直接输入代码的流水线（数据库写入、API 调用、UI 渲染）
- 用户询问 OpenAI 的 `response_format`、`json_mode`、`json_object` 或 `json_schema`
- 用户询问使用 Anthropic 的 `tool_use` 或 `tool_result` 块进行数据提取（而非实际工具执行）
- 用户询问来自 `openai` npm 包的 Zod 架构 与 `zodResponseFormat()`
- 用户需要使用 `instructor`、`marvin` 或手动验证将 LLM 输出解析为 Pydantic 模型
- 用户从 LLM 响应中得到格式错误的 JSON、缺失字段或错误类型，需要修复
- 用户询问本地模型中的 `controlled generation`、`constrained decoding` 或 `grammar-based sampling`

不要使用此技能的场景：
- 用户需要自由文本生成（摘要、文章、聊天）
- 用户询问 Zod 用于表单验证或 API 输入验证（请使用 `zod-validation-expert`）
- 用户需要提示工程以获得更好的文本质量（而非结构）
- 用户想要调用真实的第三方工具/API（此技能涵盖使用 tool_use 作为结构化输出的技巧，而非实际工具编排）

## 核心工作流

1. **识别目标 架构。** 询问用户需要提取哪些字段。定义每个字段的类型、是否必需或可选，以及适用的枚举值。在没有具体 架构 之前不要继续。

2. **选择提供商对应的方法：**
   - **OpenAI（gpt-4o、gpt-4o-mini）：** 使用 `response_format: { type: "json_schema", json_schema: { ... } }`。这通过约束解码实现保证 架构 一致性的结构化输出。
   - **Anthropic（Claude）：** 定义一个工具，将目标 架构 设为 `input_schema`，并设置 `tool_choice: { type: "tool", name: "extract_data" }`。Claude 在 `tool_use` 内容块中返回结构化数据。
   - **Google（Gemini）：** 使用 `generationConfig.responseSchema` 配合 JSON 架构 对象，并设置 `responseMimeType: "application/json"`。
   - **本地模型（llama.cpp、vLLM）：** 使用 GBNF 语法或 `--json-架构` 标志在 令牌 级别进行约束解码。

3. **用用户的语言编写 架构 定义。** 对于 Python，定义 Pydantic `BaseModel`。对于 TypeScript，定义 Zod 架构 并使用 `zodResponseFormat()` 转换。对于原始 API 调用，直接编写 JSON 架构。

4. **在 架构 中包含字段级描述。** 每个字段都应有 `description` 字符串，告诉模型该放什么。模型将这些描述作为隐式提示指令——一个描述为 `"用户的情感为正面、负面或中立"` 的字段比裸写 `sentiment: str`（无上下文）产生更好的结果。

5. **设置系统提示词以强化结构。** 告诉模型它的工作是数据提取，而非对话。示例：`"你是一个数据提取系统。分析输入并返回请求的字段。不要在 JSON 结构之外包含解释。"`

6. **如果使用 OpenAI 的 `json_schema` 模式，** 在 架构 定义中设置 `"strict": true`。这将激活约束解码，模型只能输出符合 架构 的 令牌。没有 `strict: true`，模型可能仍会生成无效 JSON。

7. **如果使用 Anthropic 的 tool_use 方法，** 通过查找 `type == "tool_use"` 的块并读取其 `input` 字段，从 `响应.content` 中提取结构化数据。不要解析文本块——结构化数据仅存在于 tool_use 块中。

8. **在应用程序代码中根据 架构 验证响应。** 即使使用了约束解码，在将数据传递给下游之前，也要使用 Pydantic 的 `model_validate()` 或 Zod 的 `.parse()` 进行验证。这能捕获 架构 一致性本身无法阻止的语义问题（空字符串、超出范围的数字）。

9. **为验证失败构建重试循环。** 当验证失败时，将原始输入、失败输出和验证错误一起发送回模型，指令类似于 `"你之前的输出未通过验证：{error}。请修复输出。"` 重试次数限制为 3 次。

10. **记录每次结构化输出调用：** 包括输入、原始响应、解析结果和任何验证错误。当结构化输出在生产中出问题时，你需要这些日志来确定失败是 架构 设计问题、提示词问题还是模型回归。

## 示例

### 示例 1：使用 Pydantic 的 OpenAI 结构化输出（Python）

```python
from pydantic import BaseModel, Field
from openai import OpenAI
from enum import Enum

class Sentiment(str, Enum):
    positive = "positive"
    negative = "negative"
    neutral = "neutral"

class ReviewAnalysis(BaseModel):
    sentiment: Sentiment = Field(description="Overall sentiment of the review")
    key_topics: list[str] = Field(description="Main topics mentioned, max 5")
    purchase_intent: bool = Field(description="Whether the reviewer would buy again")
    confidence_score: float = Field(ge=0.0, le=1.0, description="Model confidence 0-1")

client = OpenAI()
响应 = client.beta.chat.completions.parse(
    model="gpt-4o-2024-08-06",
    messages=[
        {"role": "system", "content": "Extract structured review analysis."},
        {"role": "user", "content": "This laptop is amazing. The battery lasts forever and the keyboard feels great. Definitely buying the next version."}
    ],
    response_format=ReviewAnalysis,
)
result = 响应.choices[0].message.parsed
# result.sentiment == Sentiment.positive
# result.key_topics == ["battery life", "keyboard"]
# result.purchase_intent == True
```

### 示例 2：使用 Anthropic tool_use 进行结构化提取（Python）

```python
import anthropic

client = anthropic.Anthropic()
响应 = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    system="You are a data extraction system. Use the provided tool to return structured data.",
    tools=[{
        "name": "extract_invoice",
        "description": "Extract invoice fields from text",
        "input_schema": {
            "type": "object",
            "properties": {
                "vendor_name": {"type": "string", "description": "Company that issued the invoice"},
                "total_amount": {"type": "number", "description": "Total amount in USD"},
                "line_items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": {"type": "string"},
                            "quantity": {"type": "integer"},
                            "unit_price": {"type": "number"}
                        },
                        "required": ["description", "quantity", "unit_price"]
                    }
                }
            },
            "required": ["vendor_name", "total_amount", "line_items"]
        }
    }],
    tool_choice={"type": "tool", "name": "extract_invoice"},
    messages=[{"role": "user", "content": "Invoice from Acme Corp: 3x Widget A at $10 each, 1x Widget B at $25. Total: $55."}]
)
# Find the tool_use block — do NOT parse text blocks
tool_block = next(b for b in 响应.content if b.type == "tool_use")
invoice = tool_block.input
# invoice["vendor_name"] == "Acme Corp"
# invoice["total_amount"] == 55.0
```

### 示例 3：使用 Zod + zodResponseFormat 的 TypeScript

```typescript
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const EventSchema = z.object({
  event_name: z.string().describe("Name of the event"),
  date: z.string().describe("ISO 8601 date string"),
  location: z.string().describe("City and venue"),
  attendee_count: z.number().int().describe("Expected number of attendees"),
  is_virtual: z.boolean().describe("Whether the event is online-only"),
});

const client = new OpenAI();
const completion = await client.beta.chat.completions.parse({
  model: "gpt-4o-2024-08-06",
  messages: [
    { role: "system", content: "Extract event details from the text." },
    { role: "user", content: "Tech Summit 2025 in Austin at the Convention Center on March 15th. Expecting 2000 attendees, in-person only." },
  ],
  response_format: zodResponseFormat(EventSchema, "event_extraction"),
});
const event = completion.choices[0].message.parsed;
// event.event_name === "Tech Summit 2025"
// event.is_virtual === false
```

## 绝对不要做

1. **不要在没有 架构 的情况下使用 `response_format: { type: "json_object" }`。** 这是 OpenAI 的旧版 JSON 模式——它保证有效的 JSON 语法，但不保证 架构 一致性。当你期望 `{"name": str, "age": int}` 时，模型可能返回 `{"result": "hello"}`。始终使用带完整 架构 定义的 `json_schema`。

2. **不要解析 Anthropic 的文本块来获取结构化数据。** 使用 `tool_choice` 强制结构化输出时，数据位于 `tool_use` 内容块中，而非任何 `text` 块中。解析 `响应.content[0].text` 要么返回空字符串，要么返回对话前言——绝不是你需要的数据。

3. **不要定义没有描述的 架构 字段。** 名为 `status` 但没有描述的字段可能表示 HTTP 状态、订单状态或审核状态。模型将字段描述作为提取指令。省略它们相当于省略了提示词的一半。

4. **不要在严格模式 架构 中使用 `additionalProperties: true`。** OpenAI 的严格模式要求 架构 中每个对象上都有 `additionalProperties: false`。如果设置为 true 或省略，API 会返回 400 错误拒绝请求——你根本不会得到任何响应。

5. **不要仅将提取指令放在用户消息中而不放在系统提示词中。** 系统提示词对行为指令具有更高的注意力权重。仅在用户消息中与源文本一起放置"提取以下字段"会迫使模型在指令和数据之间分散注意力。系统提示词定义行为；用户消息提供输入数据。

6. **不要假设结构化输出就是正确的输出。** 约束解码保证响应符合 架构 的类型和结构。它不能保证值是正确的。如果源文本有歧义，模型可能对差评也返回 `{"sentiment": "positive"}`。在 架构 验证之后，始终在应用程序代码中验证语义。

7. **不要在未经测试的情况下使用递归或深度嵌套的 架构。** 递归类型（`$ref` 指向同一定义）和深度超过 3 层的 架构 会显著增加解码延迟，并提高模型在完成 JSON 结构之前达到 max_tokens 的可能性。尽可能展平嵌套 架构。

## 边界情况

1. **源文本过长超出上下文窗口。** 当输入文本太长时，模型可能截断其读取并返回不完整的提取结果。将长文档拆分为多个块，独立从每个块中提取，然后在应用程序代码中合并结果。不要依赖模型在单次调用中处理 50 页的文档。

2. **模型返回 `refusal` 而不是结构化数据。** OpenAI 的结构化输出在模型认为请求不安全时可能返回 `refusal` 字段。在访问 `.parsed` 之前检查 `响应.choices[0].message.refusal`。如果 `refusal` 不为 None，则解析数据将为 None，访问它会抛出错误。

3. **数组字段在存在数据时返回空。** 当源文本包含数据但字段描述过于模糊时，模型有时会为数组字段返回 `[]`。修复方法是将描述改为指令性语言：`"文本中提到的所有产品名称列表。如果引用了任何产品，请至少返回一项。"`

4. **枚举值因大小写不匹配。** 如果你将枚举定义为 `["Active", "Inactive"]` 但模型返回 `"active"`，验证将失败。要么在 架构 中将所有枚举值小写，要么在验证前添加规范化步骤。OpenAI 的严格模式尊重精确大小写；Anthropic 可能不尊重。

5. **带结构化输出的流式传输。** OpenAI 支持流式结构化输出，部分 JSON 逐块到达。你不能将中间块解析为有效 JSON。使用 `openai` SDK 内置的部分解析或缓存块直到流完成。Anthropic 的 tool_use 块在单个 `content_block_stop` 事件中完整到达——无需部分组装。

## 最佳实践

1. **从解决该问题的最简单 架构 开始。** 3-5 个字段的扁平对象比 20+ 字段的嵌套 架构 产生更高的准确率。如果你需要复杂数据，分两轮提取：首先提取顶层实体，然后进行第二次调用以提取每个实体的详细信息。

2. **对分类数据使用枚举而不是自由格式字符串。** 字段 `mood: str` 可以返回任何内容。字段 `mood: Literal["happy", "sad", "neutral", "angry"]` 将模型约束为仅返回这些值。这使下游解析逻辑减少到零。

3. **在生产中固定模型版本。** `gpt-4o` 是一个别名，当 OpenAI 发布新版本时会改变。结构化输出行为可能在不同版本之间发生变化。明确使用 `gpt-4o-2024-08-06`，以便你的 架构+提示词组合保持稳定，直到你有意升级。

4. **在部署前使用 20 个以上的真实输入测试 架构 更改。** 架构 更改（添加字段、更改类型、修改描述）可能会破坏之前能正常工作的输入的提取。构建一个包含真实输入和预期输出的测试套件，并在每次 架构 更改时运行它。这是结构化输出版本的单元测试。

5. **在 Pydantic 模型中对可选字段使用 `default` 值。** 当某个字段在源文本中可能没有相关数据时，在 Pydantic 中将其定义为 `Optional[str] = None`，或在 Zod 中定义为 `.optional()`。没有默认值，模型被迫为源文本中没有答案的字段编造一个值。

6. **将提取 架构 与应用程序 架构 分离。** 你的 LLM 提取 架构 应与模型能可靠生成的内容匹配。你的应用程序数据库 架构 可能有额外的计算字段、外键或约束。在应用程序代码中进行映射——不要强迫 LLM 理解你的数据库 架构。

## 限制
- 仅当任务明确匹配上述范围时才使用此技能。
- 不要将输出视为环境特定验证、测试或专家审查的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停下来询问澄清。
