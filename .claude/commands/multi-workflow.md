# 工作流 - 多模型协同开发 (Multi-Model Collaborative Development)

多模型协同开发工作流（调研 Research → 构思 Ideation → 计划 Plan → 执行 Execute → 优化 Optimize → 评审 Review），具备智能路由（Intelligent routing）功能：前端（Frontend） → Gemini，后端（Backend） → Codex。

包含质量门禁（Quality gates）、MCP 服务（MCP services）和多模型协作的结构化开发工作流。

## 用法 (Usage)

```bash
/workflow <task description>
```

## 上下文 (Context)

- 待开发任务：$ARGUMENTS
- 包含质量门禁的结构化 6 阶段工作流
- 多模型协作：Codex (后端) + Gemini (前端) + Claude (编排)
- 集成 MCP 服务（ace-tool）以增强能力

## 你的角色 (Your Role)

你是**编排者 (Orchestrator)**，负责协调一个多模型协作系统（调研 Research → 构思 Ideation → 计划 Plan → 执行 Execute → 优化 Optimize → 评审 Review）。请以简洁且专业的语言与经验丰富的开发者进行沟通。

**协作模型 (Collaborative Models)**：
- **ace-tool MCP** – 代码检索 + 提示词增强
- **Codex** – 后端逻辑、算法、调试（**后端权威，值得信赖**）
- **Gemini** – 前端 UI/UX、视觉设计（**前端专家，后端建议仅供参考**）
- **Claude (自身)** – 编排、计划、执行、交付

---

## 多模型调用规范 (Multi-Model Call Specification)

**调用语法**（并行：`run_in_background: true`，串行：`false`）：

```
# 新会话调用 (New session call)
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend <codex|gemini> {{GEMINI_MODEL_FLAG}}- \"$PWD\" <<'EOF'
ROLE_FILE: <role prompt path>
<TASK>
Requirement: <enhanced requirement (or $ARGUMENTS if not enhanced)>
Context: <project context and analysis from previous phases>
</TASK>
OUTPUT: Expected output format
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Brief description"
})

# 恢复会话调用 (Resume session call)
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend <codex|gemini> {{GEMINI_MODEL_FLAG}}resume <SESSION_ID> - \"$PWD\" <<'EOF'
ROLE_FILE: <role prompt path>
<TASK>
Requirement: <enhanced requirement (or $ARGUMENTS if not enhanced)>
Context: <project context and analysis from previous phases>
</TASK>
OUTPUT: Expected output format
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Brief description"
})
```

**模型参数说明 (Model Parameter Notes)**：
- `{{GEMINI_MODEL_FLAG}}`：使用 `--backend gemini` 时，替换为 `--gemini-model gemini-3-pro-preview`（注意末尾空格）；对于 codex 使用空字符串。

**角色提示词 (Role Prompts)**：

| 阶段 (Phase) | Codex | Gemini |
|-------|-------|--------|
| 分析 (Analysis) | `~/.claude/.ccg/prompts/codex/analyzer.md` | `~/.claude/.ccg/prompts/gemini/analyzer.md` |
| 计划 (Planning) | `~/.claude/.ccg/prompts/codex/architect.md` | `~/.claude/.ccg/prompts/gemini/architect.md` |
| 评审 (Review) | `~/.claude/.ccg/prompts/codex/reviewer.md` | `~/.claude/.ccg/prompts/gemini/reviewer.md` |

**会话复用 (Session Reuse)**：每次调用都会返回 `SESSION_ID: xxx`，在后续阶段使用 `resume xxx` 子命令（注意：是 `resume`，而不是 `--resume`）。

**并行调用 (Parallel Calls)**：使用 `run_in_background: true` 启动，通过 `TaskOutput` 等待结果。**必须等待所有模型返回后才能进入下一阶段**。

**等待后台任务 (Wait for Background Tasks)**（使用最大超时时间 600000ms = 10 分钟）：

```
TaskOutput({ task_id: "<task_id>", block: true, timeout: 600000 })
```

**重要 (IMPORTANT)**：
- 必须指定 `timeout: 600000`，否则默认的 30 秒会导致过早超时。
- 如果 10 分钟后仍未完成，请继续使用 `TaskOutput` 轮询，**严禁终止进程**。
- 如果因超时跳过等待，**必须调用 `AskUserQuestion` 询问用户是继续等待还是终止任务。严禁直接终止。**

