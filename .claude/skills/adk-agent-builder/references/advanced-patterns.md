# 高级工作流模式参考

嵌套工作流、动态节点、重试配置、自定义节点类型以及图构建。

## 📋 代理验证清单（高级模式）
实现复杂工作流时使用此清单：

- [ ] **校验**：你的图是否遵循全部 7 条校验规则？（例如无无条件循环）
- [ ] **自定义节点**：若创建自定义节点，是否重写了 `get_name()` 和 `run()`？
- [ ] **动态执行**：若使用 `run_node`，是否遵循了专门的 dynamic-nodes 参考中的规则？
- [ ] **等待状态**：若节点应保持 WAITING 状态直到产出输出，是否使用了 `wait_for_output=True`？

## 💡 快速参考

- **重试**：`RetryConfig(max_attempts=5, initial_delay=1.0)`
- **自定义节点字段**：`rerun_on_resume`、`wait_for_output`、`retry_config`、`timeout`

## 嵌套工作流

`Workflow` 既是代理又是节点。把一个工作流用在另一个里面：

```python
from google.adk.workflow import Workflow

# 内层工作流
inner = Workflow(
    name="inner_pipeline",
    edges=[
        ('START', step_a),
        (step_a, step_b),
    ],
)

# 外层工作流，把内层工作流当作节点使用
outer = Workflow(
    name="outer_pipeline",
    edges=[
        ('START', pre_process),
        (pre_process, inner),      # 嵌套工作流
        (inner, post_process),
    ],
)
```

内层工作流把前驱节点的输出作为其 START 输入接收，其终止输出则流向外部工作流中的下一个节点。

## 动态节点调度

使用 `ctx.run_node()` 在运行时调度节点。

详细规则、示例和最佳实践见专门的 [动态节点调度参考](dynamic-nodes.md)。

## 重试配置

为可能失败的节点配置自动重试：

```python
from google.adk.workflow import RetryConfig
from google.adk.workflow import FunctionNode

retry = RetryConfig(
    max_attempts=5,         # 最大尝试次数（默认 5）。0 或 1 表示不重试
    initial_delay=1.0,      # 首次重试前的等待秒数（默认 1.0）
    max_delay=60.0,         # 两次重试之间的最大秒数（默认 60.0）
    backoff_factor=2.0,     # 每次尝试的延迟倍数（默认 2.0）
    jitter=1.0,             # 随机抖动因子（默认 1.0，0.0 表示无抖动）
    exceptions=None,        # 需要重试的异常类型（None 表示全部）
)

node = FunctionNode(
    flaky_api_call,
    name="api_call",
    retry_config=retry,
)
```

### 重试延迟公式

```
delay = initial_delay * (backoff_factor ^ attempt)
delay = min(delay, max_delay)
delay = delay * (1 + random(0, jitter))
```

### 访问尝试次数

```python
def my_node(ctx: Context, node_input: str) -> str:
  # attempt_count 首次尝试为 1，重试时 ≥2
  if ctx.attempt_count > 1:
    print(f"重试第 {ctx.attempt_count} 次")
  return "result"
```

## 自定义节点类型

为自定义行为继承 `BaseNode`：

```python
from google.adk.workflow import BaseNode
from google.adk.events.event import Event
from google.adk.agents.context import Context
from pydantic import ConfigDict, Field
from typing import Any, AsyncGenerator
from typing_extensions import override

class BatchProcessorNode(BaseNode):
  """按批次处理条目。"""
  model_config = ConfigDict(arbitrary_types_allowed=True)

  name: str = Field(default="batch_processor")
  batch_size: int = Field(default=10)

  def __init__(self, *, name: str = "batch_processor", batch_size: int = 10):
    super().__init__()
    object.__setattr__(self, 'name', name)
    object.__setattr__(self, 'batch_size', batch_size)

  @override
  def get_name(self) -> str:
    return self.name

  @override
  async def run(
      self,
      *,
      ctx: Context,
      node_input: Any,
  ) -> AsyncGenerator[Any, None]:
    items = node_input if isinstance(node_input, list) else [node_input]
    results = []
    for i in range(0, len(items), self.batch_size):
      batch = items[i:i + self.batch_size]
      batch_result = await process_batch(batch)
      results.extend(batch_result)
    yield Event(output=results)
```

### BaseNode 字段

| 字段 | 默认值 | 描述 |
|-------|---------|-------------|
| `rerun_on_resume` | `False` | HITL 中断后是否重新运行 |
| `wait_for_output` | `False` | 节点保持 WAITING 状态直到产出输出（见下文） |
| `retry_config` | `None` | 失败时的重试配置 |
| `timeout` | `None` | 节点完成的最大秒数 |

### wait_for_output

当 `wait_for_output=True` 时，一个完成但未产出带输出 `Event` 的节点会进入 **WAITING** 状态而非 COMPLETED。下游节点**不会**被触发。该节点之后可被上游前驱节点重新触发。

`JoinNode` 内部就是这样工作的 —— 它为每个前驱运行一次，存储部分输入，只有当所有前驱都完成时才产出输出（触发下游）。`task` 模式下的 `LlmAgentWrapper` 也会自动设置 `wait_for_output=True`。

