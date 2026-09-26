# 多代理模式

## 验证清单（多代理）
设置多代理系统时使用此清单：
- [ ] **描述**：每个子代理是否都有清晰的 `description`？（LLM 用于路由或工具生成）
- [ ] **模型继承**：是否让子代理继承协调器的模型以避免重复？
- [ ] **循环终止**：如果使用 `LoopAgent`，是否有明确的 `exit_loop` 调用来防止无限循环？

## 快速参考
- **顺序执行**：`SequentialAgent(sub_agents=[a, b, c])`
- **并行执行**：`ParallelAgent(sub_agents=[a, b, c])`
- **循环**：`LoopAgent(sub_agents=[a, b], max_iterations=5)`

## 基于 LLM 的多代理（聊天转移）

```python
from google.adk.agents.llm_agent import Agent

researcher = Agent(
    name='researcher',
    description='研究主题。',
    instruction='你研究主题并提供发现。',
    tools=[search_tool],
)

writer = Agent(
    name='writer',
    description='撰写内容。',
    instruction='你根据研究撰写内容。',
)

root_agent = Agent(
    model='gemini-2.5-flash',
    name='coordinator',
    instruction=(
        '将研究委托给 researcher，'
        '将写作委托给 writer。'
    ),
    sub_agents=[researcher, writer],
)
```

**关键规则：**
- 只有根代理需要 `model=`。子代理继承它。
- 每个子代理都需要 `description`（用于路由）。
- 代理之间的转移通过 LLM 推理自动进行。
- `disallow_transfer_to_parent=True` 防止向父代理回传。
- `disallow_transfer_to_peers=True` 防止同级转移。

## 基于任务的多代理（结构化委托）

对于结构化输入/输出，使用任务模式而非聊天转移。完整细节参见 **`task-mode.md`**。

```python
from google.adk import Agent

worker = Agent(
    name='worker',
    mode='task',                     # 或 'single_turn'
    input_schema=WorkerInput,
    output_schema=WorkerOutput,
    instruction='执行工作，然后调用 finish_task。',
    description='执行结构化工作。',
)

root_agent = Agent(
    name='coordinator',
    model='gemini-2.5-flash',
    sub_agents=[worker],
    instruction='通过 request_task_worker 委托给 worker。',
)
```

## 非 LLM 编排代理

### SequentialAgent

按顺序依次运行子代理：

```python
from google.adk.agents.sequential_agent import SequentialAgent

root_agent = SequentialAgent(
    name='pipeline',
    sub_agents=[step1_agent, step2_agent, step3_agent],
)
```

### ParallelAgent

并发运行子代理：

```python
from google.adk.agents.parallel_agent import ParallelAgent

root_agent = ParallelAgent(
    name='fan_out',
    sub_agents=[task_a, task_b, task_c],
)
```

### LoopAgent

重复运行子代理，直到调用 `exit_loop`：

```python
from google.adk.tools import exit_loop
from google.adk.agents.loop_agent import LoopAgent

looping_agent = Agent(
    name='checker',
    tools=[exit_loop],
    instruction='检查结果，如果完成则调用 exit_loop。',
)

root_agent = LoopAgent(
    name='retry_loop',
    sub_agents=[worker_agent, looping_agent],
    max_iterations=5,
)
```

## 模型配置

- 默认模型：`gemini-2.5-flash`
- 全局覆盖：`Agent.set_default_model('gemini-2.5-pro')`
- 模型继承：如果未设置，子代理继承父代理的模型
- 非 Gemini 模型通过 LiteLlm：
  ```python
  from google.adk.models.lite_llm import LiteLlm
  root_agent = Agent(model=LiteLlm(model='anthropic/claude-sonnet-4-20250514'), ...)
  ```

## 常见陷阱

- **代理卡在子代理中：** 子代理没有返回父代理的路径。
  设置 `disallow_transfer_to_parent=False`（默认值）或添加明确的转移指令。
- **错误的代理处理请求：** `description` 字段含糊。使每个代理的描述清晰区分其职责范围。
- **循环导入：** 在单个 `agent.py` 文件中定义所有代理，或使用共享模块存放子代理。
