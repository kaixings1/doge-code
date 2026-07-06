---
name: langfuse
description: LangFuse 专家：开源 LLM 可观测性平台。
  Covers tracing, prompt management, evaluation, datasets, and 集成 with
  LangChain, LlamaIndex, and OpenAI. Essential for debugging, monitoring, and
  improving LLM applications in production.
risk: unknown
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# Langfuse

Langfuse 专家——开源 LLM 可观测性平台。涵盖追踪、提示管理、评估、数据集以及与 LangChain、LlamaIndex 和 OpenAI 的集成。对于调试、监控和改进生产中的 LLM 应用至关重要。

**角色**：LLM 可观测性架构师

您是 LLM 可观测性和评估方面的专家。您以追踪、跨度和指标的方式思考。您知道 LLM 应用需要像传统软件一样的监控——但维度和不同（成本、质量、延迟）。您使用数据来推动提示改进并捕获回归。

### 专长

- 追踪架构
- 提示版本管理
- 评估策略
- 成本优化
- 质量监控

## 能力

- LLM 追踪和可观测性
- 提示管理和版本管理
- 评估和评分
- 数据集管理
- 成本跟踪
- 性能监控
- A/B 测试提示

## 前提条件

- 0：LLM 应用基础
- 1：API 集成经验
- 2：理解追踪概念
- 所需技能：Python 或 TypeScript/JavaScript、Langfuse 账户（云或自托管）、LLM API 密钥

## 范围

- 0：自托管需要基础设施
- 1：高流量可能需要优化
- 2：实时仪表板有延迟
- 3：评估需要配置

## 生态系统

### 主要

- Langfuse Cloud
- Langfuse Self-hosted
- Python SDK
- JS/TS SDK

### 常用集成

- LangChain
- LlamaIndex
- OpenAI SDK
- Anthropic SDK
- Vercel AI SDK

### 平台

- 任何 Python/JS 后端
- 无服务器函数
- Jupyter notebooks

## 模式

### 基本追踪设置

使用 Langfuse 检测 LLM 调用

**何时使用**：任何 LLM 应用

from langfuse import Langfuse

# Initialize client
langfuse = Langfuse(
    public_key="pk-...",
    secret_key="sk-...",
    host="https://cloud.langfuse.com"  # or self-hosted URL
)

# Create a trace for a user 请求
trace = langfuse.trace(
    name="chat-completion",
    user_id="user-123",
    session_id="会话-456",  # Groups related traces
    metadata={"feature": "customer-support"},
    tags=["production", "v2"]
)

# Log a generation (LLM call)
generation = trace.generation(
    name="gpt-4o-响应",
    model="gpt-4o",
    model_parameters={"temperature": 0.7},
    input={"messages": [{"role": "user", "content": "Hello"}]},
    metadata={"attempt": 1}
)

# Make actual LLM call
响应 = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)

# Complete the generation with output
generation.end(
    output=响应.choices[0].message.content,
    usage={
        "input": 响应.usage.prompt_tokens,
        "output": 响应.usage.completion_tokens
    }
)

# Score the trace
trace.score(
    name="user-feedback",
    value=1,  # 1 = positive, 0 = negative
    comment="User clicked helpful"
)

# Flush before exit (important in serverless)
langfuse.flush()

### OpenAI 集成

使用 OpenAI SDK 自动追踪

**何时使用**：基于 OpenAI 的应用

from langfuse.openai import openai

# Drop-in replacement for OpenAI client
# All calls automatically traced

响应 = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    # Langfuse-specific parameters
    name="greeting",  # Trace name
    session_id="会话-123",
    user_id="user-456",
    tags=["test"],
    metadata={"feature": "chat"}
)

# Works with streaming
stream = openai.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True,
    name="story-generation"
)

for chunk in stream:
    print(chunk.choices[0].delta.content, end="")

# Works with async
import asyncio
from langfuse.openai import AsyncOpenAI

async_client = AsyncOpenAI()

async def main():
    响应 = await async_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
        name="async-greeting"
    )

### LangChain 集成

追踪 LangChain 应用

**何时使用**：基于 LangChain 的应用

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langfuse.回调 import CallbackHandler

# Create Langfuse 回调 处理器
langfuse_handler = CallbackHandler(
    public_key="pk-...",
    secret_key="sk-...",
    host="https://cloud.langfuse.com",
    session_id="会话-123",
    user_id="user-456"
)

# Use with any LangChain component
llm = ChatOpenAI(model="gpt-4o")

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("user", "{input}")
])

chain = prompt | llm

# Pass 处理器 to invoke
响应 = chain.invoke(
    {"input": "Hello"},
    config={"callbacks": [langfuse_handler]}
)

# Or set as default
import langchain
langchain.callbacks.manager.set_handler(langfuse_handler)

# Then all calls are traced
响应 = chain.invoke({"input": "Hello"})

# Works with agents, retrievers, etc.
from langchain.agents import create_openai_tools_agent

agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools)

result = agent_executor.invoke(
    {"input": "What's the weather?"},
    config={"callbacks": [langfuse_handler]}
)

### 提示管理

版本化和部署提示

**何时使用**：跨环境管理提示

from langfuse import Langfuse

langfuse = Langfuse()

# Fetch prompt from Langfuse
# (Create in UI or via API first)
prompt = langfuse.get_prompt("customer-support-v2")

# Get compiled prompt with variables
compiled = prompt.compile(
    customer_name="John",
    issue="billing question"
)

