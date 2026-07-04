---
name: langgraph
description: LangGraph 专家：构建有状态多 actor AI 应用的生产级框架。涵盖图构建、状态管理、循环和分支、checkpointer 持久化、人在回路模式和 ReAct 代理模式。
  stateful, multi-actor AI applications. Covers graph construction, state
  management, cycles and branches, persistence with checkpointers,
  human-in-the-loop patterns, and the ReAct agent pattern.
risk: unknown
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# LangGraph

LangGraph 专家——构建有状态多 actor AI 应用的生产级框架。涵盖图构建、状态管理、循环和分支、checkpointer 持久化、人在回路模式和 ReAct 代理模式。被 LinkedIn、Uber 和 400+ 公司用于生产环境。这是 LangChain 推荐的构建代理的方法。

**角色**：LangGraph 代理架构师

您是使用 LangGraph 构建生产级 AI 代理的专家。您理解代理需要显式结构——图使流程可见且可调试。您精心设计状态，适当使用 reducer，始终考虑生产环境的持久化。您知道何时需要循环以及如何防止无限循环。

### 专长

- 图拓扑设计
- 状态 schema 模式
- 条件分支
- 持久化策略
- 人在回路
- 工具集成
- 错误处理和恢复

## 能力

- 图构建（StateGraph）
- 状态管理和 reducer
- 节点和边定义
- 条件路由
- Checkpointer 和持久化
- 人在回路模式
- 工具集成
- 流式和异步执行

## 前提条件

- 0：Python 熟练度
- 1：LLM API 基础
- 2：异步编程概念
- 3：图论基础
- 所需技能：Python 3.9+、langgraph 包、LLM API 访问（OpenAI、Anthropic 等）、理解图概念

## 范围

- 0：仅 Python（TypeScript 处于早期阶段）
- 1：图概念的学习曲线
- 2：状态管理复杂度
- 3：调试可能具有挑战性

## 生态系统

### 主要

- LangGraph
- LangChain
- LangSmith（可观测性）

### 常用集成

- OpenAI / Anthropic / Google
- Tavily（搜索）
- SQLite / PostgreSQL（持久化）
- Redis（状态存储）

### 平台

- Python 应用
- FastAPI / Flask 后端
- 云部署

## 模式

### 基本代理图

简单的 ReAct 风格代理与工具

**何时使用**：单代理带工具调用

from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool

# 1. Define State
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    # add_messages reducer appends, doesn't overwrite

# 2. Define Tools
@tool
def search(query: str) -> str:
    """Search the web for information."""
    # Implementation here
    return f"Results for: {query}"

@tool
def calculator(expression: str) -> str:
    """Evaluate a math expression."""
    return str(eval(expression))

tools = [search, calculator]

# 3. Create LLM with tools
llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)

# 4. Define Nodes
def agent(state: AgentState) -> dict:
    """The agent node - calls LLM."""
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

# Tool node handles tool execution
tool_node = ToolNode(tools)

# 5. Define Routing
def should_continue(state: AgentState) -> str:
    """Route based on whether tools were called."""
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"
    return END

# 6. Build Graph
graph = StateGraph(AgentState)

# Add nodes
graph.add_node("agent", agent)
graph.add_node("tools", tool_node)

# Add edges
graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_continue, ["tools", END])
graph.add_edge("tools", "agent")  # Loop back

# Compile
app = graph.compile()

# 7. Run
result = app.invoke({
    "messages": [("user", "What is 25 * 4?")]
})

### 带 Reducer 的状态

使用自定义 reducer 的复杂状态管理

**何时使用**：多个代理更新共享状态

from typing import Annotated, TypedDict
from operator import add
from langgraph.graph import StateGraph

# Custom reducer for merging dictionaries
def merge_dicts(left: dict, right: dict) -> dict:
    return {**left, **right}

# State with multiple reducers
class ResearchState(TypedDict):
    # Messages append (don't overwrite)
    messages: Annotated[list, add_messages]

    # Research findings merge
    findings: Annotated[dict, merge_dicts]

    # Sources accumulate
    sources: Annotated[list[str], add]

    # Current step (overwrites - no reducer)
    current_step: str

    # Error count (custom reducer)
    errors: Annotated[int, lambda a, b: a + b]

