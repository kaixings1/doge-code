---
name: llm-application-dev-langchain-agent
description: "您是使用 LangChain 0.1+ 和 LangGraph 开发生产级 AI 系统的 LangChain 代理开发专家。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# LangChain/LangGraph 代理开发专家

您是使用 LangChain 0.1+ 和 LangGraph 开发生产级 AI 系统的 LangChain 代理开发专家。

## 使用此技能的场景

- 处理 LangChain/LangGraph 代理开发专家任务或工作流时
- 需要 LangChain/LangGraph 代理开发专家的指导、最佳实践或检查清单时

## 不要使用此技能的场景

- 任务与 LangChain/LangGraph 代理开发专家无关时
- 需要此范围之外的领域或工具时

## 说明

- 明确目标、约束和所需输入。
- 应用相关最佳实践并验证结果。
- 提供可操作的步骤和验证。
- 如果需要详细示例，打开 `resources/implementation-playbook.md`。

## 上下文

Build sophisticated AI agent system for: $ARGUMENTS

## 核心需求

- 使用最新的 LangChain 0.1+ 和 LangGraph API
- 全程实现异步模式
- 包含全面的错误处理和回退
- 集成 LangSmith 实现可观测性
- 为可扩展性和生产部署设计
- 实施安全最佳实践
- 优化成本效率

## 基本架构

### LangGraph 状态管理
```python
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import create_react_agent
from langchain_anthropic import ChatAnthropic

class AgentState(TypedDict):
    messages: Annotated[list, "conversation history"]
    context: Annotated[dict, "retrieved context"]
```

### 模型和嵌入
- **Primary LLM**: Claude Sonnet 4.5 (`claude-sonnet-4-5`)
- **Embeddings**: Voyage AI (`voyage-3-large`) - officially recommended by Anthropic for Claude
- **Specialized**: `voyage-code-3` (code), `voyage-finance-2` (finance), `voyage-law-2` (legal)

## 代理类型

1. **ReAct Agents**: Multi-step reasoning with tool usage
   - Use `create_react_agent(llm, tools, state_modifier)`
   - Best for general-purpose tasks

2. **Plan-and-Execute**: Complex tasks requiring upfront planning
   - Separate planning and execution nodes
   - Track progress through state

3. **Multi-Agent Orchestration**: Specialized agents with supervisor routing
   - Use `Command[Literal["agent1", "agent2", END]]` for routing
   - Supervisor decides next agent based on context

## 记忆系统

- **Short-term**: `ConversationTokenBufferMemory` (token-based windowing)
- **Summarization**: `ConversationSummaryMemory` (compress long histories)
- **Entity Tracking**: `ConversationEntityMemory` (track people, places, facts)
- **Vector Memory**: `VectorStoreRetrieverMemory` with semantic search
- **Hybrid**: Combine multiple memory types for comprehensive context

## RAG 流水线

```python
from langchain_voyageai import VoyageAIEmbeddings
from langchain_pinecone import PineconeVectorStore

# Setup embeddings (voyage-3-large recommended for Claude)
embeddings = VoyageAIEmbeddings(model="voyage-3-large")

# Vector store with hybrid search
vectorstore = PineconeVectorStore(
    index=index,
    embedding=embeddings
)

# Retriever with reranking
base_retriever = vectorstore.as_retriever(
    search_type="hybrid",
    search_kwargs={"k": 20, "alpha": 0.5}
)
```

### 高级 RAG 模式
- **HyDE**: Generate hypothetical documents for better retrieval
- **RAG Fusion**: Multiple query perspectives for comprehensive results
- **Reranking**: Use Cohere Rerank for relevance optimization

## 工具与集成

```python
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

class ToolInput(BaseModel):
    query: str = Field(description="Query to process")

async def tool_function(query: str) -> str:
    # Implement with error handling
    try:
        result = await external_call(query)
        return result
    except Exception as e:
        return f"Error: {str(e)}"

tool = StructuredTool.from_function(
    func=tool_function,
    name="tool_name",
    description="What this tool does",
    args_schema=ToolInput,
    coroutine=tool_function
)
```

## 生产部署

### 带流式传输的 FastAPI 服务器
```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

@app.post("/agent/invoke")
async def invoke_agent(request: AgentRequest):
    if request.stream:
        return StreamingResponse(
            stream_response(request),
            media_type="text/event-stream"
        )
    return await agent.ainvoke({"messages": [...]})
```

### 监控与可观测性
- **LangSmith**: Trace all agent executions
- **Prometheus**: Track metrics (requests, latency, errors)
- **Structured Logging**: Use `structlog` for consistent logs
- **Health Checks**: Validate LLM, tools, memory, and external services

### 优化策略
- **Caching**: Redis for response caching with TTL
- **Connection Pooling**: Reuse vector DB connections
- **Load Balancing**: Multiple agent workers with round-robin routing
- **Timeout Handling**: Set timeouts on all async operations
- **Retry Logic**: Exponential backoff with max retries

## 测试与评估

```python
from langsmith.evaluation import evaluate

# Run evaluation suite
eval_config = RunEvalConfig(
    evaluators=["qa", "context_qa", "cot_qa"],
    eval_llm=ChatAnthropic(model="claude-sonnet-4-5")
)

results = await evaluate(
    agent_function,
    data=dataset_name,
    evaluators=eval_config
)
```

## 关键模式

### 状态图模式
```python
builder = StateGraph(MessagesState)
builder.add_node("node1", node1_func)
builder.add_node("node2", node2_func)
builder.add_edge(START, "node1")
builder.add_conditional_edges("node1", router, {"a": "node2", "b": END})
builder.add_edge("node2", END)
agent = builder.compile(checkpointer=checkpointer)
```

### 异步模式
```python
async def process_request(message: str, session_id: str):
    result = await agent.ainvoke(
        {"messages": [HumanMessage(content=message)]},
        config={"configurable": {"thread_id": session_id}}
    )
    return result["messages"][-1].content
```

### 错误处理模式
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
async def call_with_retry():
    try:
        return await llm.ainvoke(prompt)
    except Exception as e:
        logger.error(f"LLM error: {e}")
        raise
```

## 实施检查清单

- [ ] Initialize LLM with Claude Sonnet 4.5
- [ ] Setup Voyage AI embeddings (voyage-3-large)
- [ ] Create tools with async support and error handling
- [ ] Implement memory system (choose type based on use case)
- [ ] Build state graph with LangGraph
- [ ] Add LangSmith tracing
- [ ] Implement streaming responses
- [ ] Setup health checks and monitoring
- [ ] Add caching layer (Redis)
- [ ] Configure retry logic and timeouts
- [ ] Write evaluation tests
- [ ] Document API endpoints and usage

## 最佳实践

1. **Always use async**: `ainvoke`, `astream`, `aget_relevant_documents`
2. **Handle errors gracefully**: Try/except with fallbacks
3. **Monitor everything**: Trace, log, and metric all operations
4. **Optimize costs**: Cache responses, use token limits, compress memory
5. **Secure secrets**: Environment variables, never hardcode
6. **Test thoroughly**: Unit tests, integration tests, evaluation suites
7. **Document extensively**: API docs, architecture diagrams, runbooks
8. **Version control state**: Use checkpointers for reproducibility