# Use with OpenAI
响应 = openai.chat.completions.create(
    model=prompt.config.get("model", "gpt-4o"),
    messages=compiled,
    temperature=prompt.config.get("temperature", 0.7)
)

# Link generation to prompt version
trace = langfuse.trace(name="support-chat")
generation = trace.generation(
    name="响应",
    model="gpt-4o",
    prompt=prompt  # Links to specific version
)

# Create/update prompts via API
langfuse.create_prompt(
    name="customer-support-v3",
    prompt=[
        {"role": "system", "content": "You are a support agent..."},
        {"role": "user", "content": "{{user_message}}"}
    ],
    config={
        "model": "gpt-4o",
        "temperature": 0.7
    },
    labels=["production"]  # or ["staging", "development"]
)

# Fetch specific label
prompt = langfuse.get_prompt(
    "customer-support-v3",
    label="production"  # Gets latest with this label
)

### 评估与评分

系统评估 LLM 输出

**何时使用**：质量保证和改进

from langfuse import Langfuse

langfuse = Langfuse()

# Manual scoring in code
trace = langfuse.trace(name="qa-flow")

# After getting 响应
trace.score(
    name="relevance",
    value=0.85,  # 0-1 scale
    comment="响应 addressed the question"
)

trace.score(
    name="correctness",
    value=1,  # Binary: 0 or 1
    data_type="BOOLEAN"
)

# LLM-as-judge evaluation
def evaluate_response(question: str, 响应: str) -> float:
    eval_prompt = f"""
    Rate the 响应 quality from 0 to 1.

    Question: {question}
    响应: {响应}

    Output only a number between 0 and 1.
    """

    result = openai.chat.completions.create(
        model="gpt-4o-mini",  # Cheaper model for eval
        messages=[{"role": "user", "content": eval_prompt}]
    )

    return float(result.choices[0].message.content.strip())

# Score asynchronously
score = evaluate_response(question, 响应)
trace.score(
    name="quality-llm-judge",
    value=score
)

# Create evaluation dataset
dataset = langfuse.create_dataset(name="support-qa-v1")

# Add items to dataset
langfuse.create_dataset_item(
    dataset_name="support-qa-v1",
    input={"question": "How do I reset my password?"},
    expected_output="Go to settings > security > reset password"
)

# Run evaluation on dataset
dataset = langfuse.get_dataset("support-qa-v1")

for item in dataset.items:
    # Generate 响应
    响应 = generate_response(item.input["question"])

    # Link to dataset item
    trace = langfuse.trace(name="eval-run")
    trace.generation(
        name="响应",
        input=item.input,
        output=响应
    )

    # Score against expected
    similarity = calculate_similarity(响应, item.expected_output)
    trace.score(name="similarity", value=similarity)

    # Link trace to dataset item
    item.link(trace, "eval-run-1")

### 装饰器模式

使用装饰器进行干净的检测

**何时使用**：基于函数的应用

from langfuse.decorators import observe, langfuse_context

@observe()  # Creates a trace
def chat_handler(user_id: str, message: str) -> str:
    # All nested @observe calls become spans
    context = get_context(message)
    响应 = generate_response(message, context)
    return 响应

@observe()  # Becomes a span under parent trace
def get_context(message: str) -> str:
    # RAG retrieval
    docs = retriever.get_relevant_documents(message)
    return "\n".join([d.page_content for d in docs])

@observe(as_type="generation")  # LLM generation span
def generate_response(message: str, context: str) -> str:
    响应 = openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"Context: {context}"},
            {"role": "user", "content": message}
        ]
    )
    return 响应.choices[0].message.content

# Add metadata and scores
@observe()
def main_flow(user_input: str):
    # Update current trace
    langfuse_context.update_current_trace(
        user_id="user-123",
        session_id="会话-456",
        tags=["production"]
    )

    result = process(user_input)

    # Score the trace
    langfuse_context.score_current_trace(
        name="success",
        value=1 if result else 0
    )

    return result

# Works with async
@observe()
async def async_handler(message: str):
    result = await async_generate(message)
    return result

## 协作

### 委派触发器

- agent|langgraph|graph -> langgraph (Need to build agent to monitor)
- crewai|multi-agent|crew -> crewai (Need to build crew to monitor)
- structured output|extraction -> structured-output (Need to build extraction to monitor)

### 可观测的 LangGraph 代理

技能：langfuse, langgraph

工作流：

```
1. Build agent with LangGraph
2. Add Langfuse 回调 处理器
3. Trace all LLM calls and tool uses
4. Score outputs for quality
5. Monitor and iterate
```

### 监控式 RAG 管道

技能：langfuse, structured-output

工作流：

```
1. Build RAG with retrieval and generation
2. Trace retrieval and LLM calls
3. Score relevance and accuracy
4. Track costs and latency
5. Optimize based on data
```

### 评估式代理系统

技能：langfuse, langgraph, structured-output

工作流：

```
1. Build agent with structured outputs
2. Create evaluation dataset
3. Run evaluations with traces
4. Compare prompt versions
5. Deploy best performers
```

## 相关技能

与以下技能配合良好：`langgraph`、`crewai`、`structured-output`、`autonomous-agents`

## 何时使用
- 用户提及或暗示：langfuse
- 用户提及或暗示：llm 可观测性
- 用户提及或暗示：llm 追踪
- 用户提及或暗示：提示管理
- 用户提及或暗示：llm 评估
- 用户提及或暗示：监控 llm
- 用户提及或暗示：调试 llm

## 限制
- 仅当任务明确匹配上述范围时使用此技能。
- 不要将输出视为特定环境验证、测试或专家审查的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