# Nodes return partial state updates
def researcher(state: ResearchState) -> dict:
    # Only return fields being updated
    return {
        "findings": {"topic_a": "New finding"},
        "sources": ["source1.com"],
        "current_step": "researching"
    }

def writer(state: ResearchState) -> dict:
    # Access accumulated state
    all_findings = state["findings"]
    all_sources = state["sources"]

    return {
        "messages": [("assistant", f"Report based on {len(all_sources)} sources")],
        "current_step": "writing"
    }

# Build graph
graph = StateGraph(ResearchState)
graph.add_node("researcher", researcher)
graph.add_node("writer", writer)
# ... add edges

### 条件分支

根据状态路由到不同路径

**何时使用**：多种可能的工作流

from langgraph.graph import StateGraph, START, END

class RouterState(TypedDict):
    query: str
    query_type: str
    result: str

def classifier(state: RouterState) -> dict:
    """Classify the query type."""
    query = state["query"].lower()
    if "code" in query or "program" in query:
        return {"query_type": "coding"}
    elif "search" in query or "find" in query:
        return {"query_type": "search"}
    else:
        return {"query_type": "chat"}

def coding_agent(state: RouterState) -> dict:
    return {"result": "Here's your code..."}

def search_agent(state: RouterState) -> dict:
    return {"result": "Search results..."}

def chat_agent(state: RouterState) -> dict:
    return {"result": "Let me help..."}

# Routing function
def route_query(state: RouterState) -> str:
    """Route to appropriate agent."""
    query_type = state["query_type"]
    return query_type  # 返回值 node name

# Build graph
graph = StateGraph(RouterState)

graph.add_node("classifier", classifier)
graph.add_node("coding", coding_agent)
graph.add_node("search", search_agent)
graph.add_node("chat", chat_agent)

graph.add_edge(START, "classifier")

# Conditional edges from classifier
graph.add_conditional_edges(
    "classifier",
    route_query,
    {
        "coding": "coding",
        "search": "search",
        "chat": "chat"
    }
)

# All agents lead to END
graph.add_edge("coding", END)
graph.add_edge("search", END)
graph.add_edge("chat", END)

app = graph.compile()

### 带 Checkpointer 的持久化

保存和恢复代理状态

**何时使用**：多轮对话、长时间运行的代理

from langgraph.graph import StateGraph
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.checkpoint.postgres import PostgresSaver

# SQLite for development
memory = SqliteSaver.from_conn_string(":memory:")
# Or persistent file
memory = SqliteSaver.from_conn_string("agent_state.db")

# PostgreSQL for production
# memory = PostgresSaver.from_conn_string(DATABASE_URL)

# Compile with checkpointer
app = graph.compile(checkpointer=memory)

# Run with thread_id for conversation continuity
config = {"configurable": {"thread_id": "user-123-session-1"}}

# First message
result1 = app.invoke(
    {"messages": [("user", "My name is Alice")]},
    config=config
)

# Second message - agent remembers context
result2 = app.invoke(
    {"messages": [("user", "What's my name?")]},
    config=config
)
# Agent knows name is Alice!

# Get conversation history
state = app.get_state(config)
print(state.values["messages"])

# List all checkpoints
for checkpoint in app.get_state_history(config):
    print(checkpoint.config, checkpoint.values)

### 人在回路

在操作前暂停等待人工批准

**何时使用**：敏感操作，执行前审查

from langgraph.graph import StateGraph, START, END

class ApprovalState(TypedDict):
    messages: Annotated[list, add_messages]
    pending_action: dict | None
    approved: bool

def agent(state: ApprovalState) -> dict:
    # Agent decides on action
    action = {"type": "send_email", "to": "user@example.com"}
    return {
        "pending_action": action,
        "messages": [("assistant", f"I want to: {action}")]
    }

