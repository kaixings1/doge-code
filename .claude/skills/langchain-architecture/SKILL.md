---
name: langchain-architecture
description: "掌握 LangChain 框架，使用代理、链、记忆和工具集成构建复杂的 LLM 应用。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# LangChain 架构

掌握 LangChain 框架，使用代理、链、记忆和工具集成构建复杂的 LLM 应用。

## 不使用此技能的情况

- 任务与 langchain 架构无关
- 需要此范围之外的不同领域或工具

## 使用说明

- 明确目标、约束和所需的输入。
- 应用相关的最佳实践并验证结果。
- 提供可执行的步骤和验证方法。
- 如果需要详细示例，请打开 `resources/implementation-playbook.md`。

## 何时使用此技能

- 构建具有工具访问权限的自主 AI 代理
- 实现复杂的多步骤 LLM 工作流
- 管理对话记忆和状态
- 将 LLM 与外部数据源和 API 集成
- 创建模块化、可重用的 LLM 应用组件
- 实现文档处理管道
- 构建生产级 LLM 应用

## 核心概念

### 1. 代理
使用 LLM 决定采取哪些行动的自主系统。

**代理类型：**
- **ReAct**：交错推理和行动
- **OpenAI Functions**：利用函数调用 API
- **Structured Chat**：处理多输入工具
- **Conversational**：为聊天界面优化
- **Self-Ask with Search**：分解复杂查询

### 2. 链
对 LLM 或其他工具的调用序列。

**链类型：**
- **LLMChain**：基本提示 + LLM 组合
- **SequentialChain**：多个链按顺序执行
- **RouterChain**：将输入路由到专门的链
- **TransformChain**：步骤之间的数据转换
- **MapReduceChain**：带聚合的并行处理

### 3. 记忆
在交互之间维持上下文的系统。

**记忆类型：**
- **ConversationBufferMemory**：存储所有消息
- **Conversation总结Memory**：总结较旧的消息
- **ConversationBufferWindowMemory**：保留最近 N 条消息
- **EntityMemory**：跟踪实体的信息
- **VectorStoreMemory**：语义相似性检索

### 4. 文档处理
加载、转换和存储文档以便检索。

**组件：**
- **Document Loaders**：从各种来源加载
- **Text Splitters**：智能分块文档
- **Vector Stores**：存储和检索嵌入
- **Retrievers**：获取相关文档
- **Indexes**：组织文档以便高效访问

### 5. 回调
用于日志记录、监控和调试的钩子。

**用例：**
- 请求/响应日志记录
- Token 使用跟踪
- 延迟监控
- 错误处理
- 自定义指标收集

## 快速开始

```python
from langchain.agents import AgentType, initialize_agent, load_tools
from langchain.llms import OpenAI
from langchain.memory import ConversationBufferMemory

# Initialize LLM
llm = OpenAI(temperature=0)

# Load tools
tools = load_tools(["serpapi", "llm-math"], llm=llm)

# Add memory
memory = ConversationBufferMemory(memory_key="chat_history")

# Create agent
agent = initialize_agent(
    tools,
    llm,
    agent=AgentType.CONVERSATIONAL_REACT_DESCRIPTION,
    memory=memory,
    verbose=True
)

# Run agent
result = agent.run("What's the weather in SF? Then calculate 25 * 4")
```

## 架构模式

### 模式 1：基于 LangChain 的 RAG
```python
from langchain.chains import RetrievalQA
from langchain.document_loaders import TextLoader
from langchain.text_splitter import CharacterTextSplitter
from langchain.vectorstores import Chroma
from langchain.embeddings import OpenAIEmbeddings

# Load and process documents
loader = TextLoader('documents.txt')
documents = loader.load()

text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
texts = text_splitter.split_documents(documents)

# Create vector store
embeddings = OpenAIEmbeddings()
vectorstore = Chroma.from_documents(texts, embeddings)

# Create retrieval chain
qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=vectorstore.as_retriever(),
    return_source_documents=True
)

# Query
result = qa_chain({"query": "What is the main topic?"})
```

### 模式 2：自定义代理与工具
```python
from langchain.agents import Tool, AgentExecutor
from langchain.agents.react.base import ReActDocstoreAgent
from langchain.tools import tool

@tool
def search_database(query: str) -> str:
    """Search internal database for information."""
    # Your database search logic
    return f"Results for: {query}"

@tool
def send_email(recipient: str, content: str) -> str:
    """Send an email to specified recipient."""
    # Email sending logic
    return f"Email sent to {recipient}"

tools = [search_database, send_email]

agent = initialize_agent(
    tools,
    llm,
    agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
    verbose=True
)
```

