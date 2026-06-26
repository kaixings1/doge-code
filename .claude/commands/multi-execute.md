# 执行 - 多模型协作执行 (Multi-Model Collaborative Execution)

多模型协作执行 - 从方案获取原型 → Claude 重构并实现 → 多模型审计与交付。

$ARGUMENTS

---

## 核心协议 (Core Protocols)

- **语言协议 (Language Protocol)**：与工具/模型交互时使用 **英语**，与用户交流时使用用户的母语
- **代码主权 (Code Sovereignty)**：外部模型 **没有文件系统写入权限**，所有修改均由 Claude 执行
- **粗糙原型重构 (Dirty Prototype Refactoring)**：将 Codex/Gemini 的 Unified Diff 视为“粗糙原型”，必须重构为生产级代码
- **止损机制 (Stop-Loss Mechanism)**：在当前阶段输出通过验证前，不得进入下一阶段
- **前提条件 (Prerequisite)**：仅在用户对 `/ccg:plan` 的输出明确回复 "Y" 后执行（如果缺失，必须先确认）

---

## 多模型调用规范 (Multi-Model Call Specification)

**调用语法**（并行：使用 `run_in_background: true`）：

```
# 恢复会话调用（推荐）- 实现原型
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend <codex|gemini> {{GEMINI_MODEL_FLAG}}resume <SESSION_ID> - \"$PWD\" <<'EOF'
ROLE_FILE: <role prompt path>
<TASK>
Requirement: <task description>
Context: <plan content + target files>
</TASK>
OUTPUT: Unified Diff Patch ONLY. Strictly prohibit any actual modifications.
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Brief description"
})

# 新会话调用 - 实现原型
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend <codex|gemini> {{GEMINI_MODEL_FLAG}}- \"$PWD\" <<'EOF'
ROLE_FILE: <role prompt path>
<TASK>
Requirement: <task description>
Context: <plan content + target files>
</TASK>
OUTPUT: Unified Diff Patch ONLY. Strictly prohibit any actual modifications.
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Brief description"
})
```

**审计调用语法**（代码审查 / 审计）：

```
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend <codex|gemini> {{GEMINI_MODEL_FLAG}}resume <SESSION_ID> - \"$PWD\" <<'EOF'
ROLE_FILE: <role prompt path>
<TASK>
Scope: Audit the final code changes.
Inputs:
- The applied patch (git diff / final unified diff)
- The touched files (relevant excerpts if needed)
Constraints:
- Do NOT modify any files.
- Do NOT output tool commands that assume filesystem access.
</TASK>
OUTPUT:
1) A prioritized list of issues (severity, file, rationale)
2) Concrete fixes; if code changes are needed, include a Unified Diff Patch in a fenced code block.
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Brief description"
})
```

**模型参数说明**：
- `{{GEMINI_MODEL_FLAG}}`：使用 `--backend gemini` 时，替换为 `--gemini-model gemini-3-pro-preview`（注意末尾空格）；对于 codex 使用空字符串

**角色提示词 (Role Prompts)**：

| 阶段 | Codex | Gemini |
|-------|-------|--------|
| 实现 (Implementation) | `~/.claude/.ccg/prompts/codex/architect.md` | `~/.claude/.ccg/prompts/gemini/frontend.md` |
| 审查 (Review) | `~/.claude/.ccg/prompts/codex/reviewer.md` | `~/.claude/.ccg/prompts/gemini/reviewer.md` |

**会话复用 (Session Reuse)**：如果 `/ccg:plan` 提供了 SESSION_ID，使用 `resume <SESSION_ID>` 来复用上下文。

**等待后台任务**（最大超时时间 600000ms = 10 分钟）：

```
TaskOutput({ task_id: "<task_id>", block: true, timeout: 600000 })
```

**重要提示**：
- 必须指定 `timeout: 600000`，否则默认的 30 秒会导致过早超时
- 如果 10 分钟后仍未完成，继续使用 `TaskOutput` 轮询，**严禁终止进程**
- 如果由于超时跳过了等待，**必须调用 `AskUserQuestion` 询问用户是继续等待还是终止任务**

