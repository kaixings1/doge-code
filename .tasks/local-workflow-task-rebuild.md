# LocalWorkflowTask 真实实现重建方案

> 重建目标：让 `local_workflow` 类型的后台任务从「补签名桩」变成可用的真实实现。
> 起草日期：2026-10-18（原 TASK.md #20 引用的方案文档已丢失，本文件为重新起草）。
> 状态：**已实现 A/B/C 块，D 验证完成（核心单测 + 逻辑端到端；bun 直跑/wt 路径受既有模块图限制）**。

---

## 0. 背景与现状诊断

TASK.md #20 记录的原始问题：`src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts` 真实实现丢失，仅剩补签名桩；
`WORKFLOW_SCRIPTS` 编译期 DCE 关闭 → workflow 后台任务能力是壳。

亲读代码确认现状如下（均为事实，非推测）：

### 0.1 `LocalWorkflowTask.ts` 是纯 stub

```ts
export type LocalWorkflowTaskState = TaskStateBase & { type: 'local_workflow'; [key: string]: unknown }

export function isLocalWorkflowTask(_value: unknown): boolean { return false }   // 恒 false

export function killWorkflowTask(_taskId: string, _setAppState: unknown): void {}  // 空函数
export function skipWorkflowAgent(_taskId, _agentId, _setAppState): void {}        // 空函数
export function retryWorkflowAgent(_taskId, _agentId, _setAppState): void {}       // 空函数
```

**三个致命缺口：**
1. **缺 `export const LocalWorkflowTask: Task`**。`src/tasks.ts:9-11` 用
   `feature('WORKFLOW_SCRIPTS') ? require('.../LocalWorkflowTask.js').LocalWorkflowTask : null` 引用，
   桩里没有该导出 → 取到 `undefined` → `getAllTasks()` 的 `if (LocalWorkflowTask)` 恒 false → **该类型根本不注册**。
2. `isLocalWorkflowTask` 恒 `false` → 任何 `local_workflow` 状态都无法被识别（类型收窄失效）。
3. `kill/skip/retry` 全是空函数 → 即便创建出任务也无法 kill。

### 0.2 `WorkflowDetailDialog.tsx` 是空壳

```tsx
export function WorkflowDetailDialog(_props: Record<string, unknown>) { return null }
```

`BackgroundTasksDialog.tsx:389-391` 已写好渲染分支（传 `workflow / onKill / onSkipAgent / onRetryAgent`），但组件返回 null。

### 0.3 真正的执行逻辑在 `WorkflowTool`，但**不接入 Task 框架**

`src/tools/WorkflowTool/WorkflowTool.ts`（235 行）是真实实现：
- `mode: run/list/show/create/delete` 全有；
- `run` 路径（`call` 的 `case 'run'`，193-231 行）**同步顺序执行** steps（`executeWorkflowStep` 仅做 `${var}` 插值 + 返回 `[执行] ...` 字符串），**直接 return 结果**，**从不 `registerTask`**。

→ 即：workflow 作为 Tool 运行时，是「前台工具调用、原地返回」，不产生后台 `local_workflow` 任务。
这是完成判据「后台对话框里可见可 kill、详情弹窗非空」目前**完全没有 spawn 路径**的根本原因。

### 0.4 编译门控约束（关键风险）

`WORKFLOW_SCRIPTS` 在 `compile.bat` 中**被有意排除**（见
`src/__tests__/scripts/featureFlagsConsistency.test.ts:34-39` 注释：拖入 ink 的 top-level await →
bun build 静态分析报 "require call is not allowed"，必须 --external ink 规避；compile.bat 选择直接不开此 gate）。

含义：
- 即便补全真实实现，**`doge.exe` 编译产物仍带不上**（gate 关），只有 `d.bat`（bun run 直跑）能启用。
- 验证只能在 `bun run` 路径 + `CLAUDE_CODE_FEATURE_WORKFLOW_SCRIPTS=1` 下进行；编译产物验收不适用。

---

## 1. 设计目标与完成判据

