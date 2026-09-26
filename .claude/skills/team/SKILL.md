---
name: team
description: N 个协调代理在共享任务列表上工作，使用 Claude Code 隐式代理团队。
argument-hint: "[N:agent-type] [ralph] <task description>"
aliases: []
level: 4
---

# Team 技能

派生 N 个协调代理，让它们使用 Claude Code 的隐式代理团队在共享任务列表上协作。Claude Code 2.1.178+ 移除了原生的 `TeamCreate`/`TeamDelete`；启用 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 后，每个会话拥有一个隐式团队，队友通过 Agent/Task 工具并各自使用不同的 `name` 值直接派生。本技能在文档所述之处仍保留 OMC 既有的 tmux/CLI 工作者编排（`omc team` / `/omc-teams`）。

`swarm` 兼容别名已在 #1131 中移除。

## 用法

```
/oh-my-claudecode:team N:agent-type "task description"
/oh-my-claudecode:team "task description"
/oh-my-claudecode:team ralph "task description"
```

### 参数

- **N** - 队友代理数量（1-20）。可选；默认根据任务拆解情况自动定量。
- **agent-type** - `team-exec` 阶段要派生的 OMC 代理（例如 executor、debugger、designer、codex、gemini、antigravity）。可选；默认按阶段感知路由。使用 `codex` 派生 Codex CLI 工作者，使用 `gemini` 派生 Gemini CLI 工作者（企业版/API 密钥档），或使用 `antigravity` 派生 Antigravity CLI（`agy`）工作者（Google 的 Gemini CLI 后继者；需安装对应的 CLI）。见下文「阶段代理路由」。
- **task** - 需要拆解并分发给队友的高层任务
- **ralph** - 可选修饰符。存在时，把团队流水线包进 Ralph 的持久化循环（失败重试、完成前由架构师校验）。见下文「Team + Ralph 组合」。

### 示例

```bash
/team 5:executor "修复项目中所有 TypeScript 错误"
/team 3:debugger "修复 src/ 中的构建错误"
/team 4:designer "为所有页面组件实现响应式布局"
/team "重构 auth 模块并进行安全审查"
/team ralph "为用户管理构建一套完整的 REST API"
# 使用 Codex CLI 工作者（需要：npm install -g @openai/codex）
/team 2:codex "审查架构并提出改进建议"
# 使用 Gemini CLI 工作者（需要：npm install -g @google/gemini-cli）
/team 2:gemini "重新设计 UI 组件"
# 使用 Antigravity CLI 工作者（需要：按 https://antigravity.google 安装）
/team 2:antigravity "重新设计 UI 组件"
# 混合使用：Codex 做后端分析，Gemini/Antigravity 做前端（此场景请改用 /ccg）
```

## 架构

```
用户: "/team 3:executor 修复所有 TypeScript 错误"
              |
              v
      [团队编排器（主控）]
              |
              +-- 使用会话的隐式 Claude Code 团队
              |       -> 不调用 TeamCreate；主控仍是当前会话
              |
              +-- 分析任务并拆解为子任务
              |       -> explore/architect 产出子任务列表
              |
              +-- 依据实施计划创建任务列表条目
              |       -> 带依赖关系的 TODO/任务条目 #1、#2、#3
              |
              +-- 更新任务列表条目（预先指派负责人）
              |       -> 任务 #1 负责人=worker-1，以此类推
              |
              +-- Task(name="worker-1") x 3
              |       -> 把队友派生进团队
              |
              +-- 监控循环
              |       <- 队友消息（由当前团队界面自动投递）
              |       -> 查看任务列表/TodoWrite 以掌握进度
              |       -> 通过当前团队界面给队友发消息，以解除阻塞/协调
              |
              +-- 完成
                      -> 通过当前团队界面请求每位队友关闭
                      <- 队友返回关闭确认
                      -> 清理 OMC 团队状态（不调用 TeamDelete）
                      -> rm .omc/state/team-state.json
```

**原生 Claude Code 团队模型（2.1.178+）：**

```
- 本技能不会为每个团队创建 ~/.claude/teams/<name>/ 目录。
- 不存在 TeamCreate/TeamDelete 调用。
- `team_name` 仅被原生 Claude Code 当作被忽略的遗留元数据接受；不要依赖它做路由。
- 直接通过 Agent/Task 以 `name="worker-N"` 派生队友。
```

## 与 Goal 工作流的关系

Team 是 OMC 中并行、分阶段执行的权威机制。请使用确定性的冲突策略 `refuse`、`adopt_existing` 和 `artifact_only`，而不要使用非确定性的警告式处理。若任务提到 Claude Code `/goal`、Ralph、UltraQA 或仅产出制品的 Ultragoal，则除非主控显式移交，否则仍以 Team 作为主要循环的权威机制。只把 `/goal` 当作有文档记录的原生 Claude Code 移交目标，或当作来自主控会话的可见证据；不要声称 `/goal` 的评估器会独立执行命令、读取文件或取代 `team-verify` / `team-fix`。仅产出制品的 Ultragoal 引用应被视为持久的目标台账/检查点/证据制品，而不是它自身的工作者执行。

## 分阶段流水线（规范 Team 运行时）

Team 执行遵循一条分阶段流水线：

`team-plan -> team-prd -> team-exec -> team-verify -> team-fix (loop)`

### 阶段代理路由

每条流水线阶段都使用**专用代理** —— 不只是执行器。主控依据阶段与任务特征来选择代理。

| 阶段            | 必需代理                            | 可选代理                                                                                                | 选择标准                                                                                                                                                                                          |
| --------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **team-plan**   | `explore` (haiku), `planner` (opus) | `analyst` (opus), `architect` (opus)                                                                    | 需求不清晰时使用 `analyst`。系统边界复杂时使用 `architect`。                                                                                                                                      |
| **team-prd**    | `analyst` (opus)                    | `critic` (opus)                                                                                         | 用 `critic` 来挑战范围。                                                                                                                                                                          |
| **team-exec**   | `executor` (sonnet)                 | `executor` (opus), `debugger` (sonnet), `designer` (sonnet), `writer` (haiku), `test-engineer` (sonnet) | 让代理匹配子任务类型。复杂的自主工作用 `executor`（model=opus），UI 用 `designer`，编译问题用 `debugger`，文档用 `writer`，测试创建用 `test-engineer`。                                           |
| **team-verify** | `verifier` (sonnet)                 | `test-engineer` (sonnet), `security-reviewer` (sonnet), `code-reviewer` (opus)                          | 始终运行 `verifier`。涉及 auth/crypto 改动时加上 `security-reviewer`。改动超过 20 个文件或涉及架构变更时加上 `code-reviewer`。`code-reviewer` 也覆盖风格/格式检查。                               |
| **team-fix**    | `executor` (sonnet)                 | `debugger` (sonnet), `executor` (opus)                                                                  | 类型/构建错误和回归定位用 `debugger`。复杂的多文件修复用 `executor`（model=opus）。                                                                                                               |

**路由规则：**