---

## 执行工作流 (Execution Workflow)

**执行任务**：$ARGUMENTS

### 阶段 0：读取方案 (Read Plan)

`[模式：准备 (Prepare)]`

1. **识别输入类型**：
   - 方案文件路径（例如 `.claude/plan/xxx.md`）
   - 直接任务描述

2. **读取方案内容**：
   - 如果提供了方案文件路径，读取并解析
   - 提取：任务类型、实现步骤、关键文件、SESSION_ID

3. **执行前确认**：
   - 如果输入是“直接任务描述”或方案缺少 `SESSION_ID` / 关键文件：先向用户确认
   - 如果无法确认用户对方案回复了 "Y"：在继续之前必须再次确认

4. **任务类型路由**：

   | 任务类型 | 检测 | 路由 |
   |-----------|-----------|-------|
   | **前端 (Frontend)** | 页面、组件、UI、样式、布局 | Gemini |
   | **后端 (Backend)** | API、接口、数据库、逻辑、算法 | Codex |
   | **全栈 (Fullstack)** | 同时包含前端和后端 | Codex ∥ Gemini 并行 |

---

### 阶段 1：快速上下文检索 (Quick Context Retrieval)

`[模式：检索 (Retrieval)]`

**必须使用 MCP 工具进行快速上下文检索，不要逐个手动读取文件**

根据方案中的“关键文件”列表，调用 `mcp__ace-tool__search_context`：

```
mcp__ace-tool__search_context({
  query: "<基于方案内容的语义查询，包括关键文件、模块、函数名>",
  project_root_path: "$PWD"
})
```

**检索策略**：
- 从方案的“关键文件”表格中提取目标路径
- 构建覆盖以下内容的语义查询：入口文件、依赖模块、相关类型定义
- 如果结果不足，增加 1-2 次递归检索
- **严禁**使用 Bash + find/ls 手动探索项目结构

**检索后**：
- 整理检索到的代码片段
- 确认实现的完整上下文
- 进入阶段 3

---

### 阶段 3：获取原型 (Prototype Acquisition)

`[模式：原型 (Prototype)]`

**基于任务类型进行路由**：

#### 路由 A：前端/UI/样式 → Gemini

**限制**：上下文 < 32k tokens

1. 调用 Gemini（使用 `~/.claude/.ccg/prompts/gemini/frontend.md`）
2. 输入：方案内容 + 检索到的上下文 + 目标文件
3. 输出 (OUTPUT)：`Unified Diff Patch ONLY. Strictly prohibit any actual modifications.`
4. **Gemini 是前端设计权威，其 CSS/React/Vue 原型是最终视觉基准**
5. **警告**：忽略 Gemini 的后端逻辑建议
6. 如果方案包含 `GEMINI_SESSION`：优先使用 `resume <GEMINI_SESSION>`

#### 路由 B：后端/逻辑/算法 → Codex

1. 调用 Codex（使用 `~/.claude/.ccg/prompts/codex/architect.md`）
2. 输入：方案内容 + 检索到的上下文 + 目标文件
3. 输出 (OUTPUT)：`Unified Diff Patch ONLY. Strictly prohibit any actual modifications.`
4. **Codex 是后端逻辑权威，利用其逻辑推理和调试能力**
5. 如果方案包含 `CODEX_SESSION`：优先使用 `resume <CODEX_SESSION>`

#### 路由 C：全栈 → 并行调用

1. **并行调用** (`run_in_background: true`)：
   - Gemini：处理前端部分
   - Codex：处理后端部分
2. 使用 `TaskOutput` 等待两个模型的完整结果
3. 每个模型分别使用方案中对应的 `SESSION_ID` 进行 `resume`（如果缺失则创建新会话）

**请遵循上方“多模型调用规范”中的“重要提示”说明**

---

### 阶段 4：代码实现 (Code Implementation)

`[模式：实现 (Implement)]`