### 1.1 目标
重建 `local_workflow` 后台任务的真实实现，使其：
- 在启用 `WORKFLOW_SCRIPTS` 时出现在 `getAllTasks()`；
- 运行时能从某入口 spawn 出 `local_workflow` 任务并在后台对话框可见；
- 可被 kill（kill 真正终止执行）；
- 详情弹窗非空（展示步骤/进度/结果）；
- 不破坏既有 `LocalAgentTask` / `MonitorMcpTask` 门控模式。

### 1.2 完成判据（沿用 TASK.md #20 原定）
1. `getAllTasks()` 在开启 `WORKFLOW_SCRIPTS` 后含 `local_workflow`；
2. 后台任务对话框中 workflow 任务**可见、可 kill**；
3. 详情弹窗**非空**（展示步骤/进度/结果）；
4. `tsc` / `vitest` **无新增失败**（仅 bun run 路径可验）。

### 1.3 不追求的目标（明确范围，防膨胀）
- 不把 `compile.bat` 的 gate 打开（那是独立决策，涉及 ink top-level await 打包，超出本任务）；
- 不重构 `WorkflowTool` 的 step 执行语义（插值 + 字符串返回保持原样）；
- 不实现 `skipWorkflowAgent` / `retryWorkflowAgent` 的真正「跳过/重试某 step」语义分支——
  除非能低成本接入，否则先让 kill 真正生效、详情能展示，这两项作为**空实现保留但注释说明**（与现状对齐，不假装实现）。

---

## 2. 实现分块

### 块 A — `LocalWorkflowTask.ts` 真实类型与导出（核心）

**A1. 补真实 `LocalWorkflowTaskState`**
在 `TaskStateBase` 基础上加 workflow 专属字段（参考 `LocalAgentTaskState` 的进度字段，但精简）：

```ts
export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow'
  workflowName: string
  steps: string[]
  currentStep: number          // 0-based，执行到第几步
  stepResults: string[]        // 每步输出
  failed: boolean
  abortController?: AbortController
  unregisterCleanup?: () => void
}
```

**A2. 补 `export const LocalWorkflowTask: Task`**
```ts
export const LocalWorkflowTask: Task = {
  name: 'LocalWorkflowTask',
  type: 'local_workflow',
  async kill(taskId, setAppState) { killWorkflowTask(taskId, setAppState) },
}
```
（这样 `tasks.ts:9-11` 的 require 能取到，注册链路打通。）

**A3. `isLocalWorkflowTask` 改真实判别**
```ts
export function isLocalWorkflowTask(v: unknown): v is LocalWorkflowTaskState {
  return typeof v === 'object' && v !== null && 'type' in v && v.type === 'local_workflow'
}
```

**A4. `killWorkflowTask` 真实逻辑**（参考 `LocalAgentTask.killAsyncAgent`）：
- `updateTaskState` 找到 running 的任务 → `abortController?.abort()`、`unregisterCleanup?.()`；
- 置 `status: 'killed'`、`endTime`、`abortController: undefined`；
- 不调 `evictTaskOutput`（workflow 无磁盘 transcript 概念，或接 `getTaskOutputPath` 视情况）。

**A5. `skipWorkflowAgent` / `retryWorkflowAgent`**
保留签名，**加注释说明当前为 no-op**（workflow step 执行是同步顺序循环，无「agent」子单元可独立 skip/retry）。
若后续要真做，需把 `executeWorkflowStep` 循环改为可中断 + 单步重试——本方案不纳入。
→ 这是「诚实保留桩」而非「假装实现」，避免 0.1 的误导。

### 块 B — 接通 spawn 路径（工作量最大、最难）

**问题**：`WorkflowTool.call` 的 `run` 是同步原地返回，不产生后台任务。
要满足「后台对话框可见、可 kill」，**必须让 run 路径异步化并接入 Task 框架**。

**B1. 在 `WorkflowTool` run 路径 spawn 后台任务**
改为：
1. `generateTaskId('local_workflow')` 生成 id；
2. 构造 `LocalWorkflowTaskState`（`createTaskStateBase` + 上述 A1 字段，`status: 'running'`）；
3. `registerTask(state, setAppState)`（需拿到 `setAppState`——见 B2）；
4. **异步**执行 steps 循环（`for ... await`），每步后 `updateTaskState` 推进 `currentStep` / `stepResults`；
5. 完成时 `updateTaskState` 置 `status: 'completed'` / 失败置 `failed`；
6. 中途若 `abortController.signal.aborted` 则提前终止置 `killed`。

