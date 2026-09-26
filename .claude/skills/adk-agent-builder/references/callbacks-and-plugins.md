# 回调与插件

## 验证清单（回调）
实现回调或插件时使用此清单：
- [ ] **覆盖行为**：记住，在回调中返回非 `None` 值会**覆盖**默认行为（例如跳过模型调用或工具执行）。这是否是故意的？
- [ ] **上下文类型**：记住 `CallbackContext` 是 `Context` 的别名。

## 快速参考（回调返回值）
- **继续正常流程**：返回 `None`。
- **覆盖模型**：在 `before_model` 中返回 `LlmResponse`。
- **覆盖工具**：在 `before_tool` 中返回 `dict`。

## 代理回调

```python
root_agent = Agent(
    before_agent_callback=my_before_cb,      # 代理运行前
    after_agent_callback=my_after_cb,         # 代理运行后
    before_model_callback=my_before_model,    # LLM 调用前
    after_model_callback=my_after_model,      # LLM 调用后
    before_tool_callback=my_before_tool,      # 工具调用前
    after_tool_callback=my_after_tool,        # 工具调用后
    on_model_error_callback=my_error_cb,      # LLM 出错时
    on_tool_error_callback=my_tool_error_cb,  # 工具出错时
    ...
)
```

**注意：** `CallbackContext` 是 `Context` 的向后兼容别名。两者行为完全相同。

## 回调签名

```python
# before_agent / after_agent
def callback(callback_context: CallbackContext):
  return None  # 继续正常流程
  # 或返回 ModelContent 以覆盖

# before_model
def callback(callback_context, llm_request: LlmRequest):
  return None  # 继续 LLM 调用
  # 或返回 LlmResponse 以跳过 LLM

# after_model
def callback(callback_context, llm_response):
  return None  # 使用实际响应
  # 或返回 LlmResponse 以覆盖

# before_tool
def callback(tool, args, tool_context):
  return None  # 正常调用工具
  # 或返回 dict 以跳过工具

# after_tool
def callback(tool, args, tool_context, tool_response):
  return None  # 使用实际响应
  # 或返回 dict 以覆盖
```

**多个回调：** 传递一个列表。它们按顺序执行，直到有一个返回非 None 值。

## 插件（应用级回调）

```python
from google.adk.plugins.base_plugin import BasePlugin

class MyPlugin(BasePlugin):
  def __init__(self):
    super().__init__(name='my_plugin')

  async def before_agent_callback(self, *, agent, callback_context):
    pass

  async def before_model_callback(self, *, callback_context, llm_request):
    pass
```

## 内置插件

| 插件 | 导入 | 用途 |
|--------|--------|---------|
| `ContextFilterPlugin` | `from google.adk.plugins.context_filter_plugin import ContextFilterPlugin` | 限制上下文中的历史记录 |
| `SaveFilesAsArtifactsPlugin` | `from google.adk.plugins.save_files_as_artifacts_plugin import SaveFilesAsArtifactsPlugin` | 自动保存文件输出 |
| `GlobalInstructionPlugin` | `from google.adk.plugins.global_instruction_plugin import GlobalInstructionPlugin` | 注入全局指令 |

应用中使用方式：

```python
from google.adk.apps import App
from google.adk.plugins.context_filter_plugin import ContextFilterPlugin

app = App(
    name='my_app',
    root_agent=root_agent,
    plugins=[ContextFilterPlugin(num_invocations_to_keep=3)],
)
```
