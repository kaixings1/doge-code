---
description: 针对 PEP 8 合规性、类型提示、安全性和 Pythonic 风格的全面 Python 代码审查。调用 python-reviewer 智能体（Agent）。
---

# Python 代码审查 (Python Code Review)

此命令调用 **python-reviewer** 智能体（Agent）进行针对 Python 特性的全面代码审查。

## 此命令的作用

1. **识别 Python 变更**：通过 `git diff` 查找已修改的 `.py` 文件
2. **运行静态分析**：执行 `ruff`、`mypy`、`pylint`、`black --check`
3. **安全扫描**：检查 SQL 注入、命令注入、不安全的反序列化
4. **类型安全审查**：分析类型提示（Type Hints）和 mypy 错误
5. **Pythonic 代码检查**：验证代码是否遵循 PEP 8 和 Python 最佳实践
6. **生成报告**：按严重程度对问题进行分类

## 何时使用

在以下情况下使用 `/python-review`：
- 编写或修改 Python 代码后
- 提交 Python 变更前
- 审查包含 Python 代码的拉取请求（Pull Request）
- 接入新的 Python 代码库时
- 学习 Pythonic 模式和惯用法时

## 审查类别

### 严重 (CRITICAL - 必须修复)
- SQL/命令注入漏洞
- 不安全的 eval/exec 使用
- Pickle 不安全反序列化
- 硬编码凭据
- YAML 不安全加载 (unsafe load)
- 隐藏错误的空 except 子句

### 高 (HIGH - 应该修复)
- 公开函数缺少类型提示
- 可变默认参数 (Mutable default arguments)
- 静默吞掉异常
- 未对资源使用上下文管理器 (Context Managers)
- 使用 C 风格循环而非推导式 (Comprehensions)
- 使用 type() 而非 isinstance()
- 缺少锁的情况下的竞态条件

### 中 (MEDIUM - 建议考虑)
- 违反 PEP 8 格式规范
- 公开函数缺少文档字符串 (Docstrings)
- 使用 print 语句而非日志记录 (Logging)
- 低效的字符串操作
- 缺少命名的魔法数字 (Magic numbers)
- 未使用 f-strings 进行格式化
- 不必要的列表创建

## 运行的自动化检查

```bash
# 类型检查
mypy .

# Lint 检查与格式化
ruff check .
black --check .
isort --check-only .

# 安全扫描
bandit -r .

# 依赖审计
pip-audit
safety check

# 测试
pytest --cov=app --cov-report=term-missing
```

## 使用示例

```text
User: /python-review

Agent:
# Python 代码审查报告 (Python Code Review Report)

## 已审查文件
- app/routes/user.py (已修改)
- app/services/auth.py (已修改)

## 静态分析结果
✓ ruff: 无问题
✓ mypy: 无错误
⚠️ black: 2 个文件需要重新格式化
✓ bandit: 无安全问题

## 发现的问题

[CRITICAL] SQL 注入漏洞
文件: app/routes/user.py:42
问题: 用户输入直接插值到 SQL 查询中
```python
query = f"SELECT * FROM users WHERE id = {user_id}"  # 错误做法 (Bad)
```
修复: 使用参数化查询
```python
query = "SELECT * FROM users WHERE id = %s"  # 正确做法 (Good)
cursor.execute(query, (user_id,))
```

[HIGH] 可变默认参数 (Mutable default argument)
文件: app/services/auth.py:18
问题: 可变默认参数导致状态共享
```python
def process_items(items=[]):  # 错误做法 (Bad)
    items.append("new")
    return items
```
修复: 使用 None 作为默认值
```python
def process_items(items=None):  # 正确做法 (Good)
    if items is None:
        items = []
    items.append("new")
    return items
```

[MEDIUM] 缺少类型提示
文件: app/services/auth.py:25
问题: 公开函数缺少类型注解
```python
def get_user(user_id):  # 错误做法 (Bad)
    return db.find(user_id)
```
修复: 添加类型提示
```python
def get_user(user_id: str) -> Optional[User]:  # 正确做法 (Good)
    return db.find(user_id)
