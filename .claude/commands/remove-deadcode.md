---
description: 以 ultrawork 模式、经 LSP 验证的安全性、原子提交的方式移除本项目中的无用代码
---

<command-instruction>

通过大规模并行深度代理移除死代码。你是**编排者（ORCHESTRATOR）** —— 你负责扫描、验证、分批，然后把**所有**移除工作委派给并行代理。

<rules>
- **LSP 即法律。** 在做任何移除决策之前，用 `LspFindReferences(includeDeclaration=false)` 验证。
- **绝不移除入口点。** `src/index.ts`、`src/cli/index.ts`、测试文件、配置文件、`packages/` —— 禁止触碰。
- **你不自己移除代码。** 你扫描、验证、分批，然后发射深度代理。由它们干活。
</rules>

<false-positive-guards>
**绝不**标记为死代码：
- `src/index.ts` 或 barrel `index.ts` 重导出中的符号
- 测试文件中被引用的符号（测试是合法的消费方）
- 带 `@public` / `@api` JSDoc 标签的符号
- Hook 工厂（`createXXXHook`）、工具工厂（`createXXXTool`）、`agentSources` 中的 agent 定义
- 命令模板、技能定义、MCP 配置
- `package.json` exports 中的符号
</false-positive-guards>

---

## 阶段 1：扫描 —— 找出死代码候选

并行运行以下**全部**：

<parallel-scan>

**TypeScript strict 模式（你的主要扫描器 —— 最先运行）：**
```bash
bunx tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1
```
这会给你一份权威的未使用局部变量、导入、参数和类型清单，并带精确的 file:line 位置。

**Explore 代理（全部同时作为后台任务发射）：**

```
task(subagent_type="explore", run_in_background=true, load_skills=[],
  description="Find orphaned files",
  prompt="Find files in src/ NOT imported by any other file. Check all import statements. EXCLUDE: index.ts, *.test.ts, entry points, .md, packages/. Return: file paths.")

task(subagent_type="explore", run_in_background=true, load_skills=[],
  description="Find unused exported symbols",
  prompt="Find exported functions/types/constants in src/ that are never imported by other files. Cross-reference: for each export, grep the symbol name across src/ — if it only appears in its own file, it's a candidate. EXCLUDE: src/index.ts exports, test files. Return: file path, line, symbol name, export type.")
```

</parallel-scan>

把所有结果收集进一张主候选清单。

---

## 阶段 2：验证 —— LSP 确认（零误报）

对阶段 1 的**每个**候选：

```typescript
LspFindReferences(filePath, line, character, includeDeclaration=false)
// 0 references → CONFIRMED dead
// 1+ references → NOT dead, drop from list
```

同时应用上面的误报防护。产出一份已确认清单：

```
| # | File | Symbol | Type | Action |
|---|------|--------|------|--------|
| 1 | src/foo.ts:42 | unusedFunc | function | REMOVE |
| 2 | src/bar.ts:10 | OldType | type | REMOVE |
| 3 | src/baz.ts:7 | ctx | parameter | PREFIX _ |
```

**动作类型：**
- `REMOVE` —— 彻底删除该符号/导入/文件
- `PREFIX _` —— 签名所要求的未使用函数参数 → 重命名为 `_paramName`

如果确认数为**零**：报告 "No dead code found" 并**停止**。

---

## 阶段 3：分批 —— 按文件分组以实现无冲突并行

<batching-rules>

**目标：在零 git 冲突的前提下最大化并行代理数。**

1. 把已确认的死代码项按**文件路径**分组
2. **同一**文件中的所有项归入**同一**批次（防止两个代理编辑同一个文件）
3. 如果存在死文件（整文件删除），它自成一个批次
4. 目标 5-15 个批次。如果总项数少于 5，则每项一个批次。

**分批示例：**
```
Batch A: [src/hooks/foo/hook.ts — 3 unused imports]
Batch B: [src/features/bar/manager.ts — 2 unused constants, 1 dead function]
Batch C: [src/tools/baz/tool.ts — 1 unused param, src/tools/baz/types.ts — 1 unused type]
Batch D: [src/dead-file.ts — entire file deletion]
```

