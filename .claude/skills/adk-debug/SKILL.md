---
name: adk-debug
description: 在调试 ADK 代理、检查会话、测试代理行为、排查工具调用、事件流问题或诊断 LLM/模型问题时使用。
---

# 调试 ADK 代理

两种调试模式：`adk web`（浏览器 UI + API）和 `adk run`（CLI）。

> [!NOTE]
> **偏好**：对大多数开发和调试任务，优先使用 `adk run`（CLI），因为它更快更便捷。**在 `adk run` 中，query 模式优先于交互模式**，因为它需要更少的人工干预。不过，对 UI 专属问题、会话管理可视化或调试 API 服务器本身，仍需使用 `adk web`。


---

## 模式 1：adk web（浏览器 UI + REST API）

最适合：可视化检查、会话管理、多轮测试。

### 开发服务器工作流

启动服务器之前，询问用户：
1. **是否已有运行中的 `adk web` 服务器？** 如果有，直接使用
   （用 `curl -s http://localhost:8000/health` 检查）。
2. **如果没有**，启动一个。使用 `run_in_background` 以免阻塞。**记得在调试完成后关闭它。**

```bash
# 检查服务器是否已在运行
curl -s http://localhost:8000/health

# 启动服务器（如果尚未运行）
adk web path/to/agents_dir                    # 默认：http://localhost:8000
adk web -v path/to/agents_dir                 # 详细日志（DEBUG 级别）
adk web --reload_agents path/to/agents_dir    # 文件变更时自动重载

# 完成后关闭（如果是你启动的）
# 杀掉后台进程或按 Ctrl+C
```

> [!TIP]
> **对编码代理友好的设置**：为了让编码代理能读取服务器日志，建议用户启动服务器并把输出重定向到代理可读取位置的某个文件（例如对话的工件目录或共享工作区文件夹）：
> ```bash
> adk web -v path/to/agents_dir 2>&1 | tee path/to/agent_readable_log.log
> ```
> 这确保用户和代理都能检查完整的调试日志。

Web 界面：`http://localhost:8000/dev-ui/`

### 通过 curl 检查会话

```bash
# 列出会话
curl -s http://localhost:8000/apps/{app_name}/users/{user_id}/sessions | python3 -m json.tool

# 获取包含事件的完整会话
curl -s http://localhost:8000/apps/{app_name}/users/{user_id}/sessions/{session_id} | python3 -m json.tool
```

调试后**不要**删除会话 —— 用户可能想在 Web 界面中检查它们。

### 摘要事件

拉取会话 JSON 并编写 Python 脚本汇总它。**不要**使用硬编码的内联脚本 —— JSON schema 可能变化。而是先拉取原始 JSON：

```bash
curl -s http://localhost:8000/apps/{app_name}/users/{user_id}/sessions/{session_id} | python3 -m json.tool
```

然后根据你看到的实际结构编写脚本。每个事件中要查找的关键字段：`author`、`branch`、`content.parts`（text、functionCall、functionResponse）、`output`、`actions`（transferToAgent、requestTask、finishTask）、`nodeInfo.path`。

### 通过 curl 发送测试消息

```bash
SESSION=$(curl -s -X POST http://localhost:8000/apps/{app_name}/users/test/sessions \
  -H "Content-Type: application/json" -d '{}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

curl -N -X POST http://localhost:8000/run_sse \
  -H "Content-Type: application/json" \
  -d "{\"app_name\":\"{app_name}\",\"user_id\":\"test\",\"session_id\":\"$SESSION\",
       \"new_message\":{\"role\":\"user\",\"parts\":[{\"text\":\"在这里写你的消息\"}]},
       \"streaming\":false}"
```

### 调试端点（trace）

```bash
# 某个特定事件的 trace
curl -s http://localhost:8000/debug/trace/{event_id} | python3 -m json.tool

# 某个会话的所有 trace
curl -s http://localhost:8000/debug/trace/session/{session_id} | python3 -m json.tool

# 健康检查
curl -s http://localhost:8000/health
```

### 提取 LLM 内容历史

拉取 trace 数据并检查 `call_llm` span。LLM 请求/响应保存在 span 属性中：

```bash
curl -s http://localhost:8000/debug/trace/session/{session_id} | python3 -m json.tool
```

查找 `name: "call_llm"` 的 span，并检查其 `attributes.gcp.vertex.agent.llm_request`（完整请求的 JSON 字符串，包含 `contents`、`config`、`model`）。

### 关键 span 属性

| 属性 | 描述 |
|-----------|-------------|
| `gcp.vertex.agent.llm_request` | 完整 LLM 请求 JSON（contents、config、model） |
| `gcp.vertex.agent.llm_response` | 完整 LLM 响应 JSON |
| `gcp.vertex.agent.event_id` | 事件 ID —— 与会话事件关联 |
| `gen_ai.request.model` | 模型名称 |
| `gen_ai.usage.input_tokens` | 输入 token 数 |
| `gen_ai.usage.output_tokens` | 输出 token 数 |
| `gen_ai.response.finish_reasons` | 停止原因 |