### 模式 3：多步骤链
```python
from langchain.chains import LLMChain, SequentialChain
from langchain.prompts import PromptTemplate

# Step 1: Extract key information
extract_prompt = PromptTemplate(
    input_variables=["text"],
    template="Extract key entities from: {text}\n\nEntities:"
)
extract_chain = LLMChain(llm=llm, prompt=extract_prompt, output_key="entities")

# Step 2: Analyze entities
analyze_prompt = PromptTemplate(
    input_variables=["entities"],
    template="Analyze these entities: {entities}\n\nAnalysis:"
)
analyze_chain = LLMChain(llm=llm, prompt=analyze_prompt, output_key="analysis")

# Step 3: Generate summary
summary_prompt = PromptTemplate(
    input_variables=["entities", "analysis"],
    template="Summarize:\nEntities: {entities}\nAnalysis: {analysis}\n\nSummary:"
)
summary_chain = LLMChain(llm=llm, prompt=summary_prompt, output_key="summary")

# Combine into sequential chain
overall_chain = SequentialChain(
    chains=[extract_chain, analyze_chain, summary_chain],
    input_variables=["text"],
    output_variables=["entities", "analysis", "summary"],
    verbose=True
)
```

## 记忆管理最佳实践

### 选择正确的记忆类型
```python
# For short conversations (< 10 messages)
from langchain.memory import ConversationBufferMemory
memory = ConversationBufferMemory()

# For long conversations (summarize old messages)
from langchain.memory import ConversationSummaryMemory
memory = ConversationSummaryMemory(llm=llm)

# For sliding window (last N messages)
from langchain.memory import ConversationBufferWindowMemory
memory = ConversationBufferWindowMemory(k=5)

# For entity tracking
from langchain.memory import ConversationEntityMemory
memory = ConversationEntityMemory(llm=llm)

# For semantic retrieval of relevant history
from langchain.memory import VectorStoreRetrieverMemory
memory = VectorStoreRetrieverMemory(retriever=retriever)
```

## 回调系统

### 自定义回调处理器
```python
from langchain.callbacks.base import BaseCallbackHandler

class CustomCallbackHandler(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, **kwargs):
        print(f"LLM started with prompts: {prompts}")

    def on_llm_end(self, response, **kwargs):
        print(f"LLM ended with response: {response}")

    def on_llm_error(self, error, **kwargs):
        print(f"LLM error: {error}")

    def on_chain_start(self, serialized, inputs, **kwargs):
        print(f"Chain started with inputs: {inputs}")

    def on_agent_action(self, action, **kwargs):
        print(f"Agent taking action: {action}")

# Use callback
agent.run("query", callbacks=[CustomCallbackHandler()])
```

## 测试策略

```python
import pytest
from unittest.mock import Mock

def test_agent_tool_selection():
    # Mock LLM to return specific tool selection
    mock_llm = Mock()
    mock_llm.predict.return_value = "Action: search_database\nAction Input: test query"

    agent = initialize_agent(tools, mock_llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION)

    result = agent.run("test query")

    # Verify correct tool was selected
    assert "search_database" in str(mock_llm.predict.call_args)

def test_memory_persistence():
    memory = ConversationBufferMemory()

    memory.save_context({"input": "Hi"}, {"output": "Hello!"})

    assert "Hi" in memory.load_memory_variables({})['history']
    assert "Hello!" in memory.load_memory_variables({})['history']
```

## 性能优化

### 1. 缓存
```python
from langchain.cache import InMemoryCache
import langchain

langchain.llm_cache = InMemoryCache()
```

### 2. 批量处理
```python
# Process multiple documents in parallel
from langchain.document_loaders import DirectoryLoader
from concurrent.futures import ThreadPoolExecutor

loader = DirectoryLoader('./docs')
docs = loader.load()

def process_doc(doc):
    return text_splitter.split_documents([doc])

with ThreadPoolExecutor(max_workers=4) as executor:
    split_docs = list(executor.map(process_doc, docs))
```

### 3. 流式响应
```python
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler

llm = OpenAI(streaming=True, callbacks=[StreamingStdOutCallbackHandler()])
```

## 资源

- **references/agents.md**: Deep dive on agent architectures
- **references/memory.md**: Memory system patterns
- **references/chains.md**: Chain composition strategies
- **references/document-processing.md**: Document loading and indexing
- **references/callbacks.md**: Monitoring and observability
- **assets/agent-template.py**: Production-ready agent template
- **assets/memory-config.yaml**: Memory configuration examples
- **assets/chain-example.py**: Complex chain examples

## 常见陷阱

1. **记忆溢出**：未管理对话历史长度
2. **工具选择错误**：工具描述不佳导致代理混淆
3. **超出上下文窗口**：超过 LLM token 限制
4. **无错误处理**：未捕获和处理代理故障
5. **检索效率低**：未优化向量存储查询

## 生产检查清单

- [ ] 实现适当的错误处理
- [ ] 添加请求/响应日志记录
- [ ] 监控 token 使用量和成本
- [ ] 设置代理执行超时限制
- [ ] 实现速率限制
- [ ] 添加输入验证
- [ ] 测试边缘情况
- [ ] 设置可观测性（回调）
- [ ] 实现回退策略
- [ ] 版本控制提示和配置

## 限制
- 仅当任务明确匹配上述范围时使用此技能。
- 不要将输出视为特定环境验证、测试或专家审查的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
