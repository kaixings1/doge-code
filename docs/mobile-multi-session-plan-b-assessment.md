# 方案 B 可行性评估：单进程多对话

> 结论：**不建议实施**。风险与收益严重不匹配。
> 替代方案 A 已实现并验证（见 `android/MULTI-SESSION-PLAN.md`）。

## 方案 B 想解决什么

一个 CLI 进程内切换多个对话分支，手机端不必为每个会话开一个终端窗口。

对比方案 A 的代价：A 要求每个会话一个独立进程 + 一个端口，用户要开多个终端。

## 核心障碍：队列是模块级单例

`src/utils/messageQueueManager.ts` 的状态全部是模块级：

```ts
// 第 53-56 行
const commandQueue: QueuedCommand[] = []           // 单例数组
let snapshot: readonly QueuedCommand[] = Object.freeze([])  // 单例快照
const queueChanged = createSignal()                 // 单例信号，供 useSyncExternalStore
```

`enqueue()` 没有「目标会话」参数，`dequeue` 系列也没有。要让消息进指定的
对话，必须让这套状态按会话分桶。

## 依赖面：32 个文件

`messageQueueManager` 被 **32 个文件**导入（实测 `rg -l` 计数），
覆盖的模块包括：

| 类别 | 文件（部分） |
|---|---|
| 桥接 | `bridge/mobileBridge.ts`、`hooks/useReplBridge.tsx` |
| 队列消费 | `hooks/useQueueProcessor.ts`、`utils/queueProcessor.ts` |
| 用户输入 | `utils/handlePromptSubmit.ts`、`hooks/useCommandQueue.ts` |
| 任务系统 | `tasks/LocalMainSessionTask.ts`、`utils/task/framework.ts` |
| 子代理 | `tasks/LocalAgentTask/`、`tasks/RemoteAgentTask/` |
| 定时任务 | `hooks/useScheduledTasks.ts` |
| MCP | `services/mcp/useManageMCPConnections.ts` |
| 工具 | `tools/SleepTool/SleepTool.ts`、`commands/task/task.ts` |
| CLI 非交互 | `cli/print.ts` |

导出的函数至少 8 个：`enqueue`、`enqueuePendingNotification`、`dequeue`、
`dequeueAllMatching`、`peek`、`hasCommandsInQueue`、`recheckCommandQueue`、
`isQueuedCommandEditable`。

**关键**：这些不是「偶尔用一下」，而是**每条交互路径都经过**：
用户敲键盘、slash 命令、任务通知、子代理汇报、MCP 连接事件、定时任务 ——
全都往同一个队列里塞东西。

## 为什么风险高

### 1. 改动会波及所有交互路径

要让队列分桶，`enqueue` 必须增加目标参数。32 个调用点里：
- 有些**天然属于某个对话**（用户输入、桥接消息）→ 需要传目标
- 有些**是全局事件**（MCP 连接、定时任务）→ 目标是谁？需要逐个决策

任何一处决策错误，表现都是「消息进错对话」或「消息永远不被处理」，
且**可能只在特定时序下复现**。

### 2. React 订阅链路复杂

`queueChanged` 是 `useSyncExternalStore` 的订阅源（第 45-47 行注释说明
React 侧通过 `subscribeToCommandQueue` / `getCommandQueueSnapshot` 订阅，
非 React 侧直接读 `getCommandQueue()`）。

分桶后，订阅要变成「只订阅当前激活会话的队列」，否则 A 会话的队列变化
会触发 B 会话的组件重渲染。这涉及 `useQueueProcessor` 与 `REPL.tsx` 的
effect 依赖，而这两个地方正是**消息能否被处理**的关键路径。

### 3. 与 `useReplBridge` 的推送链路耦合

`useReplBridge.tsx` 的 effect 监听 `messages` 并把新消息推给手机
（`pushToMobileClients`）。它用 `mobilePushIndexRef` 做游标。多对话下：

- 游标必须**按会话独立**，否则切换会话后会回灌大量历史
- 推送必须**只推当前会话**，否则手机收到别的对话的回复

这两点都是此前修过 bug 的地方（游标回灌见 `e62017323`），
重新设计等于把已修的问题再引入一遍。

### 4. 测试覆盖不足

`tests/unit` 有 182 个用例，但针对队列本身的不多。改造后需要新增
「多会话隔离」「游标按会话独立」「通知归属」等测试 —— 这些测试要模拟
React 挂载，而 `useQueueProcessor` 的运行环境（Ink/React 挂载、
messages 更新）**无法用单元测试覆盖**（这是 `docs/mobile-verify.md`
「已知薄弱点」里记录过的问题）。

也就是说：改造后**主要靠真机验证**，而真机验证成本高、周期长。

## 收益评估

方案 B 相比 A 的实际收益只有一条：**不必开多个终端窗口**。

而 A 的代价（多开终端）在 CLI 场景下并不高：
- 多终端本来就是常见用法（用户描述中已在开多个窗口）
- 每个会话天然隔离（独立进程、独立上下文、独立 history）
- 崩溃互不影响

反过来说，B 有一个 **A 没有的缺点**：所有对话共享一个进程，
一个对话出问题（如工具卡死）会影响全部对话。

## 建议

**维持方案 A。** 若将来确需 B，建议按此顺序降低风险：

1. **先补队列的单元测试**（当前覆盖不足），特别是 dequeue 优先级、
   `dequeueAllMatching` 的匹配语义、`enqueuePendingNotification` 的去重。
   没有这层保护，改造等于在无网的地面上动结构。
2. **先做「会话标识」的横向穿透**：给 `QueuedCommand` 加 `sessionId`
   字段，但**不改队列结构**，只做透传与断言。跑一段时间验证标识正确。
3. **再考虑分桶**：把 `commandQueue` 改为 `Map<sessionId, QueuedCommand[]>`。
4. 最后处理 React 订阅与推送游标。

每一步都应能独立回滚。

## 附：判断依据（实测命令）

```bash
# 依赖面
rg -l "messageQueueManager" src/ --glob "*.ts" --glob "*.tsx" | wc -l   # → 32

# 模块级状态
rg -n "^(let|var|const) \w+" src/utils/messageQueueManager.ts
#   53: const commandQueue: QueuedCommand[] = []
#   55: let snapshot: readonly QueuedCommand[] = Object.freeze([])
#   56: const queueChanged = createSignal()

# 导出接口
rg -n "from '.*messageQueueManager.*'" src/   # 17 个 import 点，8 个不同函数
```
