# Claude Code `/goal` 命令开发计划（doge-code 落地版 v2）

> 本文档是对初版 `goal.md` 的深化与**事实校正**。初版方向正确（`/goal` = 对会话级 Stop hook 的封装），
> 本版在此基础上把每一条设计锚定到 doge-code **实际存在的源码**上，并修正了个别与真实实现不符的假设。
> **结论先行**：doge-code 已完整移植官方 Stop / SessionStart hook 体系，初版方案的三大支柱
> （Stop hook 驱动裁判、`stop_hook_active` 防递归、SessionStart 恢复）**全部原生可用，无需改内核源码**。

---

## 〇、事实校正：初版假设 vs doge-code 真实实现

> 这一节是初版没有的。初版假设"旧版可能不支持 prompt hook / 动态注册"，经源码核实——**全部支持**。

| 初版假设 | doge-code 真实情况 | 源码位置 |
|---|---|---|
| 官方有会话级 Stop hook 封装 | **有**，`handleStopHooks()` 每轮结束执行 | `src/query/stopHooks.ts:63` |
| prompt hook 可用，带 `$ARGUMENTS` | **有**，`PromptHookSchema` 的 `prompt` 字段文档明确 `$ARGUMENTS` 注入 | `src/schemas/hooks.ts:65-93` |
| 有 `stop_hook_active` 防递归 | **有**，`executeStopHooks(..., stopHookActive)` → `hookInput.stop_hook_active` | `src/utils/hooks.ts:3728, 3757, 3766` |
| 裁判用小型快速模型（Haiku） | **是**，`execPromptHook` 默认 `getSmallFastModel()`，可 `model` 覆盖 | `src/utils/hooks/execPromptHook.ts:79` |
| 裁判返回 `ok:false` 让主模型继续 | **是**，`{ok:false,reason}` → `preventContinuation:true` + `stopReason` → 主循环 `continue` | `execPromptHook.ts:154-168` + `query.ts:1204-1220` |
| 动态注册 hook（仅 active 时注入） | **支持**，`addSessionHook()` / `addFunctionHook()` 会话级内存 hook | `src/utils/hooks/sessionHooks.ts:68, 93` |
| SessionStart 在 startup/resume/clear/compact 触发 | **支持**，`SessionStart` 属 `ALWAYS_EMITTED_HOOK_EVENTS` | `src/utils/hooks/hookEvents.ts:15` |
| hook 事件清单 | 含 `Stop` / `StopFailure` / `SessionStart` / `SessionEnd` | `src/entrypoints/sdk/coreSchemas.ts:354` |
| hook 类型 | `command` / `prompt` / `agent` / `http` 四种（官方全套） | `src/schemas/hooks.ts:177` |

### 0.1 必须修正的两处细节

1. **三态裁判的 `impossible` 字段不原生存在**。`hookResponseSchema`（`src/utils/hooks/hookHelpers.ts:16`）只接受
   `{ ok: boolean, reason?: string }`，且 `additionalProperties: false`。初版设计的
   `{"ok":false,"impossible":true,...}` **会被 schema 校验拒绝**（`execPromptHook.ts:133-151` 会记为 non_blocking_error）。
   **修正方案**：用 `reason` 约定传递，裁判 prompt 要求 reason 以固定前缀标记，例如：
   - 达成：`{"ok": true, "reason": "EVIDENCE: <引用的证据>"}`
   - 未达成：`{"ok": false, "reason": "MISSING: <还缺什么>"}`
   - 不可能：`{"ok": false, "reason": "IMPOSSIBLE: <为何永远无法达成>"}`
   goal 侧解析 `reason` 前缀即可获得三态，**无需改 hook schema**。

2. **动态注册 hook 的实际 API 是 `addSessionHook(setAppState, sessionId, event, matcher, hook)`**，
   需要拿到 `setAppState`（来自命令 `context`）。命令的 `context` 是 `ToolUseContext & LocalJSXCommandContext`
   （`src/types/command.ts:120`），可从中取 `getAppState` 并构造 setter。这是初版"动态注册"路线的落地点。

### 0.2 复用资产一览（全部已存在，勿重写）

