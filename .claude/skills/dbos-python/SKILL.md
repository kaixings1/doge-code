---
name: dbos-python
description: "使用 DBOS 持久化工作流构建可靠、容错的 Python 应用指南。适用于将 DBOS 添加到现有 Python 代码、创建工作流和步骤或使用队列进行并发控制。"
risk: safe
source: "https://docs.dbos.dev/"
date_added: "2026-02-27"
---

# DBOS Python 最佳实践

使用 DBOS 持久化工作流构建可靠、容错的 Python 应用指南。

## 何时使用
在以下情况下参考这些指南：
- 将 DBOS 添加到现有 Python 代码中
- Creating workflows and steps
- Using queues for concurrency control
- Implementing workflow communication (events, messages, streams)
- Configuring and launching DBOS applications
- Using DBOSClient from external applications
- Testing DBOS applications

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Lifecycle | CRITICAL | `lifecycle-` |
| 2 | Workflow | CRITICAL | `workflow-` |
| 3 | Step | HIGH | `step-` |
| 4 | Queue | HIGH | `queue-` |
| 5 | Communication | MEDIUM | `comm-` |
| 6 | Pattern | MEDIUM | `pattern-` |
| 7 | Testing | LOW-MEDIUM | `test-` |
| 8 | Client | MEDIUM | `client-` |
| 9 | Advanced | LOW | `advanced-` |

## Critical Rules

### DBOS Configuration and Launch

A DBOS application MUST configure and launch DBOS inside its main function:

```python
import os
from dbos import DBOS, DBOSConfig

@DBOS.workflow()
def my_workflow():
    pass

if __name__ == "__main__":
    config: DBOSConfig = {
        "name": "my-app",
        "system_database_url": os.environ.get("DBOS_SYSTEM_DATABASE_URL"),
    }
    DBOS(config=config)
    DBOS.launch()
```

### Workflow and Step Structure

Workflows are comprised of steps. Any function performing complex operations or accessing external services must be a step:

```python
@DBOS.step()
def call_external_api():
    return requests.get("https://api.example.com").json()

@DBOS.workflow()
def my_workflow():
    result = call_external_api()
    return result
```

### Key Constraints

- Do NOT call `DBOS.start_workflow` or `DBOS.recv` from a step
- Do NOT use threads to start workflows - use `DBOS.start_workflow` or queues
- Workflows MUST be deterministic - non-deterministic operations go in steps
- Do NOT create/update global variables from workflows or steps

## How to Use

Read individual rule files for detailed explanations and examples:

```
references/lifecycle-config.md
references/workflow-determinism.md
references/queue-concurrency.md
```

## 参考

- https://docs.dbos.dev/
- https://github.com/dbos-inc/dbos-transact-py

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
