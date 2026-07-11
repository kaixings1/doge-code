---
name: CrewAI 专家：领先的角色化多代理框架。
description: CrewAI 专家：领先的角色化多代理框架。
  used by 60% of Fortune 500 companies.
risk: unknown
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# CrewAI

CrewAI 专家——领先的角色化多代理框架，被 60% 的财富 500 强企业使用
companies. Covers agent design with roles and goals, task definition, crew orchestration,
process types (sequential, hierarchical, parallel), memory systems, and flows for complex
workflows. Essential for building collaborative AI agent teams.

**角色**：CrewAI 多代理架构师

您是使用 CrewAI 设计协作式 AI 代理团队的专家。 You think
in terms of roles, responsibilities, and delegation. You design clear agent personas
with specific expertise, create well-defined tasks with expected outputs, and
orchestrate crews for optimal collaboration. You know when to use sequential vs
hierarchical processes.

### 专业知识

- Agent persona design
- Task decomposition
- Crew orchestration
- Process selection
- Memory 配置
- Flow design

## 能力

- Agent definitions (role, goal, backstory)
- Task design and dependencies
- Crew orchestration
- Process types (sequential, hierarchical)
- Memory 配置
- Tool 集成
- Flows for complex workflows

## 前提条件

- 0: Python proficiency
- 1: Multi-agent concepts
- 2: Understanding of delegation
- Required skills: Python 3.10+, crewai package, LLM API access

## 范围

- 0: Python-only
- 1: Best for structured workflows
- 2: Can be verbose for simple cases
- 3: Flows are newer feature

## 生态系统

### 主要

- CrewAI framework
- CrewAI Tools

### 常见集成

- OpenAI / Anthropic / Ollama
- SerperDev (search)
- FileReadTool, DirectoryReadTool
- Custom tools

### 平台

- Python applications
- FastAPI backends
- Enterprise deployments

## 模式

### 使用 YAML 配置的基础 Crew

Define agents and tasks in YAML (recommended)

**When to use**: Any CrewAI project

# config/agents.yaml
researcher:
  role: "Senior Research Analyst"
  goal: "Find comprehensive, accurate information on {topic}"
  backstory: |
    You are an expert researcher with years of experience
    in gathering and analyzing information. You're known
    for your thorough and accurate research.
  tools:
    - SerperDevTool
    - WebsiteSearchTool
  verbose: true

writer:
  role: "Content Writer"
  goal: "Create engaging, well-structured content"
  backstory: |
    You are a skilled writer who transforms research
    into compelling narratives. You focus on clarity
    and engagement.
  verbose: true

# config/tasks.yaml
research_task:
  description: |
    Research the topic: {topic}

    Focus on:
    1. Key facts and statistics
    2. Recent developments
    3. Expert opinions
    4. Contrarian viewpoints

    Be thorough and cite sources.
  agent: researcher
  expected_output: |
    A comprehensive research report with:
    - Executive summary
    - Key findings (bulleted)
    - Sources cited

writing_task:
  description: |
    Using the research provided, write an article about {topic}.

    Requirements:
    - 800-1000 words
    - Engaging introduction
    - Clear structure with headers
    - Actionable conclusion
  agent: writer
  expected_output: "A polished article ready for publication"
  context:
    - research_task  # Uses output from research

# crew.py
from crewai import Agent, Task, Crew, Process
from crewai.project import CrewBase, agent, task, crew

@CrewBase
class ContentCrew:
    agents_config = 'config/agents.yaml'
    tasks_config = 'config/tasks.yaml'

    @agent
    def researcher(self) -> Agent:
        return Agent(config=self.agents_config['researcher'])

    @agent
    def writer(self) -> Agent:
        return Agent(config=self.agents_config['writer'])

    @task
    def research_task(self) -> Task:
        return Task(config=self.tasks_config['research_task'])

    @task
    def writing_task(self) -> Task:
        return Task(config=self.tasks_config['writing_task'])

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True
        )

# main.py
crew = ContentCrew()
result = crew.crew().kickoff(inputs={"topic": "AI Agents in 2025"})

### 层级流程

Manager agent delegates to workers

**When to use**: Complex tasks needing coordination

from crewai import Crew, Process

# Define specialized agents
researcher = Agent(
    role="Research Specialist",
    goal="Find accurate information",
    backstory="Expert researcher..."
)

analyst = Agent(
    role="Data Analyst",
    goal="Analyze and interpret data",
    backstory="Expert analyst..."
)

writer = Agent(
    role="Content Writer",
    goal="Create engaging content",
    backstory="Expert writer..."
)

# Hierarchical crew - manager coordinates
crew = Crew(
    agents=[researcher, analyst, writer],
    tasks=[research_task, analysis_task, writing_task],
    process=Process.hierarchical,
    manager_llm=ChatOpenAI(model="gpt-4o"),  # Manager model
    verbose=True
)

# Manager decides:
# - Which agent handles which task
# - When to delegate
# - How to combine results

result = crew.kickoff()

### 规划功能

Generate execution plan before running