- `handleStopHooks(...)` — 每轮 Stop 钩子总调度（`src/query/stopHooks.ts:63`）
- `executeStopHooks(...)` — 收集 Stop 事件 hook 并注入 `stop_hook_active`（`src/utils/hooks.ts:3724`）
- `execPromptHook(...)` — LLM 裁判执行器（`src/utils/hooks/execPromptHook.ts:21`）
- `addSessionHook / addFunctionHook` — 会话级动态注册（`src/utils/hooks/sessionHooks.ts`）
- `HookEvent` / `HOOK_EVENTS` — 事件枚举（`src/entrypoints/sdk/coreSchemas.ts:354`）
- 命令注册范式 — `COMMANDS` 数组 + `LocalJSXCommand`（`src/commands.ts:460`、`src/types/command.ts:195`）
- 可选加速内核：`executeLoop()` 循环引擎（`src/commands/loop/engine.ts:104`）——用于纯离线批处理场景（见 §6）

---

## 一、设计哲学：会话级自治运行时

`/goal` 不是"设置一个条件的命令"，而是一套 **评估-反馈-续跑** 的闭环控制机制。四个正交维度：

1. **状态维度**——目标生命周期（objective / status / budget）持久化，`/clear` 后仍可恢复。
2. **评估维度**——独立裁判模型（Stop prompt hook，默认 Haiku）。三态：达成 / 未达成 / 不可能。
3. **控制维度**——预算与熔断（迭代 / token / 墙钟 + 空转 / 停滞两级熔断）。
4. **可见性维度**——运行时长、token 用量、当前卡点。

doge-code 的现实优势：**评估维度与状态维度的挂载点（Stop hook 引擎）已经现成**，
`/goal` 的工作重心落在"状态管理壳 + 裁判 prompt 设计 + 预算熔断策略 + 命令交互"这四块业务代码上。

---

## 二、架构：Goal 层 + Hook 驱动闭环

### 2.1 状态模型（两级：Goal + GoalRun）

```typescript
// src/services/goal/types.ts
export type GoalStatus =
  | 'active'         // 正在执行
  | 'paused'         // 用户暂停
  | 'budget_limited' // 预算耗尽，等待决策
  | 'complete'       // 裁判判定完成
  | 'impossible'     // 裁判判定不可能
  | 'error'

export interface GoalBudget {
  maxIterations: number   // 默认 50
  tokenBudget: number     // 0 = 不限制
  wallClockMs: number     // 0 = 不限制，默认 4h
}

export interface GoalUsage {
  iterations: number
  tokenUsed: number
  startedAt: number
  lastIterationAt: number
}

export interface GoalEvent {
  type: 'set' | 'pause' | 'resume' | 'clear'
      | 'iteration_end' | 'judge_ok' | 'judge_not_ok'
      | 'judge_impossible' | 'budget_exceeded' | 'error'
  timestamp: number
  detail: string
  tokensThisTurn?: number
}

export interface GoalState {
  id: string
  objective: string
  status: GoalStatus
  budget: GoalBudget
  usage: GoalUsage
  history: GoalEvent[]
  createdAt: number
  updatedAt: number
  completedAt?: number
}

// GoalRun 层（可选，复杂任务用）：Goal 之下维护轻量任务列表
export interface GoalRunTask {
  taskId: string
  description: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  evidence?: string
}
```

### 2.2 存储：三层，但按 doge-code 的目录习惯落地

初版提的"内存 + 项目级文件 + 会话锚点"三层是对的，落地路径改为：

- **Layer 1 内存**：当前会话的 `GoalState` 实例，读写走内存。
- **Layer 2 项目级状态文件**：`.claude/goals/active.json`。原子写（先写 `active.json.tmp` 再 `rename`）。
  这是 `/clear` 后的恢复来源——`/clear` 只清对话，不动该文件。
- **Layer 3 会话锚点**：`.claude/goals/sessions/<sessionId>.id`（用命令 context 的 sessionId，而非 pid——
  doge-code 的会话标识是 sessionId，见 `ToolUseContext`）。多会话并行时互不覆盖。

> 与初版差异：不引入 sqlite（本项目状态是单条 JSON，sqlite 属过度设计）；用 sessionId 而非 pid 作锚点键。

### 2.3 Hook 协同：Stop（驱动）+ SessionStart（恢复）

**Stop hook（核心驱动）**——每轮结束评估。走**动态注册**路线（doge-code 支持且更干净）：

- `/goal <objective>` 成功时，用 `addSessionHook(...)` 往当前 session 注册一条 `Stop` 事件的 `prompt` hook，
  prompt 模板见 §3.2，`model` 设为快速模型。
- `/goal clear` / 达成 / impossible 时，用 `removeFunctionHook` 同款机制移除该 hook（或依赖会话级 hook 随会话结束自动清理）。
- 好处：**无目标时不产生任何开销**，避免初版担心的"静态 hook 对无目标会话的开销"。