```

[MEDIUM] 未使用上下文管理器
文件: app/routes/user.py:55
问题: 异常发生时文件未关闭
```python
f = open("config.json")  # 错误做法 (Bad)
data = f.read()
f.close()
```
修复: 使用上下文管理器
```python
with open("config.json") as f:  # 正确做法 (Good)
    data = f.read()
```

## 摘要
- 严重 (CRITICAL): 1
- 高 (HIGH): 1
- 中 (MEDIUM): 2

建议: ❌ 在修复 CRITICAL 问题之前禁止合并 (Block merge)

## 需要格式化
运行: `black app/routes/user.py app/services/auth.py`
```

## 批准标准

| 状态 | 条件 |
|--------|-----------|
| ✅ 批准 (Approve) | 无 CRITICAL 或 HIGH 问题 |
| ⚠️ 警告 (Warning) | 仅存在 MEDIUM 问题（请谨慎合并） |
| ❌ 拒绝 (Block) | 发现 CRITICAL 或 HIGH 问题 |

## 与其他命令的集成

- 先使用 `/tdd` 以确保测试通过
- 对于非 Python 特有的问题，使用 `/code-review`
- 在提交前使用 `/python-review`
- 如果静态分析工具失败，使用 `/build-fix`

## 框架特定审查

### Django 项目
审查项包括：
- N+1 查询问题（使用 `select_related` 和 `prefetch_related`）
- 模型变更缺少迁移文件 (Migrations)
- 在 ORM 可行的情况下使用原始 SQL
- 多步操作缺少 `transaction.atomic()`

### FastAPI 项目
审查项包括：
- CORS 配置错误
- 使用 Pydantic 模型进行请求验证
- 响应模型 (Response models) 的正确性
- 正确使用 async/await
- 依赖注入 (Dependency injection) 模式

### Flask 项目
审查项包括：
- 上下文管理（应用上下文、请求上下文）
- 正确的错误处理
- 蓝图 (Blueprint) 组织结构
- 配置管理

## 相关链接

- 智能体 (Agent): `agents/python-reviewer.md`
- 技能 (Skills): `skills/python-patterns/`, `skills/python-testing/`

## 常见修复方法

### 添加类型提示
```python
# 修改前
def calculate(x, y):
    return x + y

# 修改后
from typing import Union

def calculate(x: Union[int, float], y: Union[int, float]) -> Union[int, float]:
    return x + y
```

### 使用上下文管理器
```python
# 修改前
f = open("file.txt")
data = f.read()
f.close()

# 修改后
with open("file.txt") as f:
    data = f.read()
```

### 使用列表推导式
```python
# 修改前
result = []
for item in items:
    if item.active:
        result.append(item.name)

# 修改后
result = [item.name for item in items if item.active]
```

### 修复可变默认值
```python
# 修改前
def append(value, items=[]):
    items.append(value)
    return items

# 修改后
def append(value, items=None):
    if items is None:
        items = []
    items.append(value)
    return items
```

### 使用 f-strings (Python 3.6+)
```python
# 修改前
name = "Alice"
greeting = "Hello, " + name + "!"
greeting2 = "Hello, {}".format(name)

# 修改后
greeting = f"Hello, {name}!"
```

### 修复循环中的字符串拼接
```python
# 修改前
result = ""
for item in items:
    result += str(item)

# 修改后
result = "".join(str(item) for item in items)
```

## Python 版本兼容性

审查器会标注代码何时使用了较新 Python 版本的特性：

| 特性 | 最低 Python 版本 |
|---------|----------------|
| 类型提示 (Type hints) | 3.5+ |
| f-strings | 3.6+ |
| 海象运算符 (`:=`) | 3.8+ |
| 仅限位置参数 (Position-only parameters) | 3.8+ |
| Match 语句 | 3.10+ |
| 类型联合 (&#96;x &#124; None&#96;) | 3.10+ |

请确保项目的 `pyproject.toml` 或 `setup.py` 指定了正确的最低 Python 版本。