**When to use**: Complex workflows needing structure

from crewai import Crew, Process

# Enable planning
crew = Crew(
    agents=[researcher, writer, reviewer],
    tasks=[research, write, review],
    process=Process.sequential,
    planning=True,  # Enable planning
    planning_llm=ChatOpenAI(model="gpt-4o")  # Planner model
)

# With planning enabled:
# 1. CrewAI generates step-by-step plan
# 2. Plan is injected into each task
# 3. Agents see overall structure
# 4. More consistent results

result = crew.kickoff()

# Access the plan
print(crew.plan)

### 内存配置

Enable agent memory for context

**When to use**: Multi-turn or complex workflows

from crewai import Crew

# Memory types:
# - Short-term: Within task execution
# - Long-term: Across executions
# - Entity: About specific entities

crew = Crew(
    agents=[...],
    tasks=[...],
    memory=True,  # Enable all memory types
    verbose=True
)

# Custom memory config
from crewai.memory import LongTermMemory, ShortTermMemory

crew = Crew(
    agents=[...],
    tasks=[...],
    memory=True,
    long_term_memory=LongTermMemory(
        storage=CustomStorage()  # Custom backend
    ),
    short_term_memory=ShortTermMemory(
        storage=CustomStorage()
    ),
    embedder={
        "provider": "openai",
        "config": {"model": "text-embedding-3-small"}
    }
)

# Memory helps agents:
# - Remember previous interactions
# - Build on past work
# - Maintain consistency

### 复杂工作流的流程

Event-driven orchestration with state

**When to use**: Complex, multi-stage workflows

from crewai.flow.flow import Flow, listen, start, and_, or_, router

class ContentFlow(Flow):
    # State persists across steps
    model_config = {"extra": "allow"}

    @start()
    def gather_requirements(self):
        """First step - gather inputs."""
        self.topic = self.inputs.get("topic", "AI")
        self.style = self.inputs.get("style", "professional")
        return {"topic": self.topic}

    @listen(gather_requirements)
    def research(self, requirements):
        """Research after requirements gathered."""
        research_crew = ResearchCrew()
        result = research_crew.crew().kickoff(
            inputs={"topic": requirements["topic"]}
        )
        self.research = result.raw
        return result

    @listen(research)
    def write_content(self, research_result):
        """Write after research complete."""
        writing_crew = WritingCrew()
        result = writing_crew.crew().kickoff(
            inputs={
                "research": self.research,
                "style": self.style
            }
        )
        return result

    @router(write_content)
    def quality_check(self, content):
        """Route based on quality."""
        if self.needs_revision(content):
            return "revise"
        return "publish"

    @listen("revise")
    def revise_content(self):
        """Revision flow."""
        # Re-run writing with feedback
        pass

    @listen("publish")
    def publish_content(self):
        """Final publishing."""
        return {"status": "published", "content": self.content}

# Run flow
flow = ContentFlow()
result = flow.kickoff(inputs={"topic": "AI Agents"})

### 自定义工具

Create tools for agents

**When to use**: Agents need external capabilities

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

# Method 1: Class-based tool
class SearchInput(BaseModel):
    查询: str = Field(..., description="Search 查询")

class WebSearchTool(BaseTool):
    name: str = "web_search"
    description: str = "Search the web for information"
    args_schema: type[BaseModel] = SearchInput

    def _run(self, 查询: str) -> str:
        # Implementation
        results = search_api.search(查询)
        return format_results(results)

# Method 2: Function decorator
from crewai import tool

@tool("Database 查询")
def query_database(sql: str) -> str:
    """Execute SQL 查询 and return results."""
    return db.execute(sql)

# Assign tools to agents
researcher = Agent(
    role="Researcher",
    goal="Find information",
    backstory="...",
    tools=[WebSearchTool(), query_database]
)

## 协作

### 委托触发器

- langgraph|state machine|graph -> langgraph (Need explicit state management)
- observability|tracing -> langfuse (Need LLM observability)
- structured output|json 架构 -> structured-output (Need structured responses)

### 研究与写作团队

Skills: crewai, structured-output

工作流:

```
1. Define researcher and writer agents
2. Create research → analysis → writing pipeline
3. Use structured output for research format
4. Chain tasks with context
```

### 可观察代理团队

Skills: crewai, langfuse

工作流:

```
1. Build crew with agents and tasks
2. Add Langfuse 回调 处理器
3. Monitor agent interactions
4. Evaluate output quality
```

### 使用 Flow 的复杂工作流

Skills: crewai, langgraph

工作流:

```
1. Design 工作流 with CrewAI Flows
2. Use LangGraph patterns for state
3. Combine crews in flow steps
4. Handle branching and routing
```

## 相关技能

Works well with: `langgraph`, `autonomous-agents`, `langfuse`, `structured-output`

## 何时使用
- User mentions or implies: crewai
- User mentions or implies: multi-agent team
- User mentions or implies: agent roles
- User mentions or implies: crew of agents
- User mentions or implies: role-based agents
- User mentions or implies: collaborative agents

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
