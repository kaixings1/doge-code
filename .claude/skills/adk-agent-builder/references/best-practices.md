# ADK 工作流最佳实践

本文档概述使用 ADK 开发可靠且可维护工作流的关键最佳实践与规则。

## 📋 代理代码验证清单
在提交或最终确定变更之前，用此清单验证你的代码：
- [ ] **Schema**：所有输入/输出都使用 Pydantic `BaseModel` 类了吗？（不用裸 dict）
- [ ] **UI 输出**：用户可见消息使用 `Event(message=...)` 了吗？（不是 `output=`）
- [ ] **State 数据流**：数据是否存入 state 并通过 `{var}` 或参数名读取？
- [ ] **State 更新**：state 更新是否通过 `Event(state=...)` 完成？（避免直接修改 `ctx.state`）
- [ ] **输出**：每个节点的执行是否最多产出**一个** `event.output`？
- [ ] **语义**：同一函数内是否从未混用 `yield` 和 `return`？
- [ ] **指令**：代理指令中是否**未**使用 `{node_input}` 模板？
- [ ] **HITL**：循环中每次迭代的 `interrupt_id` 是否唯一？

## 最佳实践（必须遵循）

### 使用 Pydantic 模型，而非裸 Dict

**始终为函数节点输入、输出、LLM `output_schema` 和结构化数据定义 Pydantic `BaseModel` 类**。当结构已知时绝不使用 `dict[str, Any]`：

```python
# ❌ 错误：裸 dict
def lookup_flights(node_input: dict[str, Any]) -> dict[str, Any]:
  return {"flight_cost": 500, "details": "Economy"}

# ✅ 正确：带类型的 schema
class FlightInfo(BaseModel):
  flight_cost: int
  details: str

def lookup_flights(node_input: Itinerary) -> FlightInfo:
  return FlightInfo(flight_cost=500, details="Economy")
```

这适用于流经图的所有数据：节点输入、节点输出、JoinNode 结果、LLM 输出 schema 和 HITL 响应 schema。

### 为 Web UI 显示发出内容事件

`event.output` 是内部的 —— 只有 `event.content` 会在 ADK web UI 中渲染。对于用户可见输出，使用 `Event(message=...)`：

```python
def final_output(node_input: str):
  yield Event(message=node_input)  # message= 会在 web UI 中渲染
  yield Event(output=node_input)   # output= 把数据传给下游节点

# 仅含 state 的事件（无 output、无 message —— 只是更新状态的副作用）
def store_data(node_input: str):
  yield Event(state={"user_input": node_input})

> [!TIP]
> 函数节点可通过产出 `Event(message="chunk", partial=True)` 来流式输出用户可见消息。
```

LLM 代理会自动发出内容事件。对于产生面向用户结果的函数节点，需显式添加。

### 与 LLM 代理配合时优先使用基于 State 的数据流

通过 `Event(state={...})` 或 `output_key` 把数据存入 state，再通过指令模板 `{var}` 或函数参数名注入来读取。这比通过 `node_input` 传递数据更健壮，尤其是在多个分支需要同一数据的路由工作流中。

```python
# ✅ 基于 state：尽早存储，任意位置通过 {var} 或参数名读取
def process_input(node_input: str):
  yield Event(state={"topic": node_input})

writer = Agent(name="writer", instruction='写一篇关于 "{topic}" 的文章。', output_key="draft")
def send(draft: str):  # draft 从 ctx.state["draft"] 解析得到
  yield Event(message=draft)

# ❌ 脆弱：用 node_input 串数据在路由/循环处会断掉
```

### 通过 Event 设置 State，而非 ctx.state

写 state 时**优先用 `Event(state=...)` 而非 `ctx.state[key] = ...`**。基于事件的 state 会持久化到事件历史中，并可在不可恢复的 HITL 期间重放。直接修改 `ctx.state` 属于副作用，重放时可能丢失。

```python
# ✅ 推荐
def save(node_input: str):
  return Event(output=node_input, state={"user_request": node_input})

# ❌ 避免
def save(ctx: Context, node_input: str) -> str:
  ctx.state["user_request"] = node_input
  return node_input
```

### 每个节点一个输出事件

