---
name: omc-reference
description: OMC 代理目录、可用工具、团队流水线路由、提交协议和技能注册表。在委派代理、使用 OMC 工具、编排团队、提交或调用技能时自动加载。
user-invocable: false
---

# OMC 参考手册

当你需要详细的 OMC 目录信息、而这些信息又不必写进每个 `CLAUDE.md` 会话时，请查阅这份内置参考手册。

## 代理目录

前缀：`oh-my-claudecode:`。完整提示词见 `agents/*.md`。

- `explore` (haiku) — 快速的代码库搜索与映射
- `analyst` (opus) — 需求澄清与隐藏约束
- `planner` (opus) — 排序与执行计划
- `architect` (opus) — 系统设计、边界与长期权衡
- `debugger` (sonnet) — 根因分析与故障诊断
- `executor` (sonnet) — 实现与重构
- `verifier` (sonnet) — 完成证据与验证
- `tracer` (sonnet) — 追踪信息收集与证据留存
- `security-reviewer` (sonnet) — 信任边界与漏洞
- `code-reviewer` (opus) — 全面的代码审查
- `test-engineer` (sonnet) — 测试策略与回归覆盖
- `designer` (sonnet) — 用户体验与交互设计
- `writer` (haiku) — 文档撰写与精炼内容工作
- `qa-tester` (sonnet) — 运行时/手动验证
- `scientist` (sonnet) — 数据分析与统计推理
- `document-specialist` (sonnet) — SDK/API/框架文档查询
- `git-master` (sonnet) — 提交策略与历史整洁度
- `code-simplifier` (opus) — 保持行为不变的简化
- `critic` (opus) — 对计划/设计的质疑与评审

## 模型路由

- `haiku` — 快速查询、轻量检查、范围狭窄的文档工作
- `sonnet` — 标准实现、调试与审查
- `opus` — 架构、深度分析、共识规划与高风险审查

## 工具参考

### 外部 AI / 编排
- `/team N:executor "task"`
- `omc team N:codex|gemini|antigravity "..."`
- `omc ask <claude|codex|gemini|antigravity>`
- `/ccg`

### OMC 状态
- `state_read`, `state_write`, `state_clear`, `state_list_active`, `state_get_status`

### 团队编排
- Claude Code 2.1.178+ 每个会话使用一个隐式代理团队。请直接用 Agent/Task 并配合不同的 `name` 值派生队友；不要调用已被移除的 `TeamCreate`/`TeamDelete` 工具，也不要依赖 `team_name` 做原生路由。
- TodoWrite 或可用的任务列表界面仅用于跟踪。任务列表工具不会创建原生团队。
- 旧版 OMC tmux/CLI 团队是独立的：运行外部工作进程时，请使用 `/team` 或 `omc team`，并配合 OMC 状态/API 命令。

### 记事本
- `notepad_read`, `notepad_write_priority`, `notepad_write_working`, `notepad_write_manual`

### 项目记忆
- `project_memory_read`, `project_memory_write`, `project_memory_add_note`, `project_memory_add_directive`

### 代码智能
- LSP：`lsp_hover`、`lsp_goto_definition`、`lsp_find_references`、`lsp_diagnostics` 及相关辅助工具
- AST：`ast_grep_search`、`ast_grep_replace`
- 实用工具：`python_repl`

## 技能注册表

通过 `/oh-my-claudecode:<name>` 调用内置工作流。

### 工作流技能
- `autopilot` — 从想法到可运行代码的完全自主执行
- `ralph` — 带验证、坚持到完成的持续循环
- `ultrawork` — 高吞吐的并行执行
- `visual-verdict` — 结构化的视觉 QA 判定
- `team` — 协调一致的团队编排
- `ccg` — Codex + Gemini + Claude 综合通道
- `ultraqa` — QA 循环：测试、验证、修复、重复
- `omc-plan` — 规划工作流，以及对 `/plan` 安全的别名
- `ralplan` — 共识规划工作流
- `sciomc` — 科学/研究工作流
- `external-context` — 外部文档/研究工作流
- `deepinit` — 分层生成 AGENTS.md
- `deep-interview` — 苏格拉底式、以歧义为门禁的需求工作流
- `ai-slop-cleaner` — 回归安全的清理工作流

### 实用技能
- `ask`、`cancel`、`note`、`skillify`、`learner`（已废弃的别名）、`omc-setup`、`mcp-setup`、`hud`、`omc-doctor`、`trace`、`release`、`project-session-manager`、`skill`、`writer-memory`、`configure-notifications`

### 在 CLAUDE.md 中保持精简的关键词触发器
- `"autopilot"→autopilot`
- `"ralph"→ralph`
- `"ulw"→ultrawork`
- `"ccg"→ccg`
- `"ralplan"→ralplan`
- `"deep interview"→deep-interview`
- `"deslop" / "anti-slop"→ai-slop-cleaner`
- `"deep-analyze"→analysis mode`
- `"tdd"→TDD mode`
- `"deepsearch"→codebase search`
- `"ultrathink"→deep reasoning`
- `"cancelomc"→cancel`
- 团队编排通过 `/team` 显式触发。

## 团队流水线

阶段：`team-plan` → `team-prd` → `team-exec` → `team-verify` → `team-fix`（循环）。

- 有边界的修复循环请使用 `team-fix`。
- `team ralph` 将团队流水线与 Ralph 风格的顺序验证串联起来。
- 当相互独立的并行轨道足以抵偿协调开销时，优先使用团队模式。

## 提交协议

使用 git 尾注，在每条提交消息中保留决策上下文。

### 格式
- 先写意图行：说明为何做这次改动
- 可选的正文，包含背景与理由
- 适用时添加结构化尾注

### 常用尾注
- `Constraint:` 影响该决策的当前约束
- `Rejected:` 考虑过的替代方案 | 拒绝该方案的原因
- `Directive:` 面向未来的警示或指示
- `Confidence:` `high` | `medium` | `low`
- `Scope-risk:` `narrow` | `moderate` | `broad`
- `Not-tested:` 已知的验证缺口

### 示例
```text
feat(docs): 减少始终加载的 OMC 指令占用

将仅作参考的编排内容移入原生 Claude 技能，使会话启动时的引导保持精简，
同时详细的 OMC 参考仍可随时查阅。

Constraint: 保留基于标记的 CLAUDE.md 安装流程
Rejected: 在旧版安装中同步全部内置技能 | 行为改动范围超出该问题所需
Confidence: high
Scope-risk: narrow
Not-tested: 在全新 Claude 配置下进行端到端插件市场安装
```
