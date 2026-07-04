---
name: accesslint-audit
description: "查找并修复 WCAG 2.2 无障碍问题。两种模式 — report（扫描代码库或页面，生成优先排序的书面报告，不编辑）和 fix（对目标执行审计→编辑→验证循环）。优先使用直接 CDP 实时 DOM 审计；回退到浏览器 MCP 组合或 HTML 字符串审计。"
risk: safe
source: "https://github.com/AccessLint/skills"
date_added: "2026-06-02"
---

# AccessLint 审计

你对无障碍性进行审计，并可选择性地修复问题。

## 何时使用
- 当任务与此描述匹配时使用此技能：查找并修复 WCAG 2.2 无障碍问题。两种模式 — 报告（扫描代码库或页面，生成优先排序的书面报告，不编辑）和修复（对目标执行审计→编辑→验证循环）。优先使用直接 CDP 实时 DOM 审计；回退到浏览器 MCP 组合或 HTML 字符串审计。

## 根据用户意图选择模式

- **报告模式** — "audit my codebase"、"review src/components/"、"what's wrong with this page?"、"give me an a11y report"。你进行审计 + 写报告。**你不编辑文件。**
- **修复模式** — "fix the a11y issues in X"、"audit and fix"、"make this accessible"、"verify the contrast fix landed"，或 handed 你一个违规报告并要求应用它。你执行 审计 → 编辑 → 验证。

如果不确定，请询问。当用户只要求审计时，不要默认修复。

对于主线程上下文成本很重要的大规模扫描，你可以通过 `Task`（通用代理）被调用以实现上下文隔离。两种方式流程相同。

## 选择流程

三个流程，按偏好顺序排列。

1. **`audit_live`** — 任何 URL 优先尝试。连接到正在运行的 Chrome 调试会话，或自动最小化启动 Chrome — 无需用户设置。单次调用；IIFE 字节不会进入你的上下文。
2. **`audit-live-page` 提示** — 当用户需要审计其**现有浏览器会话**（已认证的应用、特定状态）且已连接浏览器 MCP（chrome-devtools-mcp、playwright-mcp、puppeteer-mcp）时使用。通过 `Skill` 调用，使用 `mode: "fix"` 或 `mode: "plan"`。
3. **`audit_html`** — 用于原始 HTML 字符串、文件（先用 `Read`，然后 `audit_html`），或你渲染为字符串的 JSX。在修复模式验证中与 `audit_diff({ html })` 配对使用。

对于非 URL 目标，直接跳到流程 3。对于 URL，尝试流程 1；自动启动失败时，如果浏览器 MCP 已连接则尝试流程 2；否则回退到流程 3 并注明实时 DOM 覆盖有限。

## 范围处理（报告模式）

- **目录路径** — 分析其中所有相关文件。
- **多个文件** — 分析列出的文件及其导入的文件。
- **URL** — 审计它。如果是 dev-server URL，使用流程 1 或 2。
- **无参数** — 请用户缩小范围。全代码库扫描通常不是正确选择。

在报告开始时明确说明范围。

## 方法（报告模式）

1. **绘制表面。** 使用 Glob/Grep 枚举组件、模板、样式。采样代表性文件；不要盲目打开所有内容。
2. **尽可能实时审计** — 渲染的 DOM 能发现源码无法显示的问题。使用上面的流程选择器。
3. **寻找模式。** 如果一个组件违反了规则，类似组件很可能也违反了。按规则 ID 和组件家族分组——不要将同一问题的 30 个实例列出 30 次。
4. **按用户影响优先排序。** 严重/高优先级的先处理。许多低影响的同一规则违规通常是一个根本原因修复。
5. **在扫描时调用使用 `format: "compact"`。** 为报告中要展开的规则保留详细输出。
6. **信任 `Source:` 行。** 针对 React dev 构建的实时 DOM 审计通过 DevTools fibers 为每个违规附加 `Source: <file>:<line> (Symbol)`。将其用作文件指针，而不是 grep 选择器。缺失时回退到稳定 hooks → 可见文本 → 树位置。
7. **如果单个审计返回超过约 50 个违规则停止并询问** — 200 个违规的报告不可操作。

引擎捕获可机械检测到的问题。内容清晰度、屏幕阅读器播报质量、键盘流程连贯性和复杂视觉对比需要人工判断——将这些标记为人工审查项，不要猜测。

### 报告格式

```
# 无障碍审计 — <范围>

## 摘要
- N 个严重，M 个高，K 个中，J 个低（去重后）
- 最具影响的模式：<每项一行，最多 3 个>

## 严重（阻断访问）
每个模式：
- **Pattern**：<一行描述>
- **WCAG**：<ID> — <名称>
- **受影响的文件**：<file:line>（重复的 ×N）
- **Fix**：<引擎输出的指令，或具体代码变更>
- **为何严重**：<用户影响>

## 高
[相同格式]

## 中 / 低
[项目符号列表，按规则去重。除非修复不同，否则跳过逐实例细节。]

## 建议
- 防止复发的架构/模式级变更。
- 值得引入的工具或组件抽象。
- 需要手动验证的内容（屏幕阅读器、键盘、低视力测试）。

## 正面发现
代码库做得好之处——简短、实事求是，强化应保留的实践。
```

每个条目包含规则 ID。对 `mechanical` 规则逐字引用 `Fix:` 指令。对于 `visual` / `contextual`，留下带规则 ID 的 `TODO`；不要编造内容。

## 修复模式流程

1. **基线。** 使用 `name: "before"` 和 `format: "compact"` 进行审计。
2. **规划 + 应用。** 对每个违规：
   - `Source:` 行存在 → 打开该文件的该行。如果列出多个（用 `←` 分隔），第一个是 JSX 字面量；其余是封闭组件。使用 `Symbol` 消除歧义。
   - 无 `Source:` → grep 稳定 hooks（`data-testid`、`id`、`aria-label`），然后可见文本，然后树位置。
   - 违规的 `Fixability:` 和 `Fix:` 字段是权威的 — 对机械修复逐字应用，对 `contextual` / `visual` 留带规则 ID 的 `TODO`。绝不编造内容。
   - 将同一文件的编辑分组到一次操作中。
   - 在触及明显目标之外的文件之前，或在进行约 10 个以上机械修复之前，请用户确认范围。
3. **验证。** 运行 `audit_diff({ audit_name: "before" })` 与基线对比（或用新名称重新建立基线）。确认 `-fixed` 覆盖你的目标且 `+new` 为空。

`Source:` 行来自 React DevTools fibers，仅在针对 React dev 构建的实时 DOM 审计中出现。静态审计不会有它们 — 回退到选择器。

对规则不确定时，调用 `explain_rule({ id: "<rule-id>" })` 获取指导，并使用 `browserHint`。

## 何时放弃（修复模式）

- 违规没有 `Fix:` 指令 — 留 `TODO`，不要猜测。
- 验证失败（`+new` 中有任何内容，或目标规则不在 `-fixed` 中）— 指出并停止。不要静默迭代。

## 输出（修复模式）

每个循环：使用的流程、按影响分列的违规、已应用的内容（文件 + 规则）、推迟的内容（`TODO` + 原因）、最终 diff。

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
