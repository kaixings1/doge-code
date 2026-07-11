---
name: gsd:discuss-phase
规划前通过自适应提问收集阶段上下文。
argument-hint: "<phase> [--all] [--auto] [--chain] [--batch] [--analyze] [--text] [--power] [--assumptions]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
  - Agent
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
requires: [config, phase]
---

<objective>
提取下游智能体需要的实施决策——研究员和规划者将使用 CONTEXT.md 了解需要调查什么以及哪些选择已被锁定。

**工作原理：**
1. 加载先前的上下文（PROJECT.md、REQUIREMENTS.md、STATE.md、先前的 CONTEXT.md 文件）
2. 侦察代码库以寻找可复用的资产和模式
3. 分析阶段——跳过先前阶段已决定的灰色区域
4. 展示剩余的灰色区域——用户选择要讨论哪些
5. 深入探讨每个选定的区域直到满意
6. 创建包含指导研究和规划的决策的 CONTEXT.md

**输出：** `{phase_num}-CONTEXT.md`——决策足够清晰，下游智能体无需再次询问用户即可行动
</objective>

<execution_context>
工作流文件在下面的 <process> 部分按需加载——不预先加载。
在阅读模式路由指示之前，不要预加载任何工作流文件。
</execution_context>

<runtime_note>
**Copilot (VS Code)：** 在此工作流调用 `AskUserQuestion` 的任何地方使用 `vscode_askquestions`。它们是等效的——`vscode_askquestions` 是 VS Code Copilot 实现的相同交互式问题 API。
</runtime_note>

<context>
阶段编号：$ARGUMENTS（必需）

上下文文件使用 `init phase-op` 和路线图/状态工具调用在工作流内解析。
</context>

<process>
**模式路由：**
```bash
DISCUSS_MODE=$(gsd-sdk query config-get workflow.discuss_mode 2>/dev/null || echo "discuss")
```

如果 `--assumptions` 在 $ARGUMENTS 中：
读取并端到端执行 `~/.claude/get-shit-done/workflows/list-phase-assumptions.md`。
在此停止。

否则，如果 `DISCUSS_MODE` 为 `"assumptions"`：
读取并端到端执行 `~/.claude/get-shit-done/workflows/discuss-phase-assumptions.md`。

否则（`"discuss"` / 未设置 / 任何其他值）：
读取并端到端执行 `~/.claude/get-shit-done/workflows/discuss-phase.md`。

**强制要求：** 在采取任何行动之前先读取适当的工作流文件。此命令文件中的 objective 和 success_criteria 部分是摘要——工作流文件包含完整的逐步过程，包含所有必需的行为、配置检查和交互模式。不要从摘要中临时应变。

**懒加载：** `templates/context.md` 在活动工作流的 `write_context` 步骤内加载。`discuss-phase-power.md` 在检测到 `--power` 时在 `discuss-phase.md` 内加载。在此处不要加载任何一个。
</process>

<success_criteria>
- 先前的上下文已加载并应用（不再重新询问已决定的问题）
- 通过智能分析识别出灰色区域
- 用户选择了要讨论的区域
- 每个选定的区域已探讨到满意为止
- 范围蔓延被重定向到延期的想法
- CONTEXT.md 捕获决策，而非模糊愿景
- 用户了解后续步骤
</success_criteria>