---

## 模式 2：adk run（CLI）

最适合：快速测试、脚本编写、CI/CD、无头调试。

### 交互式运行

```bash
adk run path/to/my_agent                      # 交互式提示
adk run -v path/to/my_agent                   # 详细日志
```

### 带 query 运行（自动化）

```bash
adk run path/to/my_agent "query"              # 带查询运行
adk run --jsonl path/to/my_agent "query"      # 输出结构化 JSONL（减少噪声）
```

### 何时使用自动化 query 模式

- **快速轻量**：无需启动 `adk web` 开发服务器即可快速运行测试。
- **易于自动化**：非常适合 CI/CD 流水线和回归脚本。
- **高度可组合**：可把 `--jsonl` 输出管道给 `jq`、`grep` 或 `diff` 等标准工具。
- **并行执行**：每次运行是隔离进程。可并发运行多个测试而不会有端口冲突。
- **状态隔离**：使用 `--in_memory` 进行快速、无副作用的测试（不更新数据库）。
- **多轮支持**：若需跨轮次保持会话状态，记得设置 session ID。

> [!TIP]
> 请先阅读样例的 `README.md`，以理解预期输入和行为！

### 单元测试与样例代理（何时用哪个）

选择正确的测试策略对效率和覆盖度至关重要：

- **在以下情况使用单元测试**：
  - 测试**孤立逻辑**、特定方法或单个组件的边界情况。
  - 验证**数据 schema**、Pydantic 校验或工具函数。
  - *位置*：`tests/unittests/`。

- **在以下情况使用样例代理（集成测试）**：
  - 开发具有**多层级集成**（Runner + Agent + Workflow）的功能或影响面广的变更。
  - 测试**人在环中（HITL）**或长时间运行工具等复杂场景。
  - 需要在模拟环境中验证代理的**真实行为**。
  - *位置*：在 `contributing/agent_samples/` 下创建样例（参见 `adk-sample-creator`）。

> [!IMPORTANT]
> **AI 助手提醒**：如果你为测试创建了临时样例代理，验证完成后你**必须删除它**，除非用户明确要求保留。

### 退出码与详情

- **退出码 0**：成功。
- **退出码 1**：错误（例如缺少 API 密钥、代理加载失败）。
- **退出码 2**：暂停（Workflow 正在等待人工输入/HITL）。

更多选项和标志，请运行：
```bash
adk run --help
```

### 事件打印工具

```python
from google.adk.utils._debug_output import print_event

print_event(event, verbose=False)  # 仅文本响应
print_event(event, verbose=True)   # 工具调用、代码执行、内联数据
```

位置：`src/google/adk/utils/_debug_output.py`

### 编程式调试

```python
from google.adk import Agent, Runner
from google.adk.sessions import InMemorySessionService

agent = Agent(name="test", model="gemini-2.5-flash", instruction="...")
runner = Runner(app_name="test", agent=agent, session_service=InMemorySessionService())

session = runner.session_service.create_session_sync(app_name="test", user_id="u")
for event in runner.run(user_id="u", session_id=session.id, new_message="hello"):
    print(f"{event.author}: {event.content}")
    if event.actions.transfer_to_agent:
        print(f"  -> transfer to {event.actions.transfer_to_agent}")
    if event.output:
        print(f"  -> output: {event.output}")
```

---

## 日志

两种模式共用。

用 `--log_level`（DEBUG、INFO、WARNING、ERROR、CRITICAL）或 `-v` 设置日志级别（`-v` 即 DEBUG）。
日志写入 `/tmp/agents_log/`。跟踪最新：`tail -F /tmp/agents_log/agent.latest.log`
Logger 名称：`google_adk`。设置：`src/google/adk/cli/utils/logs.py`

| 环境变量 | 作用 |
|---|---|
| `ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS` | 在 trace 中包含 prompt/response（默认：`true`） |
| `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` | 在 OTEL span 中捕获 prompt/response |
| `GOOGLE_CLOUD_PROJECT` | `--trace_to_cloud` 所需 |

---

## 常见问题

### 1. 代理输出裸 JSON 而不调用工具

**症状：** 带 `output_schema` 的代理输出 JSON 文本而非调用工具。
**原因：** `output_schema` 在 LLM 配置上设置了 `response_schema`，激活受控生成（仅 JSON 模式）。
**检查：** 在 LLM 请求中查找 `response_mime_type: "application/json"`。
**位置：** `src/google/adk/flows/llm_flows/basic.py`

### 2. 事件在会话中缺失 / 插件不可见

**症状：** 子代理的事件不出现在插件回调或 runner 事件流中。
**原因：** 组件内直接调用 `append_event` 绕过了 runner 的事件循环。
**检查：** 只有 runner（`runners.py`）应调用 `append_event`。组件应产出事件。

### 3. 运行时出现 `NameError: name 'X' is not defined`

**症状：** `{"error": "name 'SomeClass' is not defined"}`
**原因：** 类在 `TYPE_CHECKING` 下导入却在运行时使用（例如 `isinstance()`）。
**修复：** 把导入移出 `TYPE_CHECKING`，或使用局部导入。