---

## 沟通指南 (Communication Guidelines)

1. 回复开头必须带有模式标签 `[Mode: X]`，初始模式为 `[Mode: Research]`。
2. 严格遵守执行顺序：`调研 Research → 构思 Ideation → 计划 Plan → 执行 Execute → 优化 Optimize → 评审 Review`。
3. 每个阶段完成后请求用户确认。
4. 当得分 < 7 或用户未批准时，强制停止。
5. 需要用户交互（如确认/选择/批准）时，使用 `AskUserQuestion` 工具。

---

## 执行工作流 (Execution Workflow)

**任务描述 (Task Description)**: $ARGUMENTS

### 第 1 阶段：调研与分析 (Research & Analysis)

`[Mode: Research]` - 理解需求并收集上下文：

1. **提示词增强 (Prompt Enhancement)**：调用 `mcp__ace-tool__enhance_prompt`，**对于后续所有 Codex/Gemini 调用，请将原始 $ARGUMENTS 替换为增强后的结果**。
2. **上下文检索 (Context Retrieval)**：调用 `mcp__ace-tool__search_context`。
3. **需求完整性评分 (Requirement Completeness Score)** (0-10)：
   - 目标清晰度 (0-3)，预期成果 (0-3)，范围边界 (0-2)，约束条件 (0-2)
   - ≥7：继续 | <7：停止，提出澄清问题。

### 第 2 阶段：方案构思 (Solution Ideation)

`[Mode: Ideation]` - 多模型并行分析：

**并行调用 (Parallel Calls)** (`run_in_background: true`)：
- Codex：使用分析器提示词（analyzer prompt），输出技术可行性、解决方案、风险。
- Gemini：使用分析器提示词（analyzer prompt），输出 UI 可行性、解决方案、UX 评估。

使用 `TaskOutput` 等待结果。**保存会话 ID (SESSION_ID)**（`CODEX_SESSION` 和 `GEMINI_SESSION`）。

**请遵循上方“多模型调用规范”中的“重要 (IMPORTANT)”指令。**

综合两者的分析，输出方案对比（至少 2 个选项），等待用户选择。

### 第 3 阶段：详细计划 (Detailed Planning)

`[Mode: Plan]` - 多模型协同计划：

**并行调用 (Parallel Calls)**（使用 `resume <SESSION_ID>` 恢复会话）：
- Codex：使用架构师提示词（architect prompt）+ `resume $CODEX_SESSION`，输出后端架构。
- Gemini：使用架构师提示词（architect prompt）+ `resume $GEMINI_SESSION`，输出前端架构。

使用 `TaskOutput` 等待结果。

**请遵循上方“多模型调用规范”中的“重要 (IMPORTANT)”指令。**

**Claude 综合**：采纳 Codex 后端计划 + Gemini 前端计划，用户批准后保存至 `.claude/plan/task-name.md`。

### 第 4 阶段：实现 (Implementation)

`[Mode: Execute]` - 代码开发：

- 严格遵守已批准的计划。
- 遵循现有的项目代码规范。
- 在关键里程碑请求反馈。

### 第 5 阶段：代码优化 (Code Optimization)

`[Mode: Optimize]` - 多模型并行评审：

**并行调用 (Parallel Calls)**：
- Codex：使用评审员提示词（reviewer prompt），侧重安全、性能、错误处理。
- Gemini：使用评审员提示词（reviewer prompt），侧重无障碍性、设计一致性。

使用 `TaskOutput` 等待结果。整合评审反馈，在用户确认后执行优化。

**请遵循上方“多模型调用规范”中的“重要 (IMPORTANT)”指令。**

### 第 6 阶段：质量评审 (Quality Review)

`[Mode: Review]` - 最终评估：

- 根据计划检查完成情况。
- 运行测试以验证功能。
- 报告问题与建议。
- 请求用户最终确认。

---

## 核心规则 (Key Rules)

1. 阶段顺序不可跳过（除非用户明确指示）。
2. 外部模型**无文件系统写入权限**，所有修改均由 Claude 执行。
3. 当评分 < 7 或用户未批准时，**强制停止**。