```python
from google.adk.workflow import BaseNode

class CollectorNode(BaseNode):
  wait_for_output: bool = True  # 保持 WAITING 状态，直到产出输出

  async def run(self, *, ctx, node_input):
    # 存储部分输入，暂时不产出输出
    collected = ctx.state.get("collected", [])
    collected.append(node_input)
    yield Event(state={"collected": collected})

    # 只有收集够了才产出输出
    if len(collected) >= 3:
      yield Event(output=collected)
      # 此时节点转为 COMPLETED 并触发下游
```

`wait_for_output=True` 为默认值的节点：

- `JoinNode`：`True`（等待所有前驱）
- `LlmAgentWrapper`（task 模式）：`True`（在 `model_post_init` 中设置）
- 所有其他节点：`False`

### 必需的方法

| 方法 | 描述 |
|--------|-------------|
| `get_name() -> str` | 返回节点名称 |
| `run(*, ctx, node_input) -> AsyncGenerator` | 执行节点，产出事件 |

## ToolNode

把 ADK 工具封装为工作流节点：

```python
from google.adk.workflow._tool_node import _ToolNode as ToolNode
from google.adk.tools.function_tool import FunctionTool

def search(query: str) -> str:
  """搜索信息。"""
  return f"查询结果：{query}"

tool = FunctionTool(search)
tool_node = ToolNode(tool, name="search_node")

agent = Workflow(
    name="with_tool",
    edges=[
        ('START', prepare_query),
        (prepare_query, tool_node),  # 输入必须是字典（工具参数）或 None
        (tool_node, process_results),
    ],
)
```

**重要**：ToolNode 的输入必须是工具参数字典或 None。

## AgentNode

把任何 `BaseAgent`（不只是 LlmAgent）封装为工作流节点：

```python
from google.adk.workflow._agent_node import AgentNode
from google.adk.agents.loop_agent import LoopAgent

loop = LoopAgent(
    name="refine_loop",
    sub_agents=[writer, reviewer],
    max_iterations=3,
)

loop_node = AgentNode(agent=loop, name="refinement")

agent = Workflow(
    name="with_loop",
    edges=[
        ('START', loop_node),
        (loop_node, final_step),
    ],
)
```

## 图校验规则

工作流图在构造时被校验。以下规则会被强制执行：

1. START 节点必须存在
2. START 节点不得有入边
3. 所有非 START 节点必须可达（在某个边中作为 `to_node` 出现）
4. 无重复节点名
5. 无重复边
6. 每个节点最多一个 `__DEFAULT__` 路由
7. 无无条件循环（循环必须至少有一条路由边）

## 边构造模式

```python
from google.adk.workflow import Edge
from google.adk.workflow._workflow_graph import WorkflowGraph

# 元组语法（最常用）
edges = [
    ('START', node_a),                    # 普通边
    (node_a, node_b, "route"),            # 带路由的边
    (node_a, (node_b, node_c)),           # 扇出
    ((node_b, node_c), join_node),        # 汇合
]

# 顺序简写（含 3 个以上元素的元组会创建链）
edges = [('START', node_a, node_b, node_c)]
# 等价于：[('START', node_a), (node_a, node_b), (node_b, node_c)]

# 路由映射（dict 语法）
edges = [
    (classifier, {"success": handler_a, "error": handler_b}),
]

# Edge 对象（显式写法）
edges = [
    Edge(START, node_a),
    Edge(node_a, node_b, route="success"),
]

# Edge.chain 辅助方法
edges = Edge.chain('START', node_a, node_b, node_c)
# 返回：[(START, node_a), (node_a, node_b), (node_b, node_c)]

# WorkflowGraph.from_edge_items
graph = WorkflowGraph.from_edge_items([
    ('START', node_a),
    (node_a, node_b),
])
agent = Workflow(name="my_workflow", graph=graph)
```

## 源文件位置

| 组件 | 文件 |
|-----------|------|
| Workflow | `src/google/adk/workflow/_workflow.py` |
| WorkflowGraph, Edge | `src/google/adk/workflow/_workflow_graph.py` |
| Context | `src/google/adk/agents/context.py` |
| FunctionNode | `src/google/adk/workflow/_function_node.py` |
| _LlmAgentWrapper | `src/google/adk/workflow/_llm_agent_wrapper.py` |
| AgentNode | `src/google/adk/workflow/_agent_node.py` |
| _ToolNode | `src/google/adk/workflow/_tool_node.py` |
| JoinNode | `src/google/adk/workflow/_join_node.py` |
| ParallelWorker | `src/google/adk/workflow/_parallel_worker.py` |
| BaseNode, START | `src/google/adk/workflow/_base_node.py` |
| @node 装饰器 | `src/google/adk/workflow/_node.py` |
| RetryConfig | `src/google/adk/workflow/_retry_config.py` |
| Event | `src/google/adk/events/event.py` |
| RequestInput | `src/google/adk/events/request_input.py` |
