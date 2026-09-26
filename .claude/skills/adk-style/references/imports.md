# 导入风格指南

## 通用规则

- **源代码**（`src/`）：使用相对导入。
  `from ..agents.llm_agent import LlmAgent`
- **测试**（`tests/`）：使用绝对导入。
  `from google.adk.agents.llm_agent import LlmAgent`
- **从模块导入**：从模块文件导入，而非从 `__init__.py`。
  `from ..agents.llm_agent import LlmAgent`（而非 `from ..agents import LlmAgent`）
- **CLI 包**（`cli/`）：
  - 视为外部包。
  - 对 `cli/` 包内的文件使用**相对导入**。
  - 对 `cli/` 包外的文件使用**绝对导入**。
  - **依赖方向**：只有 `cli/` 可以从代码库的其余部分导入。代码库的其余部分必须**严格不**从 `cli/` 导入。

## TYPE_CHECKING 导入

使用 `TYPE_CHECKING` 导入仅由类型提示需要的导入，以避免运行时的循环导入：

```python
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..agents.invocation_context import InvocationContext
```

这样做是因为 `from __future__ import annotations` 将所有注解设为字符串（延迟求值），因此在运行时永远不需要该导入。
