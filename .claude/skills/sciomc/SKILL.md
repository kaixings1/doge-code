---
name: sciomc
description: 编排并行的 scientist 代理进行全面分析，支持 AUTO 模式。
argument-hint: <research goal>
level: 4
---

# 研究技能

编排并行的 scientist 代理执行全面研究工作流，可选的 AUTO 模式支持完全自主执行。

## 概述

研究是一个多阶段工作流，把复杂的研究目标分解为并行的多条调查线：

1. **分解** —— 把研究目标拆成相互独立的阶段/假设
2. **执行** —— 对每个阶段并行运行 scientist 代理
3. **验证** —— 交叉校验各项发现，检查一致性
4. **综合** —— 把结果汇总成一份完整的报告

## 用法示例

```
/oh-my-claudecode:sciomc <goal>                    # 标准研究流程，在检查点等待用户确认
/oh-my-claudecode:sciomc AUTO: <goal>              # 完全自主执行直到完成
/oh-my-claudecode:sciomc status                    # 查看当前研究会话状态
/oh-my-claudecode:sciomc resume                    # 恢复被中断的研究会话
/oh-my-claudecode:sciomc list                      # 列出所有研究会话
/oh-my-claudecode:sciomc report <session-id>       # 为指定会话生成报告
```

### 简短示例

```
/oh-my-claudecode:sciomc 不同排序算法的性能特征分别是什么？
/oh-my-claudecode:sciomc AUTO: 分析这个代码库里的认证模式
/oh-my-claudecode:sciomc API 层各处的错误处理是如何工作的？
```

## 研究协议

### 阶段分解模式

给定一个研究目标时，把它分解为 3-7 个相互独立的阶段：

```markdown
## 研究分解

**目标：** <原始研究目标>

### 阶段 1：<阶段名>
- **关注点：** 本阶段调查什么
- **假设：** 预期发现（如适用）
- **范围：** 要检查的文件/区域
- **层级：** LOW | MEDIUM | HIGH

### 阶段 2：<阶段名>
...
```

### 并行调用 Scientist

通过 Task 工具并行发起相互独立的阶段：

```
// 阶段 1 —— 简单数据收集
Task(subagent_type="oh-my-claudecode:scientist", model="haiku", prompt="[RESEARCH_STAGE:1] 调查……")

// 阶段 2 —— 标准分析
Task(subagent_type="oh-my-claudecode:scientist", model="sonnet", prompt="[RESEARCH_STAGE:2] 分析……")

// 阶段 3 —— 复杂推理
Task(subagent_type="oh-my-claudecode:scientist", model="opus", prompt="[RESEARCH_STAGE:3] 深入分析……")
```

### 智能模型路由

**关键：始终显式传入 `model` 参数！**

| 任务复杂度 | 代理 | 模型 | 适用场景 |
|-----------------|-------|-------|---------|
| 数据收集 | `scientist`（model=haiku） | haiku | 文件枚举、模式计数、简单查找 |
| 标准分析 | `scientist` | sonnet | 代码分析、模式识别、文档评审 |
| 复杂推理 | `scientist` | opus | 架构分析、横切关注点、假设验证 |

### 路由决策指南

| 研究任务 | 层级 | 提示词示例 |
|---------------|------|----------------|
| 「统计 X 的出现次数」 | LOW | 「统计 useState 钩子的所有用法」 |
| 「找出所有匹配 Y 的文件」 | LOW | 「列出项目中所有测试文件」 |
| 「分析模式 Z」 | MEDIUM | 「分析 API 路由中的错误处理模式」 |
| 「梳理 W 如何工作」 | MEDIUM | 「梳理认证流程」 |
| 「解释为什么会发生 X」 | HIGH | 「解释缓存层为什么会出现竞态条件」 |
| 「对比方案 A 与 B」 | HIGH | 「对比这里状态管理该用 Redux 还是 Context」 |

### 验证循环

并行执行完成后，校验各项发现：

```
// 交叉验证阶段
Task(subagent_type="oh-my-claudecode:scientist", model="sonnet", prompt="
[RESEARCH_VERIFICATION]
交叉校验以下各项发现是否一致：

阶段 1 发现：<摘要>
阶段 2 发现：<摘要>
阶段 3 发现：<摘要>

检查：
1. 各阶段之间是否存在矛盾
2. 是否缺少关联
3. 覆盖是否有缺口
4. 证据质量

输出：[VERIFIED] 或 [CONFLICTS:<列表>]
")
```

## AUTO 模式

AUTO 模式以循环控制的方式自主运行完整的研究工作流。

### 循环控制协议

```
[RESEARCH + AUTO - ITERATION {{ITERATION}}/{{MAX}}]

你上一次尝试没有输出完成承诺。继续工作。

当前状态：{{STATE}}
已完成阶段：{{COMPLETED_STAGES}}
待处理阶段：{{PENDING_STAGES}}
```

### 承诺标签