1. **由主控按阶段挑选代理，而不是由用户挑选。** 用户的 `N:agent-type` 参数只覆盖 `team-exec` 阶段的工作者类型。其它所有阶段都使用适配该阶段的专家。
2. **专家代理补充执行器代理。** 把分析/审查路由给 architect/critic Claude 代理，把 UI 工作路由给 designer 代理。Tmux CLI 工作者是一次性的，不参与团队通信。
3. **成本模式影响模型档位。** 在降级模式下：质量允许时把 `opus` 代理降为 `sonnet`、把 `sonnet` 降为 `haiku`。`team-verify` 始终至少使用 `sonnet`。
4. **风险等级会提升审查力度。** 安全敏感或改动超过 20 个文件的变更，必须在 `team-verify` 中包含 `security-reviewer` + `code-reviewer`（opus）。

### 阶段进入/退出条件

- **team-plan**
  - 进入条件：Team 调用已被解析，编排开始。
  - 代理：`explore` 扫描代码库，`planner` 创建任务图，复杂任务可选 `analyst`/`architect`。
  - 退出条件：拆解完成，且已准备好可运行的任务图。
- **team-prd**
  - 进入条件：范围含糊，或缺少验收标准。
  - 代理：`analyst` 提取需求，可选 `critic`。
  - 退出条件：验收标准与边界均已明确。
- **team-exec**
  - 进入条件：任务列表分配与工作者派生均已完成。
  - 代理：按每个子任务派生相应类型的专家工作者（见路由表）。
  - 退出条件：本轮执行任务到达终态。
- **team-verify**
  - 进入条件：执行轮次结束。
  - 代理：`verifier` + 与任务相称的审查者（见路由表）。
  - 退出条件（通过）：校验门禁全部通过，无需后续跟进。
  - 退出条件（失败）：生成修复任务，控制权移交给 `team-fix`。
- **team-fix**
  - 进入条件：校验发现缺陷/回归/未满足的标准。
  - 代理：按缺陷类型选用 `executor`/`debugger`。
  - 退出条件：修复完成，流程回到 `team-exec`，随后是 `team-verify`。

### 校验/修复循环与停止条件

持续进行 `team-exec -> team-verify -> team-fix`，直到：

1. 校验通过，且不存在必需的修复任务，或
2. 工作到达带证据的显式终态：阻塞/失败。

`team-fix` 受最大尝试次数约束。若修复尝试超过配置的上限，则转入终态 `failed`（不会无限循环）。

### 阶段交接约定

在阶段之间切换时，重要上下文 —— 已做的决策、被否决的备选方案、已识别的风险 —— 只存在于主控的对话历史中。若主控的上下文被压缩或代理重启，这些知识就会丢失。

**每个阶段在移交之前，都必须产出一份交接文档。**

主控把交接文档写入 `.omc/handoffs/<stage-name>.md`。

#### 交接格式

```markdown
## 交接: <current-stage> → <next-stage>

- **已决定**：[本阶段做出的关键决策]
- **已否决**：[考虑过的备选方案，以及否决它们的理由]
- **风险**：[为下一阶段识别的风险]
- **文件**：[创建或修改的关键文件]
- **剩余事项**：[留给下一阶段处理的事项]
```

#### 交接规则

1. **主控在派生下一阶段代理之前，先读上一份交接文档。** 交接内容会被放进下一阶段代理的派生提示中，确保代理从完整上下文中开始工作。
2. **交接文档会累积。** 校验阶段可以读取此前所有交接文档（plan → prd → exec），以获得完整的决策历史。
3. **团队被取消时，交接文档会保留** 在 `.omc/handoffs/` 中，以便会话恢复。它们不会被原生 Claude Code 的团队清理删除；Claude Code 2.1.178+ 中不存在 `TeamDelete` 调用。
4. **交接文档很轻量。** 最多 10-20 行。它们记录决策与理由，而不是完整规格（完整规格放在 DESIGN.md 这类交付文件中）。

#### 示例

```markdown
## 交接: team-plan → team-exec

- **已决定**：采用微服务架构，含 3 个服务（auth、api、worker）。用 PostgreSQL 做持久化。用 JWT 作为认证令牌。
- **已否决**：单体架构（存在扩展性顾虑）、MongoDB（团队专长是 SQL）、会话 cookie（设计以 API 优先）。
- **风险**：worker 服务需要 Redis 做作业队列 —— 尚未开通。auth 服务的初版设计没有限流。
- **文件**：DESIGN.md, TEST_STRATEGY.md
- **剩余事项**：数据库迁移脚本、CI/CD 流水线配置、Redis 开通。
```

### 恢复与取消语义

- **恢复：** 使用分阶段状态 + 实时任务状态，从最后一个非终态阶段重新开始。读取 `.omc/handoffs/` 以恢复阶段切换的上下文。
- **取消：** `/oh-my-claudecode:cancel` 会请求队友关闭、等待响应（尽力而为）、把阶段标记为 `cancelled` 且 `active=false`、记录取消相关的元数据，然后删除团队资源并按策略清理/保留 Team 状态。`.omc/handoffs/` 中的交接文件会被保留，以备可能的恢复。
- 终态为 `complete`、`failed` 和 `cancelled`。

## Windows 上 psmux 的 tmux 兼容性门禁

