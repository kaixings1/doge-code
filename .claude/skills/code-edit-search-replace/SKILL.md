---
name: code-edit-search-replace
description: "SEARCH/REPLACE块格式代码编辑指南。当需要修改代码文件时使用此技能，指导AI使用精确的搜索/替换块格式进行代码编辑，确保修改准确、可追溯。适用于代码重构、bug修复、功能添加等场景。"
---

# SEARCH/REPLACE 代码编辑指南

## 核心规则

每次代码修改必须使用 **SEARCH/REPLACE 块**格式。这是唯一可接受的代码修改输出方式。

## SEARCH/REPLACE 块格式

每个块的结构如下：

```text
<完整文件路径>
```<语言>
<<<<<<< SEARCH
<需要搜索的现有代码块>
=======
<替换后的新代码块>
>>>>>>> REPLACE
```
```

## 格式要求

1. **完整文件路径**：单独一行，不加重音符号、不加引号、不转义字符
2. **语言标识**：紧跟在文件路径后的代码块语言标记（如 `python`、`javascript`、`rust`）
3. **SEARCH 部分**：必须与现有文件内容**逐字符完全匹配**，包括注释、docstring、空行、缩进
4. **REPLACE 部分**：替换后的新代码
5. **分隔线**：`=======` 分隔搜索和替换部分
6. **边界标记**：`<<<<<<< SEARCH` 开始，`>>>>>>> REPLACE` 结束

## 编写原则

- **精确匹配**：SEARCH 部分必须能唯一定位到文件中的目标代码
- **最小化**：只包含需要修改的行和少量上下文，不要包含大片未修改代码
- **完整性**：确保每个 SEARCH/REPLACE 块自包含，可独立应用
- **顺序无关**：多个块可以按任意顺序给出，应用工具会依次处理
- **首次匹配**：SEARCH/REPLACE 块只替换第一次出现的位置

## 常用操作模式

### 添加代码到新文件

使用空 SEARCH 部分：

```text
<新文件路径>
```<语言>
<<<<<<< SEARCH
=======
<新文件内容>
>>>>>>> REPLACE
```
```

### 删除代码

REPLACE 部分留空：

```text
<文件路径>
```<语言>
<<<<<<< SEARCH
<要删除的代码>
=======
>>>>>>> REPLACE
```
```

### 移动代码

使用两个 SEARCH/REPLACE 块：
- 第一个：在原始位置删除代码
- 第二个：在目标位置插入代码

### 创建新文件（含目录）

```text
<包含目录的文件路径>
```<语言>
<<<<<<< SEARCH
=======
<新文件内容>
>>>>>>> REPLACE
```
```

## 重要约束

- 只对用户已添加到对话中的文件创建 SEARCH/REPLACE 块
- 若需要编辑未在对话中的文件，必须先告知用户完整文件路径并请求添加
- 在提出多个编辑后，等待用户确认再继续
- 如果用户说 "ok" 或 "go ahead"，则对他们之前确认的修改生成 SEARCH/REPLACE 块
- 如果用户没有明确确认编辑已应用，应继续生成 SEARCH/REPLACE 块

## 最佳实践

1. **逐步思考**：先解释需要的变更（简短），再提供 SEARCH/REPLACE 块
2. **尊重约定**：遵循现有代码库的编码风格、命名约定和库选择
3. **保持简洁**：SEARCH 部分包含恰好足够的上下文以唯一匹配
4. **分批处理**：大修改拆分为多个小块的 SEARCH/REPLACE
5. **多文件协调**：如果需要修改多个文件，为每个文件提供独立的 SEARCH/REPLACE 块

## 单工具调用模式（来自 OpenManus）

当作为自主编程代理操作时，遵循每次只调用一个工具的模式：

```
1. 总是先包含对下一步的思考
2. 每次响应只包含一个工具调用/函数调用
3. 调用后等待环境响应，再继续讨论和命令
4. 如果需要执行两个命令，先提交第一个，收到响应后再提交第二个
5. 不支持交互式会话命令（如 python、vim），不要调用它们
```

此模式防止代理在单次响应中发送过多操作，确保每个动作都能被验证后再继续。

## Shell 命令提示

在代码修改完成后，可以建议相关的 shell 命令（用 `bash` 代码块）：

- 运行程序验证修改
- 运行测试
- 安装新依赖
- 文件系统操作（重命名、删除等）

每次建议不超过 1-3 个命令，每个命令占一行，使用项目根目录的相对路径。

## 示例

### 修改现有函数

```text
mathweb/flask/app.py
```python
<<<<<<< SEARCH
from flask import Flask
=======
import math
from flask import Flask
>>>>>>> REPLACE
```
```

### 重构提取函数

```text
main.py
```python
<<<<<<< SEARCH
def factorial(n):
    "compute factorial"
    if n == 0:
        return 1
    else:
        return n * factorial(n-1)
=======
from math_utils import factorial
>>>>>>> REPLACE
```
```

### 新增文件

```text
utils/math_utils.py
```python
<<<<<<< SEARCH
=======
def factorial(n):
    """Compute factorial recursively."""
    if n == 0:
        return 1
    return n * factorial(n - 1)
>>>>>>> REPLACE
```
```
