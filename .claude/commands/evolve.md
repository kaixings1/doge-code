---
name: evolve
description: 分析直觉（Instincts）并建议或生成进化的结构
command: true
---

# 进化命令（Evolve Command）

## 实现（Implementation）

使用插件根路径运行直觉（Instinct）命令行工具：

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/scripts/instinct-cli.py" evolve [--generate]
```

如果未设置 `CLAUDE_PLUGIN_ROOT`（手动安装）：

```bash
python3 ~/.claude/skills/continuous-learning-v2/scripts/instinct-cli.py evolve [--generate]
```

分析直觉并将相关的直觉聚类为更高级别的结构：
- **命令（Commands）**：当直觉描述用户调用的动作时
- **技能（Skills）**：当直觉描述自动触发的行为时
- **智能体（Agents）**：当直觉描述复杂的、多步骤的过程时

## 用法（Usage）

```
/evolve                    # 分析所有直觉并建议进化方案
/evolve --generate         # 同时在 evolved/{skills,commands,agents} 下生成文件
```

## 进化规则（Evolution Rules）

### → 命令（用户调用）
当直觉描述用户会明确请求的动作时：
- 多个关于“当用户要求...”的直觉
- 带有类似“当创建新的 X 时”触发器的直觉
- 遵循可重复序列的直觉

示例：
- `new-table-step1`: "在添加数据库表时，创建迁移（migration）"
- `new-table-step2`: "在添加数据库表时，更新 schema"
- `new-table-step3`: "在添加数据库表时，重新生成类型"

→ 创建：**new-table** 命令

### → 技能（自动触发）
当直觉描述应该自动发生的行为时：
- 模式匹配触发器
- 错误处理响应
- 代码风格强制执行

示例：
- `prefer-functional`: "在编写函数时，优先使用函数式风格"
- `use-immutable`: "在修改状态时，使用不可变模式"
- `avoid-classes`: "在设计模块时，避免基于类的设计"

→ 创建：`functional-patterns` 技能（Skill）

### → 智能体（需要深度/隔离）
当直觉描述复杂的、多步骤的过程且能从隔离中获益时：
- 调试工作流
- 重构序列
- 研究任务

示例：
- `debug-step1`: "在调试时，首先检查日志"
- `debug-step2`: "在调试时，隔离失败的组件"
- `debug-step3`: "在调试时，创建最小复现用例"
- `debug-step4`: "在调试时，通过测试验证修复"

→ 创建：**debugger** 智能体（Agent）

## 执行逻辑（What to Do）

1. 检测当前项目上下文（Context）
2. 读取项目 + 全局直觉（ID 冲突时项目优先）
3. 按触发器/领域模式对直觉进行分组
4. 识别：
   - 技能候选者（包含 2 个以上直觉的触发器集群）
   - 命令候选者（高置信度的工作流直觉）
   - 智能体候选者（更大规模、高置信度的集群）
5. 在适用时显示晋升候选者（项目 -> 全局）
6. 如果传递了 `--generate` 参数，将文件写入：
   - 项目范围：`~/.claude/homunculus/projects/<project-id>/evolved/`
   - 全局兜底：`~/.claude/homunculus/evolved/`

## 输出格式（Output Format）

```
============================================================
  EVOLVE ANALYSIS - 12 instincts
  Project: my-app (a1b2c3d4e5f6)
  Project-scoped: 8 | Global: 4
============================================================

High confidence instincts (>=80%): 5

## SKILL CANDIDATES
1. Cluster: "adding tests"
   Instincts: 3
   Avg confidence: 82%
   Domains: testing
   Scopes: project

## COMMAND CANDIDATES (2)
  /adding-tests
    From: test-first-workflow [project]
    Confidence: 84%

## AGENT CANDIDATES (1)
  adding-tests-agent
    Covers 3 instincts
    Avg confidence: 82%
```

## 参数（Flags）

- `--generate`: 除了分析输出外，生成进化的文件

## 生成的文件格式（Generated File Format）

### 命令（Command）
```markdown
---
name: new-table
description: Create a new database table with migration, schema update, and type generation
command: /new-table
evolved_from:
  - new-table-migration
  - update-schema
  - regenerate-types
---

# New Table Command

[基于聚类直觉生成的直觉内容]

## 步骤
1. ...
2. ...
```

### 技能（Skill）
```markdown
---
name: functional-patterns
description: Enforce functional programming patterns
evolved_from:
  - prefer-functional
  - use-immutable
  - avoid-classes
---

# Functional Patterns Skill

[基于聚类直觉生成的直觉内容]
```

### 智能体（Agent）
```markdown
---
name: debugger
description: Systematic debugging agent
model: sonnet
evolved_from:
  - debug-check-logs
  - debug-isolate
  - debug-reproduce
---

# Debugger Agent

[基于聚类直觉生成的直觉内容]
```