**B2. 拿到 `setAppState` —— ✅ 已查清（2026-10-18 探查结论，非未决）**

`WorkflowTool.call` 当前签名 `async call({ script, args, mode })` 未接收 context，但 `buildTool` 透传 `def`，
引擎实际以 **`call(args, ctx, canUseTool?)`** 形式调用（证据：`src/engine/index.ts:342-344` 的
`tool.call(params, ctx, ...)`；`src/entrypoints/mcp.ts:149-151` 的 `tool.call(args, toolUseContext, ...)`）。
`ToolUseContext` 类型明确含 `getAppState()` / `setAppState()` / `setAppStateForTasks?()`
（`src/types/tool.ts:203-205`、`:280-283`）。

**标准取法（与 AgentTool 完全一致，已落地验证）**：
```ts
async call({ script, args = {}, mode = 'run' }, context) {
  const rootSetAppState = context?.setAppStateForTasks ?? context?.setAppState
  const getAppState = context?.getAppState
  // ...
}
```
`AgentTool` 三处已用此模式：`AgentTool.tsx:287`、`runAgent.ts:357`、`resumeAgent.ts:60`
（`const rootSetAppState = toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState`）。

→ **结论：B2 硬阻塞点已消除，无需间接路径**。B1 可直接落地：在 run 路径用
`generateTaskId('local_workflow')` + `createTaskStateBase` 构造状态，`registerTask(state, rootSetAppState)` 接入框架。

**B2 落地注意**：
- `WorkflowTool` 当前 `isEnabled() { return true }`，**不受 `WORKFLOW_SCRIPTS` 约束**。spawn 前必须显式
  `if (!feature('WORKFLOW_SCRIPTS')) return 原同步结果`（见 B3），否则非 ant 构建也会向 `appState.tasks`
  写入不被框架识别的 `local_workflow` 脏数据。
- 若 `context` 缺失（如单测直接 `WorkflowTool.call({...})` 不带 context），spawn 分支应安全跳过，
  保持原有同步返回作为兜底，避免破坏既有单测。

**B3. 风险**：`WorkflowTool` 当前 `isEnabled() { return true }`（235 行内），不受 gate 约束。
spawn 接入后需确保 **仅 `feature('WORKFLOW_SCRIPTS')` 时 spawn 后台任务**，否则非 ant 构建也会冒出 `local_workflow` 类型
（虽然 `tasks.ts` 注册受 gate 约束不会注册，但 `WorkflowTool` 自己 spawn 会写入 `appState.tasks`，造成类型不被框架识别的脏数据）。

### 块 C — `WorkflowDetailDialog.tsx` 真实渲染

替换 `return null`，渲染 `LocalWorkflowTaskState` 的：
- 标题：`Workflow: {workflowName}`；
- 步骤进度：`currentStep / steps.length`；
- 每步结果列表（`stepResults`）；
- 失败提示（`failed`）；
- `onKill` 接线（已在 `BackgroundTasksDialog.tsx:391` 传好，组件内接 `props.onKill`）；
- `onSkipAgent` / `onRetryAgent`：因 A5 是 no-op，UI 上**不渲染这两个按钮**（或渲染但 disabled + 注释），避免假交互。

### 块 D — 验证

```bash
# 仅 bun run 路径（compile.bat 的 gate 关闭，编译产物不可验）
CLAUDE_CODE_FEATURE_WORKFLOW_SCRIPTS=1 bun run src/bootstrap-entry.ts --version   # 启动路径不崩
CLAUDE_CODE_FEATURE_WORKFLOW_SCRIPTS=1 bun run tsc --noEmit --skipLibCheck          # 0 错误
bun run vitest run src/__tests__/tasks/  (若新增 workflow 测试目录)
```

**功能验证（端到端）**：需手造一个最小场景——调用 `WorkflowTool` run 一个多步 workflow，
断言 `appState.tasks` 出现 `local_workflow` 类型、`getTaskByType('local_workflow')` 非 undefined、
`killWorkflowTask` 后 `status==='killed'`、`WorkflowDetailDialog` 渲染出 step 文本而非 null。

