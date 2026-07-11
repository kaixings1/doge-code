---
name: 持续改进、防错和标准化的指南。
description: "持续改进、防错和标准化的指南。"
risk: unknown
source: community
date_added: "2026-02-27"
---
# Kaizen：持续改进

## 概述

小改进，持续进行。设计时防错。遵循有效的方法。

## 何时使用

- 代码实现和重构
- 架构和设计决策
- 流程和工作流改进
- 错误处理和验证
- 编写任何代码或文档时

## 四大支柱

### 1. 持续改进（Kaizen）

- 小步迭代，避免一次性大改动
- 每次提交都应让代码比之前更好
- 鼓励团队成员提出改进意见
- 定期回顾并优化工作流程

**实践**：
```python
# 每次只关注一个改进点
def before_refactor():
    # 大爆炸式重构：一次改 50 个文件
    pass

def after_kaizen():
    # Kaizen 方式：每次改 1-2 个文件
    # 第 1 天：重构 user_service.py
    # 第 2 天：重构 auth_service.py
    # 第 3 天：添加类型提示
    pass
```

### 2. 防错（Poka-Yoke）

设计 API 和接口使错误不可能发生，或能立即被发现。

**实践**：
```python
# 糟糕：容易传错参数顺序
create_user("Alice", "alice@example.com", "admin")

# 推荐：使用命名参数或数据结构
create_user(name="Alice", email="alice@example.com", role="admin")

# 推荐：使用枚举限制可选值
from enum import Enum

class UserRole(Enum):
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"

create_user(name="Alice", email="alice@example.com", role=UserRole.ADMIN)
```

### 3. 标准化工作

- 建立统一的编码规范和命名约定
- 使用工具自动化格式检查和 lint
- 文档化决策理由（ADR）而非仅文档化结果
- 设计模板和脚手架减少重复决策

**实践**：
```bash
# 标准化工具链
项目使用：
- 格式化：Prettier / Black / gofmt
- Lint：ESLint / pylint / golangci-lint
- 提交：Conventional Commits
- 分支：GitFlow / Trunk-Based
```

### 4. 准时制（JIT）

- 仅在需要时才做
- 避免过早优化和过度设计
- 延迟决策直到掌握足够信息
- 消除浪费：不必要的代码、文档、会议

**实践**：
```python
# 糟糕：过度设计
class AbstractUserFactoryBuilderStrategy:
    def build(self): ...

# 推荐：从简单开始，需要时再抽象
def create_user(name, email):
    return {"name": name, "email": email}
```

## 与命令的集成

| 命令 | Kaizen 应用 |
|------|-------------|
| `/commit` | 小步提交，原子性变更 |
| `/review` | 增量审查，持续改进 |
| `/plan` | 分解大任务为小步骤 |
| `/compact` | 定期整理上下文，保持高效 |

## 警示信号

遇到以下情况时立即应用 Kaizen：

| 信号 | 响应 |
|------|------|
| "这次一次性改完" | 拆分任务，分多次小步完成 |
| "以后可能会用到" | 只实现当前需要的功能 |
| "我觉得这样更好" | 先验证，再小范围试点 |
| "没人维护这段代码" | 提交前先运行 lint/test |
| "这个 bug 很紧急" | 先修复，再重构，避免技术债堆积 |

## 记住

### Do（做）

- 每天至少一次小改进
- 从最简单的可行方案开始
- 编写可读的代码，少写注释
- 使用类型和接口作为文档
- 为失败设计（错误处理、超时、重试）
- 代码审查视为学习机会

### Don't（不做）

- 不做无人使用的抽象
- 不写只有自己理解的"聪明"代码
- 不忽略警告和 lint 错误
- 不在没有测试的情况下重写
- 不为了技术而技术

### 改进循环

```
计划 → 做 → 检查 → 调整（PDCA）
  ↑                        |
  └────────────────────────┘
```

## 限制

- Kaizen 不意味着永远不重构——它意味着**以可持续速度**重构
- 紧急修复时可以先解决问题，事后补齐 Kaizen
- 团队规模越大，标准化越重要
- 过度 Kaizen 也可能产生浪费——找到合适的节奏
- 不替代专业工程师的判断