def execute_action(state: ApprovalState) -> dict:
    action = state["pending_action"]
    # Execute the approved action
    result = f"Executed: {action['type']}"
    return {
        "messages": [("assistant", result)],
        "pending_action": None
    }

def should_execute(state: ApprovalState) -> str:
    if state.get("approved"):
        return "execute"
    return END  # Wait for approval

# Build graph
graph = StateGraph(ApprovalState)
graph.add_node("agent", agent)
graph.add_node("execute", execute_action)

graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_execute, ["execute", END])
graph.add_edge("execute", END)

# Compile with interrupt_before for human review
app = graph.compile(
    checkpointer=memory,
    interrupt_before=["execute"]  # Pause before execution
)

# Run until interrupt
config = {"configurable": {"thread_id": "approval-flow"}}
result = app.invoke({"messages": [("user", "Send report")]}, config)

# Agent paused - get pending state
state = app.get_state(config)
pending = state.values["pending_action"]
print(f"Pending: {pending}")  # Human reviews

# Human approves - update state and continue
app.update_state(config, {"approved": True})
result = app.invoke(None, config)  # Resume

### 并行执行（Map-Reduce）

并行运行多个分支

**何时使用**：并行研究、批量处理

from langgraph.graph import StateGraph, START, END, Send
from langgraph.constants import Send

class ParallelState(TypedDict):
    topics: list[str]
    results: Annotated[list[str], add]
    summary: str

def research_topic(state: dict) -> dict:
    """Research a single topic."""
    topic = state["topic"]
    result = f"Research on {topic}..."
    return {"results": [result]}

def summarize(state: ParallelState) -> dict:
    """Combine all research results."""
    all_results = state["results"]
    summary = f"总结 of {len(all_results)} topics"
    return {"summary": summary}

def fanout_topics(state: ParallelState) -> list[Send]:
    """Create parallel tasks for each topic."""
    return [
        Send("research", {"topic": topic})
        for topic in state["topics"]
    ]

# Build graph
graph = StateGraph(ParallelState)
graph.add_node("research", research_topic)
graph.add_node("summarize", summarize)

# Fan out to parallel research
graph.add_conditional_edges(START, fanout_topics, ["research"])
# All research nodes lead to summarize
graph.add_edge("research", "summarize")
graph.add_edge("summarize", END)

app = graph.compile()

result = app.invoke({
    "topics": ["AI", "Climate", "Space"],
    "results": []
})
# Research runs in parallel, then summarizes

## 协作

### 委派触发器

- crewai|role-based|crew -> crewai (Need role-based multi-agent approach)
- observability|tracing|langsmith -> langfuse (Need LLM observability)
- structured output|json schema -> structured-output (Need structured LLM responses)
- evaluate|benchmark|test agent -> agent-evaluation (Need to evaluate agent performance)

### 生产级代理栈

技能：langgraph, langfuse, structured-output

工作流：

```
1. Design agent graph with LangGraph
2. Add structured outputs for tool responses
3. Integrate Langfuse for observability
4. Test and monitor in production
```

### 多代理系统

技能：langgraph, crewai, agent-communication

工作流：

```
1. Design agent roles (CrewAI patterns)
2. Implement as LangGraph with subgraphs
3. Add inter-agent communication
4. Orchestrate with supervisor pattern
```

### 评估式代理

技能：langgraph, agent-evaluation, langfuse

工作流：

```
1. Build agent with LangGraph
2. Create evaluation suite
3. Monitor with Langfuse
4. Iterate based on metrics
```

## 相关技能

与以下技能配合良好：`crewai`、`autonomous-agents`、`langfuse`、`structured-output`

## 何时使用
- 用户提及或暗示：langgraph
- 用户提及或暗示：langchain agent
- 用户提及或暗示：有状态代理
- 用户提及或暗示：代理图
- 用户提及或暗示：react agent
- 用户提及或暗示：代理工作流
- 用户提及或暗示：多步骤代理

## 限制
- 仅当任务明确匹配上述范围时使用此技能。
- 不要将输出视为特定环境验证、测试或专家审查的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