**Claude 作为代码主权执行以下步骤**：

1. **读取 Diff**：解析 Codex/Gemini 返回的 Unified Diff 补丁

2. **思维沙盒 (Mental Sandbox)**：
   - 模拟将 Diff 应用于目标文件
   - 检查逻辑一致性
   - 识别潜在冲突或副作用

3. **重构与清理 (Refactor and Clean)**：
   - 将“粗糙原型”重构为**高可读性、可维护的工程级代码**
   - 移除冗余代码
   - 确保符合项目现有的代码规范
   - **除非必要，不要生成注释/文档**，代码应当能够自解释

4. **最小范围 (Minimal Scope)**：
   - 修改仅限于需求范围
   - **强制审查**副作用
   - 进行针对性修正

5. **应用更改**：
   - 使用编辑/写入工具执行实际修改
   - **仅修改必要的代码**，严禁影响用户的其他现有功能

6. **自验证 (Self-Verification)**（强烈建议）：
   - 运行项目现有的 lint / 类型检查 / 测试（优先针对最小相关范围）
   - 如果失败：先修复回归问题，然后进入阶段 5

---

### 阶段 5：审计与交付 (Audit and Delivery)

`[模式：审计 (Audit)]`

#### 5.1 自动审计

**在更改生效后，必须立即并行调用** Codex 和 Gemini 进行代码审查 (Code Review)：

1. **Codex 审查** (`run_in_background: true`)：
   - ROLE_FILE: `~/.claude/.ccg/prompts/codex/reviewer.md`
   - 输入：修改后的 Diff + 目标文件
   - 关注点：安全性、性能、错误处理、逻辑正确性

2. **Gemini 审查** (`run_in_background: true`)：
   - ROLE_FILE: `~/.claude/.ccg/prompts/gemini/reviewer.md`
   - 输入：修改后的 Diff + 目标文件
   - 关注点：可访问性、设计一致性、用户体验

使用 `TaskOutput` 等待两个模型的完整审查结果。为了上下文一致性，优先复用阶段 3 的会话 (`resume <SESSION_ID>`)。

#### 5.2 整合与修复

1. 综合 Codex + Gemini 的审查反馈
2. 根据信任规则进行权衡：后端遵循 Codex，前端遵循 Gemini
3. 执行必要的修复
4. 根据需要重复阶段 5.1（直到风险可接受）

#### 5.3 交付确认

审计通过后，向用户汇报：

```markdown
## 执行完成 (Execution Complete)

### 修改摘要 (Change Summary)
| 文件 | 操作 | 说明 |
|------|-----------|-------------|
| path/to/file.ts | 已修改 | 说明文字 |

### 审计结果 (Audit Results)
- Codex: <通过/发现 N 个问题>
- Gemini: <通过/发现 N 个问题>

### 建议 (Recommendations)
1. [ ] <建议的测试步骤>
2. [ ] <建议的验证步骤>
```

---

## 关键规则 (Key Rules)

1. **代码主权 (Code Sovereignty)** – 所有文件修改均由 Claude 执行，外部模型没有写入权限
2. **粗糙原型重构 (Dirty Prototype Refactoring)** – Codex/Gemini 的输出被视为草稿，必须进行重构
3. **信任规则 (Trust Rules)** – 后端遵循 Codex，前端遵循 Gemini
4. **最小化更改 (Minimal Changes)** – 仅修改必要的代码，不引入副作用
5. **强制审计 (Mandatory Audit)** – 更改后必须执行多模型代码审查 (Code Review)

---

## 使用方法 (Usage)

```bash
# 执行方案文件
/ccg:execute .claude/plan/feature-name.md

# 直接执行任务（针对上下文中已讨论过的方案）
/ccg:execute implement user authentication based on previous plan
```

---

## 与 /ccg:plan 的关系 (Relationship with /ccg:plan)

1. `/ccg:plan` 生成方案 + SESSION_ID
2. 用户回复 "Y" 进行确认
3. `/ccg:execute` 读取方案，复用 SESSION_ID，执行实现内容