| 标签 | 含义 | 何时使用 |
|-----|---------|-------------|
| `[PROMISE:RESEARCH_COMPLETE]` | 研究成功完成 | 所有阶段已完成、已验证、报告已生成 |
| `[PROMISE:RESEARCH_BLOCKED]` | 无法继续 | 数据缺失、访问受限、存在循环依赖 |

### AUTO 模式规则

1. **最大迭代次数：** 10（可配置）
2. **持续到：** 发出承诺标签，或达到最大迭代次数
3. **状态跟踪：** 每个阶段完成后持久化
4. **取消方式：** `/oh-my-claudecode:cancel`，或说 "stop"、"cancel"

### AUTO 模式示例

```
/oh-my-claudecode:sciomc AUTO: 全面分析认证系统的安全性

[分解]
- 阶段 1（LOW）：枚举与认证相关的文件
- 阶段 2（MEDIUM）：分析 token 处理逻辑
- 阶段 3（MEDIUM）：审查会话管理
- 阶段 4（HIGH）：识别漏洞模式
- 阶段 5（MEDIUM）：记录安全控制措施

[执行 - 并行]
并行发起阶段 1-3……
依赖项完成后发起阶段 4-5……

[验证]
交叉校验各项发现……

[综合]
生成报告……

[PROMISE:RESEARCH_COMPLETE]
```

## 并行执行模式

### 独立数据集分析（并行）

当各阶段分析不同的数据源时：

```
// 全部同时发起
Task(subagent_type="oh-my-claudecode:scientist", model="haiku", prompt="[STAGE:1] 分析 src/api/...")
Task(subagent_type="oh-my-claudecode:scientist", model="haiku", prompt="[STAGE:2] 分析 src/utils/...")
Task(subagent_type="oh-my-claudecode:scientist", model="haiku", prompt="[STAGE:3] 分析 src/components/...")
```

### 假设组（并行）

当需要检验多个假设时：

```
// 同时检验多个假设
Task(subagent_type="oh-my-claudecode:scientist", model="sonnet", prompt="[HYPOTHESIS:A] 检验缓存是否提升……")
Task(subagent_type="oh-my-claudecode:scientist", model="sonnet", prompt="[HYPOTHESIS:B] 检验批处理是否降低……")
Task(subagent_type="oh-my-claudecode:scientist", model="sonnet", prompt="[HYPOTHESIS:C] 检验懒加载是否有帮助……")
```

### 交叉验证（串行）

当验证依赖于全部发现时：

```
// 等待所有并行阶段完成
[所有阶段完成]

// 然后按顺序验证
Task(subagent_type="oh-my-claudecode:scientist", model="opus", prompt="
[CROSS_VALIDATION]
校验全部发现之间的一致性：
- 发现 1：...
- 发现 2：...
- 发现 3：...
")
```

### 并发上限

**最多 20 个并发 scientist 代理**，以防资源耗尽。

若阶段数超过 20，则分批：
```
第 1 批：阶段 1-5（并行）
[等待完成]
第 2 批：阶段 6-7（并行）
```

## 会话管理

### 目录结构

```
.omc/research/{session-id}/
  state.json              # 会话状态与进度
  stages/
    stage-1.md            # 阶段 1 的发现
    stage-2.md            # 阶段 2 的发现
    ...
  findings/
    raw/                  # scientist 产出的原始发现
    verified/             # 验证后的发现
  figures/
    figure-1.png          # 生成的可视化图
    ...
  report.md               # 最终综合报告
```

### 状态文件格式

```json
{
  "id": "research-20240115-abc123",
  "goal": "原始研究目标",
  "status": "in_progress | complete | blocked | cancelled",
  "mode": "standard | auto",
  "iteration": 3,
  "maxIterations": 10,
  "stages": [
    {
      "id": 1,
      "name": "阶段名",
      "tier": "LOW | MEDIUM | HIGH",
      "status": "pending | running | complete | failed",
      "startedAt": "ISO 时间戳",
      "completedAt": "ISO 时间戳",
      "findingsFile": "stages/stage-1.md"
    }
  ],
  "verification": {
    "status": "pending | passed | failed",
    "conflicts": [],
    "completedAt": "ISO 时间戳"
  },
  "createdAt": "ISO 时间戳",
  "updatedAt": "ISO 时间戳"
}
```

### 会话命令

| 命令 | 动作 |
|---------|--------|
| `/oh-my-claudecode:sciomc status` | 显示当前会话进度 |
| `/oh-my-claudecode:sciomc resume` | 恢复最近一次被中断的会话 |
| `/oh-my-claudecode:sciomc resume <session-id>` | 恢复指定会话 |
| `/oh-my-claudecode:sciomc list` | 列出所有会话及其状态 |
| `/oh-my-claudecode:sciomc report <session-id>` | 生成/重新生成报告 |
| `/oh-my-claudecode:sciomc cancel` | 取消当前会话（保留状态） |

## 标签提取

Scientist 使用结构化标签标记发现。用以下模式提取它们：

### 发现标签