**SessionStart hook（恢复锚定）**——在 `startup / resume / clear / compact` 时机从 `active.json` 重建 `GoalState`，
并重新注册 Stop hook（因为 `/clear` 会清掉会话内动态 hook）。`SessionStart` 已是 `ALWAYS_EMITTED_HOOK_EVENTS`
（`hookEvents.ts:15`），直接可用。

**降级方案**：若动态注册受权限/沙箱限制，退化为在 `settings.json` 配置静态 Stop prompt hook，
prompt 首行判断"读 `.claude/goals/active.json`，不存在或 status≠active 立即返回 `{"ok": true}`"。
功能等价，仅多一次轻量读文件开销。（初级实现建议先用动态路线，降级留作后路。）

---

## 三、核心机制实现细节

### 3.1 命令层：五子命令语义

| 子命令 | 行为 | 边界条件 |
|---|---|---|
| `/goal <objective>` | 建 GoalState（status=active）→ 注册 Stop hook → 发起第一轮（`onDone(..., {shouldQuery:true})`） | 已有 active 目标：先记 `set` 事件再替换，并提示；空 objective 输出用法 |
| `/goal status` | 输出 objective / status / iterations / token / 时长 / 最后裁判 reason | 无 goal → "当前无活跃目标" |
| `/goal pause` | status→paused；移除 Stop hook（或让其返回 ok:true） | 仅 active 有效 |
| `/goal resume` | status→active；重置 `lastIterationAt`；重新注册 hook；续跑 | 仅 paused / budget_limited 有效 |
| `/goal clear` | 删除状态文件 + 移除 hook + 内存置空 | 任意状态可 clear；非交互模式跳过二次确认 |

**参数解析**：取 `$ARGUMENTS` 首个空格分隔词判断是否子命令关键字；匹配则剩余为参数（如 `resume --token-budget 500000`），
否则整串为 objective。可直接复用 `src/commands/loop/shortcuts.ts` 的 `parseLoopArgs` 思路（已支持
`--max-iterations` / `--budget` / `--criteria`），避免重复造轮子。

**命令结果回传**：`LocalJSXCommandOnDone`（`src/types/command.ts:165`）支持
`onDone(msg, { shouldQuery: true, metaMessages: [...] })`——`shouldQuery` 即可触发主模型开始新一轮，
这正是"设置目标后自动开跑"的落点。

### 3.2 Stop 裁判 prompt 设计（含 impossible 修正）

裁判 prompt 注入 Stop hook 的输入 JSON（含 `last_assistant_message`、`transcript_path`、`stop_hook_active`，
见 `utils/hooks.ts:3753-3768`）。模板：

```
你是 Claude Code 的目标达成裁判，不要使用任何工具。

目标（objective）：{objective}
成功标准（criteria）：{criteria 或 "无显式标准，按目标语义判断"}
预算进度：iterations={iterations}/{maxIterations}

最近的助手消息与对话记录（hook 输入 JSON）：
$ARGUMENTS

严格判断目标是否已达成。只依据转录中的具体证据，不接受无证据的声称。
只返回 JSON（不要多余文字）：
- 达成：   {"ok": true,  "reason": "EVIDENCE: <引用满足条件的证据>"}
- 未达成： {"ok": false, "reason": "MISSING: <还缺什么 / 什么阻碍了条件>"}
- 不可能： {"ok": false, "reason": "IMPOSSIBLE: <为何该条件永远无法满足>"}
```

**关键点**：
1. `objective` / 预算进度显式注入——hook 输入 JSON 本身不含 goal 元数据，需 goal 侧在注册时把 objective 拼进 prompt
   （prompt 是注册时确定的静态串；运行时变量通过 `$ARGUMENTS` 注入的 hook 输入里读 `cwd` 反查 `active.json` 兜底）。
2. `EVIDENCE / MISSING / IMPOSSIBLE` 前缀 = 三态编码（因 schema 只有 ok+reason，见 §0.1）。
3. "只依据证据"抑制裁判幻觉；`IMPOSSIBLE` 需给强理由，防"看着难就判不可能"。

### 3.3 三级预算 + 两级熔断

**三级预算**（goal 侧在 Stop hook 每次被调用时自检，超限则让 hook 返回 `{ok:true}` 停止并置 budget_limited）：