每次节点执行可产出多个事件，但**最多只有一个应带 `event.output`**。这适用于函数节点、LLM 代理（包括 `task` 和 `single_turn` 模式）以及嵌套工作流。多个输出事件会被静默合并为列表，从而改变下游 `node_input` 的类型并通常引发错误。同理，最多只有一个事件可带 `route` —— 多个路由事件会抛 `ValueError`。

```python
# ✅ 正确：一个输出事件，其他事件用于消息/状态
def my_node(node_input: str):
  yield Event(message="处理中...")      # 仅用于显示
  yield Event(state={"status": "done"})     # 仅更新状态
  yield Event(output="final result")        # 唯一的输出

# ❌ 错误：多个输出事件
def my_node(node_input: str):
  yield Event(output="first")   # 这些会被合并成 ["first", "second"]
  yield Event(output="second")  # 下游期望 str，却拿到 list → TypeError
```

### 不要混用 yield 和 return Event

函数要么是**生成器**（使用 `yield`），要么是**普通函数**（使用 `return`）。绝不混用 —— 在 Python 中，含 `yield` 的函数会变成生成器，任何 `return value` 都会被静默忽略：

```python
# ✅ 生成器：所有事件都用 yield
def my_node(node_input: str):
  yield Event(state={"key": "value"})
  yield Event(output="result")

# ✅ 普通函数：单个值/事件用 return
def my_node(node_input: str):
  return Event(output="result", state={"key": "value"})

# ✅ 普通函数：返回裸值（自动包装为 Event）
def my_node(node_input: str) -> str:
  return "result"

# ❌ 错误：混用 yield 和 return —— return 会被静默忽略
def my_node(node_input: str):
  yield Event(state={"key": "value"})
  return Event(output="result")  # 被忽略 —— Python 生成器语义
```

需要多个事件（state + output + message）时使用生成器（`yield`）。简单的单值输出使用普通函数（`return`）。

### 绝不在 LLM 代理指令中放入 node_input

`instruction` 中的 `{var}` 模板**仅**从 `ctx.state` 解析。`node_input` **不**可作为模板变量使用 —— 它会自动作为用户消息发送给 LLM。不要在指令中尝试引用它：

```python
# ❌ 错误：{node_input} 不在 state 中，会抛 KeyError
agent = Agent(
    name="summarizer",
    instruction="总结这段内容：{node_input}",
)

# ✅ 正确：node_input 已经作为用户消息发送，直接写指令即可
agent = Agent(
    name="summarizer",
    instruction="用一句话总结下面的文本。",
)

# ✅ 正确：需要写进指令的数据用 state
agent = Agent(
    name="writer",
    instruction='写一篇关于 "{topic}" 的文章。之前的反馈：{feedback?}',
    output_key="draft",
)
```

### Workflow 不能作为 LlmAgent 的子代理

`Workflow`、`SequentialAgent`、`LoopAgent` 和 `ParallelAgent` 不能作为 `LlmAgent` 的 `sub_agents` 添加。不支持向工作流代理进行代理转移。

### 工作流数据规则

- **`Event.output` 必须可 JSON 序列化。** FunctionNode 通过 `model_dump()` 自动转换 BaseModel 返回值。绝不要在 `Event.output` 中存储 `types.Content` 或其他不可序列化对象。
- **`output_key` 存储的是 dict，而非 BaseModel 实例。** 带 `output_schema` 的 LLM 代理会执行 `validate_schema()` → `model_dump()`，因此 `ctx.state[output_key]` 是普通 dict。
- **`ctx.state.get(key)` 返回 dict。** 需要类型化访问时使用 dict 访问（`data["field"]`）或重建（`MyModel(**data)`）。

## 人在环中（HITL）规则

### 循环中使用唯一的 interrupt_id

当节点在循环内请求输入（产出 `RequestInput`）时（例如审阅-修订循环），你**必须为每次迭代使用唯一的 `interrupt_id`**（例如 `review_{count}`）。

如果复用同一个 `interrupt_id`，基于事件的状态重建会把早前迭代的响应与当前迭代混淆，导致无限重启循环！

```python
# ✅ 正确：每次迭代使用唯一 ID
review_count = ctx.state.get('review_count', 0)
interrupt_id = f'review_{review_count}'
yield RequestInput(interrupt_id=interrupt_id, message="是否批准？")
```