同一目录下的文件**可以**归入同一批次（只要没有两个代理编辑同一文件就不会冲突）。为并行度最大化批次数。

</batching-rules>

---

## 阶段 4：执行 —— 发射并行深度代理

对**每个**批次，发射一个深度代理：

```
task(
  category="deep",
  load_skills=["typescript-programmer", "git-master"],
  run_in_background=true,
  description="Remove dead code batch N: [brief description]",
  prompt="[see template below]"
)
```

<agent-prompt-template>

每个深度代理都拿到这个提示结构（按批次填入具体内容）：

```
## TASK: Remove dead code from [file list]

## DEAD CODE TO REMOVE

### [file path] line [N]
- Symbol: `[name]` — [type: unused import / unused constant / unused function / unused parameter / dead file]
- Action: [REMOVE entirely / REMOVE from import list / PREFIX with _]

### [file path] line [N]
- ...

## PROTOCOL

1. Read each file to understand exact syntax at the target lines
2. For each symbol, run LspFindReferences to RE-VERIFY it's still dead (another agent may have changed things)
3. Apply the change:
   - Unused import (only symbol in line): remove entire import line
   - Unused import (one of many): remove only that symbol from the import list
   - Unused constant/function/type: remove the declaration. Clean up trailing blank lines.
   - Unused parameter: prefix with `_` (do NOT remove — required by signature)
   - Dead file: delete with `rm`
4. After ALL edits in this batch, run: `bun run typecheck`
5. If typecheck fails: `git checkout -- [files]` and report failure
6. If typecheck passes: stage ONLY your files and commit:
   `git add [your-specific-files] && git commit -m "refactor: remove dead code from [brief file list]"`
7. Report what you removed and the commit hash

## CRITICAL
- Stage ONLY your batch's files (`git add [specific files]`). NEVER `git add -A` — other agents are working in parallel.
- If typecheck fails after your edits, REVERT all changes and report. Do not attempt to fix.
- Pre-existing test failures in other files are expected. Only typecheck matters for your batch.
```

</agent-prompt-template>

<agent-prompt-template>

**注意**：上面的代理提示模板保持英文原文 —— 它是作为跨会话可能被复用的**指令载荷**传递给子代理的，其中的 `## TASK`、`## PROTOCOL`、`## CRITICAL` 章节标题是模板契约，翻译会破坏与其他会话/技能的一致性。

</agent-prompt-template>

**同时**发射**所有**批次。等待全部完成。

---

## 阶段 5：最终验证

在**所有**代理完成后：

```bash
bun run typecheck   # must pass
bun run test        # note any NEW failures vs pre-existing
bun run build       # must pass
```

产出摘要：

```markdown
## Dead Code Removal Complete

### Removed
| # | Symbol | File | Type | Commit | Agent |
|---|--------|------|------|--------|-------|
| 1 | unusedFunc | src/foo.ts | function | abc1234 | Batch A |

### Skipped (agent reported failure)
| # | Symbol | File | Reason |
|---|--------|------|--------|

### Verification
- Typecheck：PASS/FAIL
- Tests：X passing, Y failing (Z pre-existing)
- Build：PASS/FAIL
- 总计移除：N 个符号，跨 M 个文件
- 总提交数：K 个原子提交
- 使用的并行代理数：P
```

---

## 范围控制

如果提供了 `$ARGUMENTS`，收窄扫描范围：
- 文件路径 → 仅该文件
- 目录 → 仅该目录
- 符号名 → 仅该符号
- `all` 或留空 → 全项目扫描（默认）

## 中止条件

在以下情况**停止**并报告：
- 找到超过 50 个候选（请用户收窄范围或确认继续）
- 构建中断且无法通过回退修复

</command-instruction>

<user-request>
$ARGUMENTS
</user-request>