```
[FINDING:<id>] <标题>
<证据与分析>
[/FINDING]

[EVIDENCE:<finding-id>]
- File: <路径>
- Lines: <行号范围>
- Content: <相关代码/文本>
[/EVIDENCE]

[CONFIDENCE:<level>] # HIGH | MEDIUM | LOW
<置信度判定理由>
```

### 提取用正则模式

```javascript
// 提取发现
const findingPattern = /\[FINDING:(\w+)\]\s*(.*?)\n([\s\S]*?)\[\/FINDING\]/g;

// 提取证据
const evidencePattern = /\[EVIDENCE:(\w+)\]([\s\S]*?)\[\/EVIDENCE\]/g;

// 提取置信度
const confidencePattern = /\[CONFIDENCE:(HIGH|MEDIUM|LOW)\]\s*(.*)/g;

// 阶段完成
const stageCompletePattern = /\[STAGE_COMPLETE:(\d+)\]/;

// 验证结果
const verificationPattern = /\[(VERIFIED|CONFLICTS):?(.*?)\]/;
```

### 证据窗口

提取证据时，附带上下文窗口：

```
[EVIDENCE:F1]
- File: /src/auth/login.ts
- Lines: 45-52（上下文：40-57）
- Content:
  ```typescript
  // 第 45-52 行，上下各带 5 行上下文
  ```
[/EVIDENCE]
```

### 质量校验

发现必须达到质量门槛：

| 质量检查项 | 要求 |
|---------------|-------------|
| 证据存在 | 每条 [FINDING] 至少有 1 个 [EVIDENCE] |
| 已声明置信度 | 每条发现都有 [CONFIDENCE] |
| 已引用来源 | 文件路径为绝对路径且有效 |
| 可复现 | 其他代理也能验证 |

## 报告生成

### 报告模板

```markdown
# 研究报告：{{GOAL}}

**会话 ID：** {{SESSION_ID}}
**日期：** {{DATE}}
**状态：** {{STATUS}}

## 摘要

{{2-3 段关键发现概述}}

## 研究方法

### 研究阶段

| 阶段 | 关注点 | 层级 | 状态 |
|-------|-------|------|--------|
{{STAGES_TABLE}}

### 方法

{{分解依据与执行策略的描述}}

## 关键发现

### 发现 1：{{TITLE}}

**置信度：** {{HIGH|MEDIUM|LOW}}

{{带证据的详细发现}}

#### 证据

{{内嵌的证据块}}

### 发现 2：{{TITLE}}
...

## 可视化

{{FIGURES}}

## 交叉验证结果

{{验证摘要，以及已解决的任何冲突}}

## 局限性

- {{局限性 1}}
- {{局限性 2}}
- {{未覆盖的范围及原因}}

## 建议

1. {{可执行的建议}}
2. {{可执行的建议}}

## 附录

### 原始数据

{{指向原始发现文件的链接}}

### 会话状态

{{指向 state.json 的链接}}
```

### 图表嵌入协议

Scientist 使用以下标记生成可视化：

```
[FIGURE:path/to/figure.png]
Caption: 图表展示的内容
Alt: 无障碍描述
[/FIGURE]
```

报告生成器嵌入图表：

```markdown
## 可视化

![图 1：说明](figures/figure-1.png)
*Caption: 图表展示的内容*

![图 2：说明](figures/figure-2.png)
*Caption: 图表展示的内容*
```

### 图表类型

| 类型 | 用途 | 生成者 |
|------|---------|--------------|
| 架构图 | 系统结构 | scientist |
| 流程图 | 处理流程 | scientist |
| 依赖图 | 模块关系 | scientist |
| 时间线 | 事件时序 | scientist |
| 对比表 | A 与 B 的对比分析 | scientist |

## 配置

`.claude/settings.json` 中的可选设置：

```json
{
  "omc": {
    "research": {
      "maxIterations": 10,
      "maxConcurrentScientists": 5,
      "defaultTier": "MEDIUM",
      "autoVerify": true,
      "generateFigures": true,
      "evidenceContextLines": 5
    }
  }
}
```

## 取消

```
/oh-my-claudecode:cancel
```

或者说："stop research"、"cancel research"、"abort"

进度保存在 `.omc/research/{session-id}/` 中，可供恢复。

## 故障排查

**卡在验证循环里？**
- 检查各阶段之间是否存在相互矛盾的发现
- 查看 state.json 了解具体的冲突
- 可能需要用不同的方法重跑特定阶段

**Scientist 返回的发现质量低？**
- 检查层级分配 —— 复杂分析需要 HIGH 层级
- 确保提示词包含清晰的范围和预期的输出格式
- 检查研究目标是否过于宽泛

**AUTO 模式用尽了迭代次数？**
- 查看状态以弄清卡在哪里
- 检查以现有数据该目标是否可达
- 考虑拆成更小的研究会话

**报告中缺少图表？**
- 确认 figures/ 目录存在
- 检查发现中的 [FIGURE:] 标签
- 确保路径是相对于会话目录的