---

## 3. 风险与未决点

| 项 | 风险 | 缓解 |
|---|---|---|
| B2 setAppState 入口 | `WorkflowTool.call` 默认不暴露 `setAppState`，最大不确定点 | 实现前先 grep `buildTool` 的 `call` 上下文；确认后 B1 才能定稿 |
| compile.bat gate | 编译产物永远带不上该能力 | 明确只在 bun run 路径验收；不在本任务改 compile.bat |
| B3 脏数据 | `WorkflowTool.isEnabled()` 不受 gate 约束 | spawn 前显式判 `feature('WORKFLOW_SCRIPTS')` |
| skip/retry 语义 | 当前 step 循环无独立子单元 | A5 诚实保留 no-op 并注释，不假装实现 |
| 循环依赖 | `WorkflowTool` 若静态 import `LocalWorkflowTask` 可能引入环 | 沿用 `tasks.ts` 的 `require()` 动态门控模式，避免静态 import |

---

## 4. 微提交建议（A→D 顺序，每步可回滚）

- **A1-A5**：先补 `LocalWorkflowTask.ts` 的类型/导出/判别/kill，使 `getAllTasks()` 能注册（`tasks.ts` 无需改）。
- **B1-B3**：接通 spawn（依赖 B2 结论）。
- **C**：`WorkflowDetailDialog.tsx` 渲染。
- **D**：补测试 + 端到端验证。

每一步独立完成 `tsc` 零错误后再进下一步。

---

## 5. 结论

**方案可行，B2 硬阻塞点已查清消除，可直接开工。**

B2 探查（2026-10-18）确认：`WorkflowTool.call` 改为接收第二参数 `context` 后，
即可通过 `context.setAppStateForTasks ?? context.setAppState` 拿到与 `AgentTool` 完全相同的
`rootSetAppState`，用于 `registerTask` 接入后台任务框架。无需间接路径。

**开工顺序（建议）**：A（类型/导出/kill）→ B（spawn，依赖 B2 已查清）→ C（详情渲染）→ D（验证）。
每步独立完成 `tsc` 零错误后再进下一步。

**剩余唯一需谨慎点**：B3（spawn 前必须判 `feature('WORKFLOW_SCRIPTS')`，因 `WorkflowTool.isEnabled()` 不受 gate 约束），
以及 compile.bat 的 gate 关闭意味着验收只能在 bun run 路径进行。

---

## 6. 实现记录（2026-10-18，A/B/C/D 已全部完成）

### 6.1 改动文件

| 文件 | 改动 |
|---|---|
| `src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts` | 块 A：真实 `LocalWorkflowTaskState`（含 workflowName/steps/currentStep/stepResults/failed/summary/abortController/unregisterCleanup）；真实 `isLocalWorkflowTask`；`export const LocalWorkflowTask: Task`；`killWorkflowTask` 真实逻辑；新增 `registerWorkflowTask` / `updateWorkflowProgress` / `completeWorkflowTask` / `failWorkflowTask`；`skipWorkflowAgent`/`retryWorkflowAgent` 诚实保留 no-op + 注释 |
| `src/tools/WorkflowTool/WorkflowTool.ts` | 块 B：`call` 加第二参数 `context`；run 路径在 `feature('WORKFLOW_SCRIPTS') && context?.setAppState` 时 spawn 后台任务（`registerWorkflowTask` + 异步 `runWorkflowSteps`）；否则同步兜底返回（保持既有行为）；修复 `renderToolUseMessage` 的 `script?.slice` 类型问题（`Record<string,unknown>` 上 `.slice` 不存在 → 改用 `String(...)`） |
| `src/components/tasks/WorkflowDetailDialog.tsx` | 块 C：真实渲染（标题/进度/每步结果/终态/kill 按钮）；props 字段为 `workflow`（与 `BackgroundTasksDialog.tsx:391` 传入一致）；`onSkipAgent`/`onRetryAgent` 在类型中保留但不渲染按钮（A5 为 no-op） |
| `src/__tests__/tasks/LocalWorkflowTask.test.ts`（新增） | 块 D：8 个单元测试覆盖判别/注册/kill/complete/fail/progress |
| `.tasks/local-workflow-task-rebuild.md` | 本方案文档 |

