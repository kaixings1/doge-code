---
description: DogeCode 长程任务系统详细技术报告
whenToUse: 了解后台任务架构、自动后台机制、UI 提示流程
author: kaixings <304...5@qq.com>
lastUpdated: 2026-##
---
# 📊 后台/长程任务系统 - 完整技术报告（代码级分析）

**目标：** DogeCode v1.x+ | **作者：** kaixings <30...5@qq.com> | **生成日期：** 2026-

## 目录
- [一、核心架构概览](#core-architecture-overview) - 组件映射和状态类型
- [二、启动长程任务场景](#real-world-scenarios) - 异步/纯模式、延迟模式、手动控制模式
- [三、后台化与 Hint UI 完整链路](#backgrounding-hint-ui-flow) - 超时 + 对话框机制
- [四、性能与内存分析总结](#performance-memory-analysis)
- [五、API 速查表](#api-reference-table)

---
## 📦 核心架构概览

| 组件 | 路径 | 行数（约） | 主要职责 |
-----------|------|------------|-------------------------|
`LocalAgentTask.tsx`| `src/tasks/LocalAgentTask/`| ~400 | 后台任务核心、自动后台逻辑、中止处理 |
`runAgent.ts` | `src/tools/AgentTool/runAgent.ts`| ~350 | Agent 执行引擎（fork + MCP 管理） |
`SessionBackgroundHint.tsx` | `src/components/SessionBackgroundHint.tsx`| ~120| UI 提示"运行时间长？按 /stop" 对话框|

### Key State Types (`types.ts`)
```typescript
export type LocalAgentTaskState = TaskStateBase & {
  type: 'local_agent';
  agentId: string;                           // UUID v4 (createAgentId()) 
  description: string;                       // e.g., "Analyze D:/doge-code/src/..." 
  selectedAgent?: AgentDefinition;
  prompt: string;                            // System + user context
  isBackgrounded: boolean;                    // false=foreground, true=background |
  pendingMessages: string[];                 // Messages queued mid-turn (drained at tool-round) |
  retain: boolean;                           // UI holding this task (blocks eviction) |
  evictAfter?: number;                       // Hide + GC deadline after timestamp |
};

export function isBackgroundTask(task: TaskState): task is BackgroundTaskState {
  return 
    [task.status].includes('running' | 'pending') &&   // Must be active
    ('isBackgrounded' in task ? task.isBackgrounded : true);  // Default=true (async agent) |
}
```
---
## ⚙️ 实际使用场景
### ✅ 场景 A：纯后台模式（`registerAsyncAgent` + `runAgent({ isAsync:true})`）
**使用场景：** 长时间运行的批处理、CI 流水线、监控智能体
```typescript
// Inside runAgent.ts:
export async function* runAgent({...}): AsyncGenerator<Message> {
  const agentId = createAgentId();
  // Initialize MCP servers (optional)
  const { clients: mergedMcpClients } = await initializeAgentMcpServers(
    agentDefinition,      // frontmatter: mcpServers ['github']
    parentClients
  );
  
  for await (const hookResult of executeSubagentStartHooks(agentId)) {
    if (hookResult.additionalContexts) initialMessages.push(...);
  }
  try { for await (const message of query({ messages, systemPrompt })) yield; } finally { mcpCleanup?.(); clearSessionHooks(agentId); unregisterPerfettoAgent(agentId); }
}
```
The agent immediately starts and shows "code-reviewer: [running]" at the bottom pill.

### ✅ 场景 B：延迟后台模式（`registerAgentForeground + autoBackgroundMs`）
**使用场景：** 用户需要时间审查进度，但任务预计运行时间较长
```typescript
registerAgentForeground({
  agentId: 'analyze-doge-code',     // asAgentId(description)
  description: `Analyze ${path.normalize(DOGE_CODE_ROOT)}`,
  prompt: `Execute workflow:\n1. Glob src/**/*.ts\n2. Grep "TODO/FIXME"`, 
  selectedAgent,                    // AgentDefinition
  setAppState,
  autoBackgroundMs: 45000,          // Run for 45s before auto-background + hint dialog!
});
```
The agent starts in the panel, then at T=45s moves to bottom pill with "Run long? Press /stop" hint.

### ✅ 场景 C：手动控制（`Shift+Up/Down → /view → /killAgents`）
**使用场景：** 用户希望在决定前有时间检查智能体行为
The user can:
- Shift+Up/Down + Enter → Opens the selection dialog
- `/view` → Transcript viewing (messages, tool uses)
- `/stop` → Aborts current work (stops query turn) → resumes next round if needed  
- `/killAgents` → Calls `killAllRunningAgentTasks(all status='killed')`
---
## 🔥 后台化与 Hint UI 完整流程
### A. AutoBackgroundMs 超时路径（内部定时器）
超时在 T=45s 触发：`setTimeout(() => { setAppState(prev => {... isBackgrounded: true }); resolver(); })`。
- 中断机制：`resolver()` → `runAgent.ts: finally { abortController.signal.aborted = true; throw AbortError() }` → UI 显示"已停止"+ 通知
### B. 提示对话框路径（用户触发的 `/background`）
提示对话框通过 MessageQueueManager 在自动后台超时或手动触发后弹出：
```typescript
export function SessionBackgroundHint({ taskId, prompt }: {...}): ReactNode {
  return <Dialog title="Run long? Press /stop"
    open={true} onClose={() => {}}>
    **Options:**
      - `/view` → Transcript viewing (full messages + tool uses) 
      - `/background pill/panel filters: hide from panel（only in-process teammate view）`
      - `/killAgents`, `/stop`, `/cancel-auto-background`
  </Dialog>;
}
```
### C. 性能与内存分析总结
| Resource | Size/Estimate | Lifecycle |
----------|---------------|-----------|
`taskState.Base` | ~1KB | Task start → complete/kill, stored in `AppState.tasks[taskId]` |
`agentDefinition.json + hooks/skills metadata`| 5-50 KB (cached) | Loaded once from `.claude/agents` pool |
MCP server connections | N/A | Shared clients (parent cache) + agent-specific cleanup on exit |

**内存泄漏预防（`runAgent.ts:finally`）：**
```typescript
try { ... } finally {
mcpCleanup?.();       // Disconnect MCP client → release socket buffers!
clearSessionHooks(agentId);
unregisterPerfettoAgent(agentId); 
}
```
此报告涵盖了 DogeCode 中后台任务的完整架构和实际使用模式。
---
## 📋 API 参考表
| Function | Parameters | Returns |
----------|-----------|---------|
`registerAsyncAgent({...})`| agentId, description, prompt, selectedAgent, setAppState | `LocalAgentTaskState` (isBackgrounded=true) |
`registerAgentForeground({...}, autoBackgroundMs)`| + autoBackgroundMs | `{ taskId: string; backgroundSignal: Promise<void> }`|
`killAllRunningAgentTasks(tasks, setAppState)`| tasks map, state updater | void - kills all async agents |
`backgroundAgentTask(taskId, getAppState, setAppState)`| taskId, getters | `boolean` success flag |

**Summary:** This report covers the complete architecture and real-world startup methods of background/long-running task systems in DogeCode.
ENDOFFILE