在原生 Windows 上，在真正检查过 tmux 兼容二进制之前，**不要**告诉用户 `/team` 需要 WSL，也不要声称 tmux 不可用。原生 [psmux](https://github.com/psmux/psmux) 会安装一个兼容 `tmux` 的命令（通常是 `tmux` / `tmux.cmd`），它是受支持的 Team 复用器。

在 Windows 上阻塞或回退之前：

1. 检查 `tmux -V`（或平台等价命令，例如先 `where tmux` 再 `tmux -V`）。
2. 把由 psmux 支撑的成功 `tmux -V` 视为 tmux 可用。
3. 若 psmux/tmux 可用，则继续正常的 Team 流程；不要输出「需要 WSL」的指引。
4. 只有在没有可用的 tmux 兼容二进制时，才告诉用户安装 psmux 以获得原生 Windows 支持，或改用 WSL2 作为替代。

## 工作流程

### 阶段 1：解析输入

- 提取 **N**（代理数量），校验其处于 1-20 范围
- 提取 **agent-type**，校验它能映射到已知的 OMC 子代理
- 提取 **task** 描述

### 阶段 2：分析与拆解

使用 `explore` 或 `architect`（通过 MCP 或代理）分析代码库，并把任务拆成 N 个子任务：

- 每个子任务都应**限定在文件范围**或**限定在模块范围**，以避免冲突
- 子任务必须相互独立，或具有清晰的依赖顺序
- 每个子任务都需要一个简明的 `subject` 和详细的 `description`
- 识别子任务之间的依赖（例如「共享类型必须先修好，消费者才能用」）

### 阶段 3：初始化团队状态

使用会话的隐式 Claude Code 团队。**不要**调用 `TeamCreate`；Claude Code 2.1.178+ 移除了该工具，并在启用 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 时自动为会话分配一个隐式团队。

派生一个诸如 `fix-ts-errors` 的 slug，仅用于 OMC 状态、提示标签、交接文档和人类可读的报告。原生 Claude Code 可能接受 `team_name` 作为遗留元数据，但它对路由是被忽略的。

使用 `state_write` MCP 工具写入 OMC 状态，以获得正确的会话级持久化：

```
state_write(mode="team", active=true, current_phase="team-plan", state={
  "team_name": "fix-ts-errors",
  "agent_count": 3,
  "agent_types": "executor",
  "task": "修复所有 TypeScript 错误",
  "fix_loop_count": 0,
  "max_fix_loops": 3,
  "linked_ralph": false,
  "stage_history": "team-plan"
})
```

> **注意：** MCP `state_write` 工具会把所有值都以字符串传输。消费方在读取状态时，必须把 `agent_count`、`fix_loop_count`、`max_fix_loops` 强制转换为数字，把 `linked_ralph` 强制转换为布尔值。

**状态 schema 字段：**

| 字段             | 类型    | 说明                                                                                    |
| ---------------- | ------- | --------------------------------------------------------------------------------------- |
| `active`         | boolean | team 模式是否处于激活状态                                                               |
| `current_phase`  | string  | 当前流水线阶段：`team-plan`、`team-prd`、`team-exec`、`team-verify`、`team-fix`         |
| `team_name`      | string  | 用于状态、交接文档和报告的 OMC slug；原生 Claude Code 路由会忽略它                      |
| `agent_count`    | number  | 工作者代理数量                                                                          |
| `agent_types`    | string  | team-exec 中使用的代理类型，逗号分隔                                                    |
| `task`           | string  | 原始任务描述                                                                            |
| `fix_loop_count` | number  | 当前修复迭代次数                                                                        |
| `max_fix_loops`  | number  | 失败前的最大修复迭代次数（默认：3）                                                     |
| `linked_ralph`   | boolean | 团队是否关联到 ralph 持久化循环                                                         |
| `stage_history`  | string  | 带时间戳的阶段切换列表，逗号分隔                                                        |

**每次阶段切换时更新状态：**

```
state_write(mode="team", current_phase="team-exec", state={
  "stage_history": "team-plan:2026-02-07T12:00:00Z,team-prd:2026-02-07T12:01:00Z,team-exec:2026-02-07T12:02:00Z"
})
```

**读取状态以检测是否需要恢复：**

```
state_read(mode="team")
```

若 `active=true` 且 `current_phase` 为非终态，则从最后一个未完成的阶段恢复，而不是创建新团队。

### 阶段 4：创建任务

使用 TodoWrite 或当前任务列表界面为每个子任务创建任务列表条目。任务列表工具只用于跟踪；它们不会创建原生团队。

```json
// 子任务 1 的任务列表条目
{
  "subject": "修复 src/auth/ 中的类型错误",
  "description": "修复 src/auth/login.ts、src/auth/session.ts 和 src/auth/types.ts 中的所有 TypeScript 错误。运行 tsc --noEmit 以验证。",
  "activeForm": "正在修复 auth 类型错误"
}
```

**响应会存下一个任务文件（例如 `1.json`）：**

```json
{
  "id": "1",
  "subject": "修复 src/auth/ 中的类型错误",
  "description": "修复 src/auth/login.ts 中的所有 TypeScript 错误...",
  "activeForm": "正在修复 auth 类型错误",
  "owner": "",
  "status": "pending",
  "blocks": [],
  "blockedBy": []
}
```

对于带依赖的任务，创建之后要更新当前任务列表条目：

```json
// 任务 #3 依赖任务 #1（共享类型必须先修好）
{
  "taskId": "3",
  "addBlockedBy": ["1"]
}
```

**由主控预先指派负责人**，以避免竞态条件（不存在原子认领机制）：

```json
// 把任务 #1 指派给 worker-1
{
  "taskId": "1",
  "owner": "worker-1"
}
```

### 阶段 5：派生队友

使用 Agent/Task 工具，以各自不同的 `name` 值直接派生 N 个队友。每个队友都会拿到团队工作者前言（见下文）以及自己的具体任务。**不要**调用 `TeamCreate`，也**不要**依赖 `team_name`；Claude Code 2.1.178+ 在原生路由中会忽略它。

```json
{
  "subagent_type": "oh-my-claudecode:executor",
  "name": "worker-1",
  "prompt": "<worker-preamble + assigned tasks>"
}
```

**响应：**

```json
{
  "agent_id": "worker-1",
  "name": "worker-1"
}
```

**副作用：**

- 队友被派生进会话的隐式 Claude Code 团队
- 会自动创建一个**内部任务**（带 `metadata._internal: true`）来跟踪该代理的生命周期
- 内部任务可能出现在任务列表输出中 —— 统计真实任务时应把它们过滤掉

**重要：** 并行派生所有队友（它们都是后台代理）。不要等一个结束再派生下一个。

### 阶段 6：监控

主控编排器通过两条通道监控进度：

1. **入站消息** -- 队友在完成任务或需要帮助时会给 `team-lead` 发消息。这些消息通过当前团队/对话界面到达。

2. **任务列表轮询/查看** -- 定期检查 TodoWrite 或当前任务列表界面，掌握整体进度：
   ```
   #1 [completed] 修复 src/auth/ 中的类型错误 (worker-1)
   #3 [in_progress] 修复 src/api/ 中的类型错误 (worker-2)
   #5 [pending] 修复 src/utils/ 中的类型错误 (worker-3)
   ```
   格式：`#ID [status] subject (owner)`

**主控可以采取的协调动作：**

- **解除队友阻塞：** 通过当前团队界面发送带有指引或缺失上下文的消息
- **改派工作：** 若某队友提前完成，更新任务列表条目，把待处理工作指派给它，并通过当前团队界面通知
- **处理失败：** 若某队友报告失败，改派该任务或派生替补

#### 任务看门狗策略

监控卡住或失败的队友：

- **最长进行中时长**：若某任务停留在 `in_progress` 超过 5 分钟且没有消息，就发一次状态询问
- **疑似死亡的工作者**：没有消息 + 任务卡住 10 分钟以上 → 把任务改派给另一个工作者
- **改派阈值**：若某工作者失败 2 个及以上任务，就停止给它分配新任务

### 阶段 6.5：阶段切换（状态持久化）

每次阶段切换时，都要更新 OMC 状态：

```
// 规划完成后进入 team-exec
state_write(mode="team", current_phase="team-exec", state={
  "stage_history": "team-plan:T1,team-prd:T2,team-exec:T3"
})

// 执行完成后进入 team-verify
state_write(mode="team", current_phase="team-verify")

// 校验失败后进入 team-fix
state_write(mode="team", current_phase="team-fix", state={
  "fix_loop_count": 1
})
```

这样可以支持：

- **恢复**：若主控崩溃，`state_read(mode="team")` 会显示最后一个阶段和团队名，便于恢复
- **取消**：取消技能读取 `current_phase`，从而知道需要做哪些清理
- **Ralph 集成**：Ralph 可以读取团队状态，知道流水线是完成了还是失败了

### 阶段 7：完成

当所有真实任务（非内部任务）都已完成或失败时：

1. **核验结果** -- 检查所有真实任务（非内部任务）在 TodoWrite 或当前任务列表界面中都标记为 `completed`
2. **关闭队友** -- 通过当前团队界面向每个仍在活动的队友发送 `shutdown_request`：
   ```json
   {
     "type": "shutdown_request",
     "recipient": "worker-1",
     "content": "全部工作已完成，正在关闭团队"
   }
   ```
3. **等待响应** -- 每个队友以 `shutdown_response(approve: true)` 响应并终止
4. **清理原生团队状态** -- Claude Code 2.1.178+ 没有 `TeamDelete`；在队友确认关闭后，清理 OMC 状态和任何本地任务簿记。
5. **清理 OMC 状态** -- 删除 `.omc/state/team-state.json`
6. **汇报摘要** -- 把结果呈现给用户

## 代理前言

派生队友时，在提示中加入这段前言以确立工作协议。针对每个队友具体分配的任务做相应调整。

```
你是 OMC 团队 "{team_name}" 中的一名团队工作者。你的名字是 "{worker_name}"。
你向团队主控（"team-lead"）汇报。
你不是主控，并且不得执行主控的编排动作。

== 工作协议 ==

1. 认领：检查 TodoWrite 或当前任务列表界面，找出指派给你的任务（owner = "{worker_name}"）。
   挑选第一个指派给你、且状态为 "pending" 的任务。
   使用当前任务列表界面把它标记为 `in_progress`：
   {"taskId": "ID", "status": "in_progress", "owner": "{worker_name}"}

2. 工作：使用你的工具（Read、Write、Edit、Bash）执行任务。
   不要派生子代理。不要委派。直接动手做。

3. 完成：做完之后，把任务标记为已完成：
   {"taskId": "ID", "status": "completed"}

4. 汇报：通过当前团队/对话界面通知主控：
   {"type": "message", "recipient": "team-lead", "content": "已完成任务 #ID：<summary of what was done>", "summary": "任务 #ID 已完成"}

5. 继续：检查 TodoWrite 或当前任务列表界面，看是否还有指派给你的任务。如果还有待处理任务，回到第 1 步。
   如果没有更多任务指派给你，通过当前团队/对话界面通知主控：
   {"type": "message", "recipient": "team-lead", "content": "所有已指派任务均已完成。待命。", "summary": "全部任务完成，正在待命"}

6. 关闭：当你收到 shutdown_request 时，用以下内容响应：
   {"type": "shutdown_response", "request_id": "<from the request>", "approve": true}

== 被阻塞的任务 ==
如果某任务带有 blockedBy 依赖，就跳过它，直到那些任务完成。
定期检查 TodoWrite 或当前任务列表界面，看阻塞项是否已解除。

== 错误 ==
如果你无法完成任务，把失败汇报给主控：
{"type": "message", "recipient": "team-lead", "content": "任务 #ID 失败：<reason>", "summary": "任务 #ID 失败"}
不要把任务标记为已完成。把它留在 in_progress，以便主控改派。

== 规则 ==
- 绝不派生子代理，也绝不使用 Task 工具
- 绝不运行 tmux 窗格/会话编排命令（例如 `tmux split-window`、`tmux new-session`）
- 绝不运行团队派生/编排技能或命令（例如 `$team`、`$ultrawork`、`$autopilot`、`$ralph`、`omc team ...`、`omx team ...`）
- 一律使用绝对文件路径
- 一律通过当前团队/对话界面向 "team-lead" 汇报进度
- 只使用类型为 "message" 的团队/对话直发消息 —— 绝不使用 "broadcast"
```

### 按代理类型注入提示（工作者专属补充说明）

组装队友提示时，按工作者类型追加一段简短的补充说明：

- `claude_worker`：强调严格更新 TodoWrite/任务列表、使用当前团队/对话消息，以及不执行编排命令。
- `codex_worker`：强调 CLI API 生命周期（`omc team api ... --json`），以及带 stderr 的显式失败确认。
- `gemini_worker`：强调受限的文件归属，以及每完成一个子步骤就做里程碑确认。
- `antigravity_worker`：与 `gemini_worker` 的期望相同；强调受限的文件归属，以及每完成一个子步骤就做里程碑确认。

这段补充说明必须守住核心规则：**工作者 = 仅执行者，绝不是主控/编排者**。

## 通信模式

### 队友 → 主控（任务完成汇报）

```json
{
  "type": "message",
  "recipient": "team-lead",
  "content": "已完成任务 #1：修复了 src/auth/login.ts 中的 3 个类型错误，以及 src/auth/session.ts 中的 2 个类型错误。所有文件均通过 tsc --noEmit。",
  "summary": "任务 #1 已完成"
}
```

### 主控 → 队友（改派或指引）

```json
{
  "type": "message",
  "recipient": "worker-2",
  "content": "任务 #3 现已解除阻塞。另外请接手原本指派给 worker-1 的任务 #5。",
  "summary": "新任务指派"
}
```

### 广播（请克制使用 —— 会发送 N 条独立消息）

```json
{
  "type": "broadcast",
  "content": "停止：src/types/index.ts 中的共享类型已变更。继续之前请先拉取最新版本。",
  "summary": "共享类型已变更"
}
```

### 关闭协议（阻塞式）

**关键：各步骤必须严格按顺序执行。在关闭被确认或超时之前，绝不清理 OMC 团队状态。**

**步骤 1：核验完成情况**

```
通过 TodoWrite 或当前任务列表界面核验 —— 所有真实任务（非内部任务）都已完成或失败。
```

**步骤 2：向每个队友请求关闭**

**主控发送：**

```json
{
  "type": "shutdown_request",
  "recipient": "worker-1",
  "content": "全部工作已完成，正在关闭团队"
}
```

**步骤 3：等待响应（阻塞式）**

- 每位队友最多等待 30 秒，等待 `shutdown_response`
- 记录哪些队友已确认、哪些超时
- 若某队友在 30 秒内没有响应：记录警告，标记为无响应

**队友接收并响应：**

```json
{
  "type": "shutdown_response",
  "request_id": "shutdown-1770428632375@worker-1",
  "approve": true
}
```

在批准之后，该队友会终止，或停止接受新工作。Claude Code 2.1.178+ 不再暴露按团队的成员配置或 TeamDelete 清理；请改为在 OMC 状态/报告中记录这些确认。

**步骤 4：清理 OMC 团队状态 —— 仅在所有队友都已确认或超时之后**

Claude Code 2.1.178+ 没有 `TeamDelete`。在阻塞式关闭流程结束之后，清理 OMC 团队状态和本地任务簿记。

**步骤 5：仅对 OMC tmux/CLI 工作者做孤儿扫描**

对于遗留的 OMC tmux/CLI 工作者运行（`omc team` / `/omc-teams`），检查是否有在清理后存活下来的工作者进程：

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cleanup-orphans.mjs" --team-name fix-ts-errors
```

这会扫描与团队名匹配的 OMC 工作者进程，并终止陈旧的孤儿进程（SIGTERM → 等待 5 秒 → SIGKILL）。支持 `--dry-run` 供检查使用。

**关闭流程是阻塞式的：** 在所有队友满足以下任一条件之前，不要清理 OMC 团队状态：

- 已确认关闭（`shutdown_response` 且 `approve: true`），或
- 已超时（30 秒无响应）

**重要：** `request_id` 由队友收到的关闭请求消息提供。队友必须提取它并将其回传。不要伪造 request ID。

## CLI 工作者（Codex 与 Gemini）

本团队技能支持**混合执行**，即把 Claude 代理队友与外部 CLI 工作者（Codex CLI 与 Gemini CLI）组合使用。两类都能修改代码 —— 差别在于能力和成本。它们是独立的 CLI 工具，不是 MCP 服务器。

### 执行模式

在拆解阶段，任务会被打上执行模式标签：

| 执行模式             | 提供方                      | 能力                                                                                                                                                                                     |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claude_worker`      | Claude 代理                 | 完整的 Claude Code 工具访问权限（Read/Write/Edit/Bash/Task）。最适合需要 Claude 推理 + 迭代式工具使用的任务。                                                                            |
| `codex_worker`       | Codex CLI（tmux 窗格）      | 在 working_directory 中拥有完整文件系统访问权限。通过 tmux 窗格自主运行。最适合代码审查、安全分析、重构、架构。需要 `npm install -g @openai/codex`。                                     |
| `gemini_worker`      | Gemini CLI（tmux 窗格）     | 在 working_directory 中拥有完整文件系统访问权限。通过 tmux 窗格自主运行。最适合 UI/设计工作、文档、大上下文任务。需要 `npm install -g @google/gemini-cli`（企业版/API 密钥档）。         |
| `antigravity_worker` | Antigravity CLI（tmux 窗格） | 在 working_directory 中拥有完整文件系统访问权限。通过 tmux 窗格自主运行。与 gemini_worker 长处相同；是 Google 的 Gemini CLI 后继者。按[官方说明](https://antigravity.google)安装（`agy` 二进制）。 |

### CLI 工作者如何运作

Tmux CLI 工作者运行在专用的 tmux 窗格中，并拥有文件系统访问权限。它们是**自主执行者**，而不仅仅是分析者：

1. 主控把任务指令写入一个 prompt 文件
2. 主控派生一个 tmux CLI 工作者，并把 `working_directory` 设为项目根目录
3. 工作者读取文件、做出修改、运行命令 —— 全部在 working directory 内完成
4. 结果/摘要被写入一个输出文件
5. 主控读取输出，把任务标记为完成，并把结果喂给依赖它的任务

**与 Claude 队友的关键差别：**

- CLI 工作者通过 tmux 运作，而不是通过 Claude Code 的工具系统
- 它们不能使用 Claude Code 原生的任务列表或团队消息界面
- 它们作为一次性自主作业运行，而不是常驻队友
- 由主控管理它们的生命周期（派生、监控、收集结果）

### 何时该路由到哪里

| 任务类型                         | 最佳路由                       | 原因                                                |
| -------------------------------- | ------------------------------ | --------------------------------------------------- |
| 迭代式多步骤工作                 | Claude 队友                    | 需要工具介导的迭代 + 团队通信                       |
| 代码审查 / 安全审计              | CLI 工作者或专家代理           | 自主执行，擅长结构化分析                            |
| 架构分析 / 规划                  | architect Claude 代理          | 在有代码库访问权限的前提下做强有力的分析推理        |
| 重构（范围明确）                 | CLI 工作者或执行器代理         | 自主执行，擅长结构化变换                            |
| UI/前端实现                      | designer Claude 代理           | 设计专长、框架惯用法                                |
| 大规模文档                       | writer Claude 代理             | 写作专长 + 大上下文以确保一致性                     |
| 构建/测试迭代循环                | Claude 队友                    | 需要 Bash 工具 + 迭代修复循环                       |
| 需要团队协调的任务               | Claude 队友                    | 需要团队/对话状态更新                               |

### 示例：带 CLI 工作者的混合团队

```
/team 3:executor "重构 auth 模块并进行安全审查"

任务拆解：
#1 [codex_worker] 对现有 auth 代码做安全审查 -> 输出到 .omc/research/auth-security.md
#2 [codex_worker] 重构 auth/login.ts 和 auth/session.ts（使用 #1 的发现）
#3 [claude_worker:designer] 重新设计 auth UI 组件（登录表单、会话指示器）
#4 [claude_worker] 更新 auth 测试 + 修复集成问题
#5 [gemini_worker] 对所有改动做最终代码审查
```

主控先运行 #1（Codex 安全分析），然后并行运行 #2 和 #3（Codex 重构后端，designer 代理重新设计前端），接着运行 #4（Claude 队友处理测试迭代），最后运行 #5（Gemini 最终审查）。

### 预检分析（可选）

对于大型且含糊的任务，在创建团队之前先做分析：

1. 带上任务描述 + 代码库上下文，派生 `Task(subagent_type="oh-my-claudecode:planner", ...)`
2. 用该分析产出更好的任务拆解
3. 带着更丰富的上下文创建团队与任务

当任务范围不清晰，且需要在确定具体拆解方案之前借助外部推理时，这一点尤其有用。

## 监控增强：发件箱自动摄入

主控可以使用发件箱读取工具，主动摄入来自 CLI 工作者的发件箱消息，从而在原生团队/对话投递之外实现事件驱动的监控。

### 发件箱读取函数

**`readNewOutboxMessages(teamName, workerName)`** -- 使用字节偏移游标读取单个工作者的新发件箱消息。每次调用都会推进游标，因此后续调用只返回上次读取之后写入的消息。与 `readNewInboxMessages()` 的收件箱游标模式一致。

**`readAllTeamOutboxMessages(teamName)`** -- 读取一个团队中所有工作者的新发件箱消息。返回 `{ workerName, messages }` 条目数组，并跳过没有新消息的工作者。适用于监控循环中的批量轮询。

**`resetOutboxCursor(teamName, workerName)`** -- 把某个工作者的发件箱游标重置回字节 0。适用于主控重启后重读历史消息，或用于调试。

### 在监控阶段使用 `getTeamStatus()`

`getTeamStatus(teamName, workingDirectory, heartbeatMaxAgeMs?)` 函数提供一个统一快照，其中组合了：

- **工作者注册情况** -- 哪些 MCP 工作者已注册（来自影子注册表 / config.json）
- **心跳新鲜度** -- 依据心跳时龄判断每个工作者是否存活
- **任务进度** -- 每个工作者和整个团队的任务计数（pending、in_progress、completed）
- **当前任务** -- 每个工作者正在执行哪个任务
- **最近发件箱消息** -- 自上次状态检查以来的新消息

监控循环中的用法示例：

```typescript
const status = getTeamStatus("fix-ts-errors", workingDirectory);

for (const worker of status.workers) {
  if (!worker.isAlive) {
    // 工作者已死 —— 改派它进行中的任务
  }
  for (const msg of worker.recentMessages) {
    if (msg.type === "task_complete") {
      // 把任务标记为完成，解除依赖方的阻塞
    } else if (msg.type === "task_failed") {
      // 处理失败，可能重试或改派
    } else if (msg.type === "error") {
      // 记录错误，检查该工作者是否需要干预
    }
  }
}

if (status.taskSummary.pending === 0 && status.taskSummary.inProgress === 0) {
  // 全部工作已完成 —— 继续进入关闭流程
}
```

### 基于发件箱消息的事件动作

| 消息类型        | 动作                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------- |
| `task_complete` | 把任务标记为已完成，检查被阻塞的任务是否已解除阻塞，并通知依赖它的工作者                    |
| `task_failed`   | 累加失败 sidecar 计数，决定重试、改派还是跳过                                               |
| `idle`          | 工作者没有已指派任务 —— 分配待处理工作，或开始关闭                                           |
| `error`         | 记录错误，检查心跳中的 `consecutiveErrors` 以判断是否达到隔离阈值                            |
| `shutdown_ack`  | 工作者已确认关闭 —— 可以从团队中移除                                                        |
| `heartbeat`     | 更新存活跟踪（与心跳文件重复，但对延迟监控有用）                                            |

这种方式通过为无法使用 Claude Code 团队消息工具的 MCP 工作者提供拉取式机制，补充了原生团队/对话消息。

## 错误处理

### 队友任务失败

1. 队友通过当前团队/对话界面把失败汇报给主控
2. 主控决定：重试（把同一任务改派给同一或另一工作者）还是跳过
3. 若要改派：用新的负责人更新当前任务列表条目，然后通过当前团队界面通知新负责人

### 队友卡住（没有消息）

1. 主控通过 TodoWrite 或当前任务列表界面发现 —— 任务在 `in_progress` 停留过久
2. 主控通过当前团队界面向该队友发消息，询问状态
3. 若没有响应，则视为该队友已死
4. 通过当前任务列表界面把任务改派给另一个工作者

### 依赖被阻塞

1. 若某个起阻塞作用的任务失败，主控必须决定：
   - 重试该阻塞任务
   - 通过更新当前任务列表条目的 `blockedBy` 元数据来移除依赖
   - 完全跳过被阻塞的任务
2. 通过当前团队界面把决定告知受影响的队友

### 队友崩溃

1. 该队友的内部跟踪会显示异常状态
2. 主控把孤儿任务改派给剩余工作者
3. 如有需要，用 `Task(name="worker-N", subagent_type="...")` 派生替补队友

## Team + Ralph 组合

当用户调用 `/team ralph`、说出 "team ralph"，或把两个关键词组合在一起时，team 模式会把自身包进 Ralph 的持久化循环。这提供：

- **Team 编排** -- 每个阶段都使用专用代理的多代理分阶段流水线
- **Ralph 持久化** -- 失败重试、完成前由架构师校验、迭代跟踪

### 激活条件

Team+Ralph 在以下情况下激活：

1. 用户调用 `/team ralph "task"` 或 `/oh-my-claudecode:team ralph "task"`
2. 关键词检测器在提示中同时找到 `team` 和 `ralph`
3. 钩子在团队上下文中检测到 `MAGIC KEYWORD: RALPH`

### 状态关联

两种模式各自写入自己的状态文件，并相互交叉引用：

```
// Team 状态（通过 state_write）
state_write(mode="team", active=true, current_phase="team-plan", state={
  "team_name": "build-rest-api",
  "linked_ralph": true,
  "task": "构建一套完整的 REST API"
})

// Ralph 状态（通过 state_write）
state_write(mode="ralph", active=true, iteration=1, max_iterations=10, current_phase="execution", state={
  "linked_team": true,
  "team_name": "build-rest-api"
})
```

### 执行流程

1. Ralph 外层循环开始（第 1 次迭代）
2. Team 流水线运行：`team-plan -> team-prd -> team-exec -> team-verify`
3. 若 `team-verify` 通过：Ralph 运行架构师校验（最低 STANDARD 档）
4. 若架构师批准：两种模式都完成，运行 `/oh-my-claudecode:cancel`
5. 若 `team-verify` 失败或架构师否决：team 进入 `team-fix`，然后回到 `team-exec -> team-verify` 循环
6. 若修复循环超过 `max_fix_loops`：Ralph 递增迭代次数并重试整条流水线
7. 若 Ralph 超过 `max_iterations`：进入终态 `failed`

### 取消

取消任一模式都会取消两者：

- **取消 Ralph（已关联）：** 先取消 Team（优雅关闭），然后清理 Ralph 状态
- **取消 Team（已关联）：** 清理 Team，把 Ralph 迭代标记为已取消，停止循环

详见下文「取消」一节。

## 幂等恢复

若主控在运行中途崩溃，团队技能应检测既有的 OMC 状态并恢复：

1. 读取 `state_read(mode="team")`，获取当前 OMC 团队 slug、阶段和工作者标签
2. 使用 OMC 交接文档和任务列表/TodoWrite 状态判断当前进度
3. 恢复监控模式，而不是重复派生队友
4. 从最后记录的阶段继续

这样可以避免重复派生工作者，并能从主控故障中优雅恢复。

## 对比：Team 与遗留 Swarm

| 方面                    | Team（原生 Claude Code 2.1.178+）                                | Swarm（遗留 SQLite）                   |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| **存储**                | OMC 状态/交接文档，加上 Claude Code 当前的任务列表界面           | SQLite，位于 `.omc/state/swarm.db`     |
| **依赖**                | 不需要 `better-sqlite3`                                          | 需要 `better-sqlite3` npm 包           |
| **任务认领**            | 主控通过任务列表/TodoWrite 状态预先指派具名工作者                | SQLite IMMEDIATE 事务 —— 原子操作      |
| **竞态条件**            | 若两个代理认领同一任务则可能发生（通过预先指派来缓解）           | 无（SQLite 事务）                      |
| **通信**                | 原生隐式团队消息 / 对话轮次                                      | 无（发后不管的代理）                   |
| **任务依赖**            | 由主控在任务列表/TodoWrite 状态中管理依赖                        | 不支持                                 |
| **心跳**                | 主控通过缺失的消息/状态发现                                      | 手动心跳表 + 轮询                      |
| **关闭**                | 优雅的请求/响应协议，加上 OMC 状态清理                           | 基于信号的终止                         |
| **代理生命周期**        | 通过具名 Agent/Task 派生和 OMC 状态跟踪                          | 通过心跳表手动跟踪                     |
| **进度可见性**          | 带具名工作者归属的任务列表/TodoWrite 状态                        | 对 tasks 表做 SQL 查询                 |
| **冲突预防**            | 负责人标签（由主控指派）                                         | 带超时的租约式认领                     |
| **崩溃恢复**            | 主控通过缺失的消息发现并改派                                     | 租约 5 分钟超时后自动释放              |
| **状态清理**            | 在队友关闭后清理 OMC 团队状态                                    | 手动 `rm` 删除 SQLite 数据库           |

**何时该用 Team 而不是 Swarm：** 新的原生 Claude Code 工作一律优先用 `/team`。它使用 Claude Code 的隐式代理团队，不需要外部依赖，支持代理间协调，并且有任务依赖管理。

## 取消

`/oh-my-claudecode:cancel` 技能负责团队清理：

1. 通过 `state_read(mode="team")` 读取团队状态，获取 `team_name` 和 `linked_ralph`
2. 通过当前团队界面请求所有仍在活动的具名队友关闭
3. 等待每个队友返回 `shutdown_response`（每个成员 15 秒超时）
4. 通过 `state_clear(mode="team")` 清理状态
5. 若 `linked_ralph` 为 true，也清理 ralph：`state_clear(mode="ralph")`

### 关联模式的取消（Team + Ralph）

当 team 与 ralph 关联时，取消按依赖顺序进行：

- **从 Ralph 上下文触发取消：** 先取消 Team（优雅关闭所有队友），然后清理 Ralph 状态。这确保工作者在持久化循环退出之前就已经停止。
- **从 Team 上下文触发取消：** 清理 Team 状态，然后把 Ralph 标记为已取消。Ralph 的停止钩子会检测到团队缺失，并停止迭代。
- **强制取消（`--force`）：** 通过 `state_clear` 无条件清理 `team` 和 `ralph` 两者的状态。

若队友无响应，记录该超时，避免再派生新工作，并且只在关闭等待结束或用户强制取消之后才清理 OMC 状态。

## 运行时 V2（事件驱动）

设置 `OMC_RUNTIME_V2=1` 时，团队运行时会改用事件驱动架构，而不再使用遗留的 done.json 轮询看门狗：

- **没有 done.json**：任务完成通过 CLI API 生命周期转换（claim-task、transition-task-status）来检测
- **基于快照的监控**：每个轮询周期都对任务与工作者取一次时点快照，计算增量并发出事件
- **事件日志**：所有团队事件都追加写入 `.omc/state/team/{teamName}/events.jsonl`
- **工作者状态文件**：工作者把状态写入 `.omc/state/team/{teamName}/workers/{name}/status.json`
- **保留的机制**：哨兵门禁（阻止过早完成）、熔断器（检测死亡工作者）、失败 sidecar

v2 运行时由特性开关控制，可按会话启用。遗留的 v1 运行时仍是默认值。

## 动态扩缩容

设置 `OMC_TEAM_SCALING_ENABLED=1` 时，团队支持会话中途扩缩容：

- **scale_up**：向正在运行的团队添加工作者（遵守 max_workers 上限）
- **scale_down**：以优雅排空的方式移除空闲工作者（工作者先完成当前任务，然后才被移除）
- 基于文件的扩缩容锁可防止并发的扩缩容操作
- 单调递增的工作者索引计数器，确保跨扩缩容事件的工作者名唯一

## 配置

可选设置位于 `.claude/omc.jsonc`（项目）或 `~/.config/claude-omc/config.jsonc`（用户）。项目值覆盖用户值；`OMC_TEAM_ROLE_OVERRIDES`（env JSON）的优先级高于两者。

```jsonc
{
  "team": {
    "ops": {
      "maxAgents": 20,
      "defaultAgentType": "claude",
      "monitorIntervalMs": 30000,
      "shutdownTimeoutMs": 15000,
    },
  },
}
```

- **ops.maxAgents** - 队友数量上限（默认：20）
- **ops.defaultAgentType** - 当 `/team` 调用未指明时使用的 CLI 提供方（`claude` | `codex` | `gemini` | `antigravity` | `grok` | `cursor`，默认：`claude`）
- **ops.monitorIntervalMs** - 查看 TodoWrite 或当前任务列表界面的频率（默认：30s）
- **ops.shutdownTimeoutMs** - 等待关闭响应的时长（默认：15s）

> **注意：** 队友没有硬编码的默认模型。每个队友都是一个独立的 Claude Code 会话，继承用户配置的模型。由于队友可以派生出自己的子代理，会话模型充当编排层，而子代理可以使用任意模型档位。

## 按角色的提供方与模型路由

> **适用范围：** 仅适用于 `/team`。基于任务的委派使用 `delegationRouting`（见单独文档）。两套系统按设计共存。

声明每个规范角色应由哪个提供方（`claude`、`codex`、`gemini`、`antigravity`、`grok`、`cursor`）和哪个模型档位支撑。路由在团队创建时**一次性**解析，并持久化到 `TeamConfig.resolved_routing` —— 派生、扩容和重启都从该快照读取，因此某个角色的工作者 CLI 和模型在团队整个生命周期内保持稳定。

### 示例 —— 用户目标映射

```jsonc
// .claude/omc.jsonc
{
  "team": {
    "roleRouting": {
      "orchestrator": { "model": "inherit" },
      "planner": { "provider": "claude", "model": "HIGH" },
      "analyst": { "provider": "claude", "model": "HIGH" },
      "executor": { "provider": "claude", "model": "MEDIUM" },
      "debugger": { "provider": "cursor" },
      "critic": { "provider": "codex" },
      "code-reviewer": { "provider": "gemini" },
      "test-engineer": { "provider": "gemini", "model": "MEDIUM" },
    },
  },
}
```

| 角色            | 提供方          | 模型                      |
| --------------- | --------------- | ------------------------- |
| `orchestrator`  | claude（固定）  | 继承发起调用的会话        |
| `planner`       | claude          | `HIGH`（opus）            |
| `analyst`       | claude          | `HIGH`（opus）            |
| `executor`      | claude          | `MEDIUM`（sonnet）        |
| `debugger`      | cursor          | cursor-agent 默认         |
| `critic`        | codex           | codex 默认                |
| `code-reviewer` | gemini          | gemini 默认               |
| `test-engineer` | antigravity     | antigravity 默认          |

### 规范角色

`orchestrator`, `planner`, `analyst`, `architect`, `executor`, `debugger`, `critic`, `code-reviewer`, `security-reviewer`, `test-engineer`, `designer`, `writer`, `code-simplifier`, `explore`, `document-specialist`.

用户友好的别名通过 `normalizeDelegationRole()` 规范化 —— 例如 `reviewer` → `code-reviewer`、`quality-reviewer` → `code-reviewer`、`harsh-critic` → `critic`、`build-fixer` → `debugger`。被接受的别名键在解析快照创建以及后续阶段路由时都会生效，而不只是在校验时生效。未知角色会在解析阶段校验失败。

### 规格字段（`TeamRoleAssignmentSpec`）

- **provider** —— `"claude" | "codex" | "gemini" | "antigravity" | "grok" | "cursor"`。省略时 → 默认为 `claude`。
- **model** —— 档位名（`"HIGH" | "MEDIUM" | "LOW"`）或显式的模型 ID。档位通过 `routing.tierModels` 解析。
- **agent** —— 可选的 Claude 代理名（例如 `"critic"`、`"executor"`）。仅当解析出的提供方为 `claude` 时才会生效。

`orchestrator` 固定为 `claude`；只有 `model` 可由用户配置。`orchestrator` 上的任何其它键都会被校验器拒绝。

`cursor` 会把 `cursor-agent` 作为交互式执行器/重构工作者启动。不要把审查/裁决类角色（`critic`、`code-reviewer`、`security-reviewer`、`test-engineer`）路由到 Cursor，除非其 CLI 具备兼容的裁决输出模式；运行时会刻意对 Cursor 窗格跳过结构化裁决契约。

### 环境变量覆盖

```bash
OMC_TEAM_ROLE_OVERRIDES='{"critic":{"provider":"codex"},"code-reviewer":{"provider":"gemini"}}'
```

优先级：`OMC_TEAM_ROLE_OVERRIDES` > `.claude/omc.jsonc`（项目）> `~/.config/claude-omc/config.jsonc`（用户）> 内置默认值。无效 JSON 会记录警告并被忽略 —— 环境变量覆盖是尽力而为的，绝不中断运行。

### 缺少某个 CLI 时的回退

若在派生时，配置的提供方 CLI 不在 `PATH` 中，`buildLaunchArgs()` 会抛错，团队主控会发出可见的团队/对话警告，运行时会回退到由 `buildResolvedRoutingSnapshot` 预先计算好的确定性 Claude 指派（同档位 + 同代理，`provider: "claude"`）。回退是刻意显式的 —— 静默回退属于测试失败。可用 `omc doctor --team-routing` 探测提供方可用性。

### 粘性 —— 只解析一次，处处复用

解析后的路由对每个团队都是不可变的。在团队生命周期中途编辑配置不会影响正在运行的团队；新的 `/team` 调用会采用新的映射。这保证派生、扩容和工作者重启看到的都是同一套路由，包括跨 worktree 分离的场景（快照随 `TeamConfig` 一起传递）。

### 零配置行为

空的 `team.roleRouting` 会保持补丁前的行为：每个工作者都是 Claude，模型档位遵循 `routing.tierModels`，并且 `/team 3:executor ...` 仍会派生三个 Claude Sonnet 执行器。

## 状态清理

成功完成时：

1. 原生 Claude Code 2.1.178+ 没有按团队的 `TeamDelete` 清理。在关闭被确认或超时后，通过 MCP 工具清理 OMC 状态：
   ```
   state_clear(mode="team")
   ```
   若关联到 Ralph：
   ```
   state_clear(mode="ralph")
   ```
2. 对于遗留的 OMC tmux/CLI 工作者，运行文档所述的 `omc team shutdown` / 清理路径。
3. 或者运行 `/oh-my-claudecode:cancel`，它会自动处理 OMC 状态清理。

**重要：** 只有在所有队友都已关闭或超时之后，才清理 OMC 团队状态。

## Git Worktree 集成

MCP 工作者可以在隔离的 git worktree 中运作，以避免并发工作者之间的文件冲突。

### 工作原理

1. **创建 worktree**：在派生工作者之前，调用 `createWorkerWorktree(teamName, workerName, repoRoot)`，在 `.omc/worktrees/{team}/{worker}` 创建隔离的 worktree，其分支为 `omc-team/{teamName}/{workerName}`。

2. **工作者隔离**：把 worktree 路径作为 `workingDirectory` 传进工作者的 `BridgeConfig`。该工作者只在自己的 worktree 中运作。

3. **合并协调**：某工作者完成任务后，用 `checkMergeConflicts()` 核验该分支能否干净合并，然后用 `mergeWorkerBranch()` 以 `--no-ff` 合并，以获得清晰的历史。

4. **团队清理**：团队关闭时，调用 `cleanupTeamWorktrees(teamName, repoRoot)` 删除所有 worktree 及其分支。

### API 参考

| 函数                                                                | 说明                           |
| ------------------------------------------------------------------- | ------------------------------ |
| `createWorkerWorktree(teamName, workerName, repoRoot, baseBranch?)` | 创建隔离的 worktree            |
| `removeWorkerWorktree(teamName, workerName, repoRoot)`              | 移除 worktree 及分支           |
| `listTeamWorktrees(teamName, repoRoot)`                             | 列出团队的所有 worktree        |
| `cleanupTeamWorktrees(teamName, repoRoot)`                          | 移除团队的所有 worktree        |
| `checkMergeConflicts(workerBranch, baseBranch, repoRoot)`           | 非破坏性的冲突检查             |
| `mergeWorkerBranch(workerBranch, baseBranch, repoRoot)`             | 合并工作者分支（--no-ff）       |
| `mergeAllWorkerBranches(teamName, repoRoot, baseBranch?)`           | 合并所有已完成的工作者         |

### 重要说明

- `tmux-session.ts` 中的 `createSession()` **不**处理 worktree 创建 —— worktree 生命周期由 `git-worktree.ts` 单独管理
- worktree **不会**在单个工作者关闭时清理 —— 只在团队关闭时清理，以便事后检查
- 分支名通过 `sanitizeName()` 做净化，以防注入
- 所有路径都会做目录穿越校验

## 易踩的坑

1. **内部/生命周期任务条目可能污染任务列表输出** -- 若 Claude Code 为派生的队友报告内部生命周期条目，在统计真实任务进度时应把它们过滤掉。内部任务的 subject 常常就是队友的名字。

2. **没有原子认领** -- 与 SQLite swarm 不同，原生任务列表/TodoWrite 状态不提供事务式认领。两个队友可能竞相认领同一个任务。**缓解措施：** 主控应在派生队友之前预先指派负责人。队友只应处理指派给它们的任务。

3. **任务列表工具暴露的任务 ID 是字符串** -- ID 可能是自增字符串（"1"、"2"、"3"），而不是整数。使用任务列表工具时，务必给 `taskId` 字段传字符串值。

4. **没有 TeamDelete 清理** -- Claude Code 2.1.178+ 移除了 `TeamDelete`；请改用关闭消息加上 OMC 状态清理。

5. **消息是自动投递的** -- 队友消息会作为新的对话轮次到达主控。入站消息不需要轮询或检查收件箱。但是，若主控正处于某个轮次之中（正在处理），消息会排队，并在该轮次结束时投递。

6. **不要把密钥放进队友提示** -- 提示可能被保留在日志、状态或对话历史中。不要让凭据和敏感数据进入队友提示。

7. **关闭确认属于状态/报告事件** -- 队友批准关闭并终止后，请在 OMC 状态/报告中记录该确认。不要指望 Claude Code 的团队成员配置会更新。

8. **shutdown_response 需要 request_id** -- 队友必须从收到的关闭请求 JSON 中提取 `request_id` 并回传。格式是 `shutdown-{timestamp}@{worker-name}`。伪造该 ID 会导致关闭静默失败。

9. **团队名必须是有效的 slug** -- 使用小写字母、数字和连字符。从任务描述派生（例如 "fix TypeScript errors" 会变成 "fix-ts-errors"）。

10. **广播开销大** -- 每次广播都会给每个队友单独发一条消息。默认使用 `message`（私信）。只在真正需要全团队的关键告警时才广播。

11. **CLI 工作者是一次性的，不是常驻的** -- Tmux CLI 工作者拥有完整文件系统访问权限，**能**修改代码。但是，它们以自主的一次性作业方式运行 -- 它们无法使用 Claude Code 原生的任务列表或团队消息界面。主控必须管理它们的生命周期：写 prompt_file、派生 CLI 工作者、读 output_file、把任务标记为完成。它们不像 Claude 队友那样参与团队通信。

## 并行会话的注意事项

- **多仓库工作区锚点：** 在父目录放置一个 `.omc-workspace` 标记，让跨多个子仓库的多个会话共享同一个 `.omc/`。解析顺序：`OMC_STATE_DIR > .omc-workspace > git > cwd`。见 `docs/REFERENCE.md`。
- **会话 id 来源：** 在 CLI 上下文中 OMC_SESSION_ID 环境变量优先；在钩子上下文中，钩子载荷里的 data.session_id 优先。
- **计划 id（如适用）：** 团队状态是会话级的。位于 `.omc/handoffs/` 的团队交接文档按设计是共享的（见工作区计划中的 Wave G）。
- **并行裁决：** 支持（按设计为会话级 + 共享交接文档）