### 4. 子代理没有父对话的上下文

**症状：** 子代理只看到自己的输入，看不到父级历史。
**原因：** 分支隔离 —— 分支上的子代理只能看到该分支上的事件。
**修复：** 编写子代理的 `description`，促使父级在委派输入中包含上下文。

### 5. 启动时代理校验错误

**症状：** 构造代理时报 `ValueError`。
**常见原因：**
- `"All tools must be set via LlmAgent.tools."` —— 不要通过 `generate_content_config` 传递工具
- `"System instruction must be set via LlmAgent.instruction."` —— 不要通过 `generate_content_config` 设置
- `"Response schema must be set via LlmAgent.output_schema."` —— 不要通过 `generate_content_config` 设置
**位置：** `src/google/adk/agents/llm_agent.py` —— `validate_generate_content_config`

### 6. LLM 调用超出上限

**症状：** `LlmCallsLimitExceededError: Max number of llm calls limit of N exceeded`
**原因：** 达到 `run_config.max_llm_calls` 上限。
**修复：** 提高 `RunConfig` 中的 `max_llm_calls`，或排查代理为何循环。
**位置：** `src/google/adk/agents/invocation_context.py`

### 7. 工具错误被静默吞掉

**症状：** 工具调用失败，但代理在没有预期结果的情况下继续。
**原因：** 错误被捕获并以函数响应文本的形式返回。设置 `on_tool_error_callback` 可自定义。
**检查：** 在函数响应事件中查找错误文本。

### 8. 代理未加载 / 未被发现

**症状：** `adk web` 未列出该代理，或返回 404。
**原因：** 代理目录必须遵循约定：
```
my_agent/
  __init__.py   # 必须包含：from . import agent
  agent.py      # 必须定义：root_agent = Agent(...) 或 app = App(...)
```

### 9. 同步工具阻塞事件循环

**症状：** 代理卡住或变得非常慢。
**原因：** 同步工具在线程池中运行（最多 4 个工作线程）。所有工作线程都忙 → 新工具调用阻塞。
**修复：** 若工具做 I/O，改为异步。

---

## LLM 停止原因

- `STOP` —— 正常完成
- `MAX_TOKENS` —— 输出被截断（提高 `max_output_tokens`）
- `SAFETY` —— 被安全过滤器拦截
- `RECITATION` —— 因复述被拦截

---

## 事件流架构

```
用户消息
  -> Runner.run_async()
    -> Runner._exec_with_plugin()        # 持久化事件，运行插件
      -> agent.run_async()               # 产出事件
        -> LlmAgent._run_async_impl()
          -> BaseLlmFlow.run_async()       # 执行流程
            -> _AutoFlow or _SingleFlow   # 流程实现
              -> call_llm               # LLM 请求 + 响应
              -> execute_tools          # 工具分发（functions.py）
```

---

## 回调链

**模型调用前：** PluginManager `run_before_model_callback()` → agent `canonical_before_model_callbacks`
**模型调用后：** PluginManager `run_after_model_callback()` → agent `canonical_after_model_callbacks`
**工具调用前/后：** PluginManager `run_before_tool_callback()` / `run_after_tool_callback()` → 代理回调

---

## 调试关键文件

| 领域 | 文件 |
|---|---|
| Runner 事件循环 | `src/google/adk/runners.py` |
| LLM 请求构建 | `src/google/adk/flows/llm_flows/basic.py` |
| 工具分发 | `src/google/adk/flows/llm_flows/functions.py` |
| 多代理编排 | `src/google/adk/workflow/` |
| Content/上下文构建 | `src/google/adk/flows/llm_flows/contents.py` |
| Task 支持 | `src/google/adk/agents/llm/task/` |
| 代理配置 + 校验 | `src/google/adk/agents/llm_agent.py` |
| 事件模型 | `src/google/adk/events/event.py` |
| 会话服务 | `src/google/adk/sessions/` |
| 调用上下文 | `src/google/adk/agents/invocation_context.py` |
| Web 服务器 + 调试端点 | `src/google/adk/cli/adk_web_server.py` |
| 调试输出打印器 | `src/google/adk/utils/_debug_output.py` |

---

## 调试检查清单

1. **从日志开始** —— `-v` 标志，检查 `/tmp/agents_log/agent.latest.log`
2. **检查会话** —— curl 端点（`adk web`）或打印事件（`adk run`）
3. **检查事件 actions** —— `transfer_to_agent`、`request_task`、`finish_task`、`escalate`
4. **检查 event.output** —— single_turn 和 task 代理在此设置输出
5. **检查 trace** —— 用 `/debug/trace/session/{id}` 查看模型/token 用量
6. **验证代理结构** —— `__init__.py` 导入、已定义 `root_agent` 或 `app`
7. **检查工具响应** —— 在函数响应事件中查找错误文本
8. **检查 LLM 停止原因** —— `STOP`、`MAX_TOKENS`、`SAFETY`
9. **隔离测试** —— 只带出问题的工具/配置创建最小代理