| 预算 | 触发条件 | 行为 |
|---|---|---|
| 迭代 | `usage.iterations >= budget.maxIterations` | status→budget_limited，hook 返回 ok:true，提示"已达迭代上限" |
| Token | `usage.tokenUsed >= budget.tokenBudget`（>0 时） | 同上 |
| 墙钟 | `now - usage.startedAt >= budget.wallClockMs`（>0 时） | 同上 |

> 实现提示：预算是"在 hook 里判"而非"在引擎里判"——因为驱动者是 Stop hook 不是 loop 引擎。
> goal 注册的 prompt hook 前加一个 `command` 型轻量 hook（或 function hook）做预算闸门，超限即 `exit 2` 阻止续跑，
> 或直接在 prompt 里让裁判读到超限标志时返回 ok:true。

**两级熔断**：
- **一级（快速循环）**：60s 内 Stop hook 触发 > 3 次且每轮 token 增量 < 1000 → 判空转 → 自动 pause。
- **二级（进度停滞）**：裁判 reason 连续 3 轮相似（`MISSING:` 内容近似）→ 判停滞 → 自动 pause 并建议用户干预。
  可在裁判 reason 里要求附 `progress: <0-100>` 辅助判断（仍需兼容 schema，故放在 reason 文本内）。

### 3.4 Token 用量追踪

doge-code 的 model 响应层有 usage 字段可用（`NonNullableUsage` 类型，见 `entrypoints/sdk/sdkUtilityTypes`）。
- **优先路径**：在 `onProgress` / 轮次结束处累计 `input_tokens + output_tokens + cache_read_tokens` 写入 `usage.tokenUsed`。
- **兜底路径**：若拿不到，读 hook 输入的 `transcript_path`（Stop hook 输入含该字段）估算差值。
  预算控制只需数量级，无需精确。

---

## 四、分阶段实施计划

### 阶段零：可行性验证（0.5 天）
1. 手动往 `.claude/settings.json` 配一条 `Stop` 的 `prompt` hook（返回 ok 判定），跑一轮对话，确认 hook 触发、
   `{ok:false,reason}` 能让主模型继续——**验证 §0 证据链**。
2. 在简单命令里调 `addSessionHook(context.getAppState 的 setter, sessionId, 'Stop', '', promptHook)`，
   确认会话级动态注册生效。
3. 发一条 `SessionStart` 场景（`/clear` 后），确认 hook 触发并读到 `active.json`。

### 阶段一：状态层 + 命令骨架（1–2 天）
- `src/services/goal/types.ts`、`goalState.ts`（CRUD + 事件 + 原子写）、`budget.ts`（三级预算 + 两级熔断）。
- `src/commands/goal/index.tsx`（五子命令入口 + 解析）。
- 在 `src/commands.ts` 的 `COMMANDS`（第 460 行起）注册 `goalCommand`（仿第 335、730 行的 `loopCommand`）。
- 单测：状态转换矩阵、预算边界（恰好等于/超过阈值）、序列化往返。

### 阶段二：命令交互与反馈（1–2 天）
- `/goal status` 富文本卡片（进度条 / token / 时长），思路参照 `src/commands/loop/progress-ui.ts` 的 `formatStatusLine`。
- set / pause / resume / clear 的确认与边界提示。

### 阶段三：Stop Hook 集成与闭环（2–3 天）
- 动态注册 Stop prompt hook（§2.3）；裁判 prompt（§3.2）。
- hook 响应解析：读 `reason` 前缀 → 更新 `GoalState` → 决定续跑/停止。
- `stop_hook_active` 检查：hook 输入里该标志为 true 时立即 `{ok:true}`（防递归；`executeStopHooks` 已注入该字段）。
- token 追踪（§3.4）。
- **端到端**：设目标 → 判 `MISSING` → 主模型继续 → 判 `EVIDENCE` → 自动停 → status=complete。

### 阶段四：持久化与 SessionStart（1–2 天）
- SessionStart hook 恢复 `active.json` + 重注册 Stop hook。
- 会话锚点文件 `sessions/<sessionId>.id`。
- `/clear` 处理：不清状态文件，仅清内存实例，由 SessionStart 重载。
- 测试：设 goal → `/clear` → 新会话 → goal 恢复。

### 阶段五：审计与可见性（可选，2–3 天）
- `/goal history` 输出事件时间线；状态栏时长/token 指示器；budget_limited 的用户决策流程；开发文档。

---

## 五、风险评估（据真实实现修订）

