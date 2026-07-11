---
type: prompt
name: gsd:forensics
对失败的 GSD 工作流进行事后调查，诊断问题原因。
argument-hint: "[problem description]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
requires: [phase, progress, update]
---

<objective>
调查 GSD 工作流执行期间出现的问题。分析 git 历史、`.planning/` 工件和文件系统状态，以检测异常并生成结构化的诊断报告。

目的：诊断失败或卡住的工作流，使用户能够了解根本原因并采取纠正措施。
输出：法医报告保存到 `.planning/forensics/`，内联展示，可选择创建议题。
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/forensics.md
</execution_context>

<context>
**Data sources:**
- `git log` (recent commits, patterns, time gaps)
- `git status` / `git diff` (uncommitted work, conflicts)
- `.planning/STATE.md` (current position, session history)
- `.planning/ROADMAP.md` (phase scope and progress)
- `.planning/phases/*/` (PLAN.md, SUMMARY.md, VERIFICATION.md, CONTEXT.md)
- `.planning/reports/SESSION_REPORT.md` (last session outcomes)

**User input:**
- Problem description: $ARGUMENTS (optional — will ask if not provided)
</context>

<process>
端到端执行。
</process>

<success_criteria>
- 从所有可用数据源收集证据
- 至少检查 4 种异常类型（卡住循环、缺失工件、放弃的工作、崩溃/中断）
- 结构化的法医报告写入 `.planning/forensics/report-{timestamp}.md`
- 内联展示带有发现、异常和建议的报告
- 提供交互式调查以进行更深入分析
- 如果存在可操作的发现，提供创建 GitHub 议题的选项
</success_criteria>

<critical_rules>
- **只读调查：** 在法医调查期间不要修改项目源文件。仅写入法医报告和更新 STATE.md 会话跟踪。
- **编辑敏感数据：** 从报告和议题中去除绝对路径、API 密钥、令牌。
- **以证据为基础：** 每个异常必须引用具体的提交、文件或状态数据。
- **无证据不推测：** 如果数据不足，请如实说明——不要编造根本原因。
</critical_rules>