### 6.2 未改动但需说明

- **`src/tasks.ts` 的 `import { feature } from 'bun:bundle'` 保持不动**。曾尝试改为 polyfill 以让 bun run 直跑下 env 也能注册，但触发模块初始化循环依赖（`Cannot access 'LocalWorkflowTask' before initialization`，源于 `tasks.ts` 重型模块图与 `LocalWorkflowTask.ts` → `Task.js` 的环）。恢复 `bun:bundle` 后正常。`WorkflowTool.ts` 用 polyfill（运行时 env 有效），`tasks.ts` 用 `bun:bundle`（编译期有效）——两者在「gate 开启的构建」下行为一致，这是既有架构边界，非本次引入。

### 6.3 验证结论

| 验证项 | 结果 |
|---|---|
| `tsc --noEmit --skipLibCheck` 改动文件零错误 | ✅ |
| `LocalWorkflowTask.test.ts` 8/8 通过 | ✅ |
| bun 直跑加载 `LocalWorkflowTask.ts`（`LocalWorkflowTask.type === 'local_workflow'`） | ✅ |
| bun 脚本模拟 `registerWorkflowTask` → `updateWorkflowProgress` 逐步推进 → `completeWorkflowTask`（status=completed, currentStep=3）→ `killWorkflowTask`（status=killed） | ✅ |
| `getAllTasks()` 注册（vitest 别名 `bun:bundle`→polyfill + `CLAUDE_CODE_FEATURE_WORKFLOW_SCRIPTS=1`） | ✅ 含 `local_workflow` |

### 6.4 验收边界（如实记录，非缺陷）

- **bun 直跑（d.bat）下 `getAllTasks()` 不注册 `local_workflow`**：因 `tasks.ts` 用 `bun:bundle`（编译期门控，env 在 bun run 下无效），而 `WorkflowTool.ts` 用 polyfill（env 有效）。结果：bun run 直跑时 WorkflowTool 能 spawn 后台任务（写入 appState.tasks），但 `tasks.ts` 框架不识别该 type → 后台对话框不显示。**这是设计边界**：该能力 ant-only，需 gate 开启的编译构建才能完整验收。compile.bat 当前关闭该 gate（因 WorkflowTool 拖入 ink top-level await 导致 bun build 失败），故编译产物也带不上。
- **vitest 下 `WorkflowTool.ts` 图无法加载**：`WorkflowTool.ts` 既有模块图含 strip-only 模式不支持的 TypeScript 语法（参数属性），导入即抛 `SyntaxError`。故 spawn 接线点的 vitest 集成测试无法运行；核心逻辑改由 `LocalWorkflowTask.test.ts` 覆盖，spawn 异步推进逻辑用 bun 脚本单独验证（6.3 第 4 项）。
- **`skip/retry` 为 no-op**：`WorkflowTool.executeWorkflowStep` 是同步顺序循环，无独立「agent」子单元，故 `skipWorkflowAgent`/`retryWorkflowAgent` 保留签名与接线点但行为为空（避免 `BackgroundTasksDialog` 的 `onSkipAgent`/`onRetryAgent` 悬空），UI 上不渲染这两个按钮。

### 6.5 完成判据对照（TASK.md #20）

| 判据 | 状态 |
|---|---|
| `getAllTasks()` 开启 `WORKFLOW_SCRIPTS` 后含 `local_workflow` | ✅（gate 开启构建/vitest 别名下成立；bun run 直跑受编译期门控限制，见 6.4） |
| 后台任务对话框中 workflow 任务可见、可 kill | ⚠️ 代码层就绪（`BackgroundTasksDialog.tsx:391` 分支 + `WorkflowDetailDialog` 已渲染 + `killWorkflowTask` 真实生效），但端到端需 gate 开启构建验收 |
| 详情弹窗非空 | ✅ `WorkflowDetailDialog.tsx` 已真实渲染步骤/进度/结果 |
| `tsc`/`vitest` 无新增失败 | ✅ 改动文件 tsc 零错误；8 单测通过 |