| 风险 | 评估 | 缓解 |
|---|---|---|
| prompt hook 不可用 | **已排除**：`execPromptHook` 现成 | —— |
| 动态注册不可用 | **低**：`addSessionHook` 现成；若受限则降级静态 hook | 静态 hook + 状态文件判断 |
| `stop_hook_active` 行为不一致 | **低**：`executeStopHooks` 显式注入 | 仍自行维护 iterationCount，不单靠系统标志 |
| 三态 `impossible` 被 schema 拒 | **已识别**：schema 仅 ok+reason | 用 `IMPOSSIBLE:` 前缀编码（§0.1） |
| Token 用量获取 | **中** | API usage 直读优先，transcript 估算兜底 |
| 裁判误判 ok:true | **中** | 强制引用证据 + `/goal review` 手动复核 |
| 与 auto mode 交互 | **低** | 目标不改变权限模式；无人值守需在 auto mode 运行，文档说明 |
| hook 无限递归 | **已排除** | `stop_hook_active` 原生防递归（`query.ts:1215`） |

---

## 六、与项目的差异化定位 / 复用边界

- **深度集成而非插件**：直接改源码，可访问内部 usage 字段、可动态注册 hook、可精细管理状态。
- **与 `/loop` 的分工**：`/loop`（`src/commands/loop/`）是**离线批处理循环引擎**（DAG 分解、并行、快照、验证门禁），
  适合一次性重任务；`/goal` 是**会话级自治运行时**（Stop hook 驱动，跨 `/clear` 存活），适合"持续逼近一个成功条件"。
  二者可共存，也可让 goal 在纯离线场景下可选复用 `executeLoop` 加速。
- **可配置评估策略**：裁判模型、严格度、预算阈值均为配置项，默认保守（严格评估 + 较低预算）。

> 一句话：**`/goal` 的所有关键挂载点（Stop hook 引擎、动态注册、SessionStart、防递归）在 doge-code 中都已具备，
> 新增工作集中在"目标状态管理 + 裁判 prompt + 预算熔断 + 命令交互"四块业务代码，无架构级技术难点。**

---

## 八、实现状态（阶段一~四已落地）

| 阶段 | 状态 | 落地文件 |
|---|---|---|
| 一 状态层 + 命令骨架 | ✅ | `src/services/goal/{types,goalState,budget}.ts`、`src/commands/goal/{index,goal}.tsx` |
| 二 命令交互与反馈 | ✅ | `goal.tsx` 的 status/history 渲染、参数解析 |
| 三 Stop hook 闭环 | ✅ | `goal-stop-hook.cjs`（裁判闸门）、`hookPath.ts`、命令内 `addSessionHook` 注册 |
| 四 恢复与 SessionStart | ✅ | 命令入口自愈重注册、`goal-sessionstart-hook.cjs`、`install-hook`/`uninstall-hook` |

### 与设计的两处实现修正

1. **裁判三态用 reason 前缀编码**（`EVIDENCE:` / `MISSING:` / `IMPOSSIBLE:`），
   因 `hookResponseSchema`（`src/utils/hooks/hookHelpers.ts:16`）仅接受 `ok`+`reason` 且 `additionalProperties:false`。
2. **Stop hook 用 command 型而非 prompt 型**：裁判需读写 `active.json`（累加 usage、落盘状态），
   prompt hook 只返回 ok/reason 无法落盘。command hook 通过 stdout 输出
   `{"continue":false}` / `{"decision":"block"}` 控制续跑（协议见 `src/utils/hooks.ts:616-641`）。

### 恢复机制（阶段四核心）

- `/clear` 会 `regenerateSessionId()`（`src/commands/clear/conversation.ts:201`），使会话内 Stop hook
  （内存态、以 sessionId 为键）失效，但项目级 `active.json` 保留 → 存在"僵尸目标"风险。
- **自愈**：`/goal` 任意子命令被调用时，若发现 active 目标即幂等重注册 Stop hook（`goal.tsx` call 入口）。
- **提示**：`/goal install-hook` 可将 SessionStart hook 写入 `.claude/settings.json`（仅用户显式触发，
  不自动改配置），`/clear` 后由 `goal-sessionstart-hook.cjs` 经 `additionalContext` 提示恢复。

### 验证

- 38 项单测：状态迁移矩阵、预算/熔断、裁判三态解析、Stop hook 8 条端到端路径、恢复语义、SessionStart hook。
- `bun build goal.tsx` 成功（1955 模块）。
- 启用开关：`/goal install-hook` → `/clear` → 新会话自动提示；`/goal uninstall-hook` 移除。
