import { feature } from 'bun:bundle';
import { stat } from 'fs/promises';
import { OUTPUT_FILE_TAG, STATUS_TAG, SUMMARY_TAG, TASK_ID_TAG, TASK_NOTIFICATION_TAG, TOOL_USE_ID_TAG } from '../../constants/xml.js';
import { abortSpeculation } from '../../services/PromptSuggestion/speculation.js';
import type { AppState } from '../../state/AppState.js';
import type { LocalShellSpawnInput, SetAppState, Task, TaskContext, TaskHandle } from '../../Task.js';
import { createTaskStateBase } from '../../Task.js';
import type { AgentId } from '../../types/ids.js';
import { registerCleanup } from '../../utils/cleanupRegistry.js';
import { tailFile } from '../../utils/fsOperations.js';
import { logError } from '../../utils/log.js';
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js';
import type { ShellCommand } from '../../utils/ShellCommand.js';
import { evictTaskOutput, getTaskOutputPath } from '../../utils/task/diskOutput.js';
import { registerTask, updateTaskState } from '../../utils/task/framework.js';
import { escapeXml } from '../../utils/xml.js';
import { backgroundAgentTask, isLocalAgentTask } from '../LocalAgentTask/LocalAgentTask.js';
import { isMainSessionTask } from '../LocalMainSessionTask.js';
import { type BashTaskKind, isLocalShellTask, type LocalShellTaskState } from './guards.js';
import { killTask } from './killShellTasks.js';

/** 用于标识 LocalShellTask 摘要的前缀，供 UI 折叠转换使用。 */
export const BACKGROUND_BASH_SUMMARY_PREFIX = 'Background command ';
const STALL_CHECK_INTERVAL_MS = 3_000;  // 每 3 秒检查一次（原 5 秒）
const STALL_THRESHOLD_MS = 20_000;      // 20 秒无输出后开始检测（原 45 秒）
const STALL_TAIL_BYTES = 2048;          // 读取更多尾部内容（原 1024）

// 尾行模式，用于判断命令是否在等待键盘输入而阻塞。
// 用于控制停滞通知的触发——对于仅执行缓慢的命令（如 git log -S、长时间构建）保持静默，
// 仅在尾部内容看起来像是模型可以操作的交互提示时才通知。参见 CC-1175。
const PROMPT_PATTERNS = [
  // Standard y/n formats（带括号的格式，最明确）
  /\(y\/n\)/i,          // (Y/n), (y/N)
  /\[y\/n\]/i,          // [Y/n], [y/N]
  /\(yes\/no\)/i,       // (yes/no)
  /\[yes\/no\]/i,       // [yes/no]
  
  // Simple y/n without parentheses（无括号但明确是选项）
  /^\s*y\/n\s*$/i,      // y/n（整行只有这个）
  /^\s*yes\/no\s*$/i,   // yes/no（整行只有这个）
  /^\s*[yY]\/[nN]\s*$/, // Y/N, y/n, Y/n, y/N（整行）
  
  // 单独的 y 或 n 作为选项（必须有上下文）
  /\?\s*\[?[yYnN]\]?$/,        // ? [y] 或 ? y 结尾
  /\(default\s*[:：]?\s*[yYnN]\)/i,    // (default: Y) 或 (default Y) 或 (default：Y)
  /\[default\s*[:：]?\s*[yYnN]\]/i,    // [default: Y] 或 [default Y]
  /default\s*[:：]\s*[yYnN]$/i,        // default: Y （行尾）
  
  // 带默认值的格式
  /\(default\s*[yY]es\)/i,    // (default Yes)
  /\(default\s*[nN]o\)/i,     // (default No)
  
  // 问句格式（明确的交互提示）
  /\b(?:Do you|Would you|Shall I|Are you sure|Ready to)\b.*\? *$/i,
  /\b(?:Continue|Proceed|Install|Download|Delete|Remove|Overwrite|Replace)\b.*\?\s*\(?[yYnN]\/[yYnN]\)?/i,
  /\?.*?\(y\/n\)/i,           // ? ... (y/n)
  /\?.*?\[y\/n\]/i,           // ? ... [y/n]
  /\?\s*y\/n/i,               // ? y/n
  
  // 按键提示
  /Press\s+(any key|Enter)\s*(to\s+continue)?/i, 
  
  // 明确的继续/覆盖提示
  /^Continue\?\s*$/i, 
  /^Overwrite\?\s*$/i,
  
  // npm/node 常见提示格式（更精确的匹配）
  /Is this OK\?\s*\(y\/n\)/i,  // npm 标准确认格式
  
  // yes or no / ok or cancel（必须成对出现且是选择）
  /^\s*yes\s+or\s+no\s*$/i,
  /^\s*ok\s+(?:or|\/)\s+cancel\s*$/i,
  /^\s*ok\/cancel\s*$/i,            // ok/cancel 斜杠格式
  
  // 明确的确认/接受提示
  /Confirm\s+(?:installation|this action)\s*\(y\/n\)/i,
  /Accept\s+.*\?\s*\(y\/n\)/i,
];
export function looksLikePrompt(tail: string): boolean {
  const lastLine = tail.trimEnd().split('\n').pop() ?? '';
  return PROMPT_PATTERNS.some(p => p.test(lastLine));
}

// 类似 peekForStdinData（utils/process.ts）的输出端：当输出停止增长且尾部内容看起来像提示时，
// 触发一次性通知。
function startStallWatchdog(taskId: string, description: string, kind: BashTaskKind | undefined, toolUseId?: string, agentId?: AgentId): () => void {
  if (kind === 'monitor') return () => {};
  const outputPath = getTaskOutputPath(taskId);
  let lastSize = 0;
  let lastGrowth = Date.now();
  let cancelled = false;
  const timer = setInterval(() => {
    void stat(outputPath).then(s => {
      if (s.size > lastSize) {
        lastSize = s.size;
        lastGrowth = Date.now();
        return;
      }
      if (Date.now() - lastGrowth < STALL_THRESHOLD_MS) return;
      void tailFile(outputPath, STALL_TAIL_BYTES).then(({
        content
      }) => {
        if (cancelled) return;
        if (!looksLikePrompt(content)) {
          // 不是提示——继续监控。重置时间，使下次检查间隔 45 秒，而不是每个 tick 都重新读取尾部。
          lastGrowth = Date.now();
          return;
        }
        // 在异步边界可见的副作用之前锁定，使重叠 tick 的回调看到 cancelled=true 后退出。
        cancelled = true;
        clearInterval(timer);
        const toolUseIdLine = toolUseId ? `\n<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>` : '';
        const summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" appears to be waiting for interactive input`;
        // 不加 <status> 标签——print.ts 将 <status> 视为终止信号，未知值会落入 'completed' 状态，
        // 错误地关闭 SDK 消费者的任务。无状态通知会被 SDK 发射器跳过（作为进度 ping）。
        const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${SUMMARY_TAG}>${escapeXml(summary)}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>
Last output:
${content.trimEnd()}

The command is likely blocked on an interactive prompt. Kill this task and re-run with piped input (e.g., \`echo y | command\`) or a non-interactive flag if one exists.`;
        enqueuePendingNotification({
          value: message,
          mode: 'task-notification',
          priority: 'next',
          agentId
        });
      }, () => {});
    }, () => {} // 文件可能尚不存在
    );
  }, STALL_CHECK_INTERVAL_MS);
  timer.unref();
  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}
function enqueueShellNotification(taskId: string, description: string, status: 'completed' | 'failed' | 'killed', exitCode: number | undefined, setAppState: SetAppState, toolUseId?: string, kind: BashTaskKind = 'bash', agentId?: AgentId): void {
  // 原子化检查并设置 notified 标志，防止重复通知。
  // 如果任务已被标记为已通知（例如由 TaskStopTool 标记），则跳过入队，
  // 避免向模型发送冗余消息。
  let shouldEnqueue = false;
  updateTaskState(taskId, setAppState, task => {
    if (task.notified) {
      return task;
    }
    shouldEnqueue = true;
    return {
      ...task,
      notified: true
    };
  });
  if (!shouldEnqueue) {
    return;
  }

  // 中止任何活跃的推测——后台任务状态已更改，推测结果可能引用了过时的任务输出。
  // 提示建议文本会保留；仅丢弃预计算的响应。
  abortSpeculation(setAppState);
  let summary: string;
  if (feature('MONITOR_TOOL') && kind === 'monitor') {
    // Monitor 仅为流式（post-#22764）——脚本退出意味着流结束，而非"条件满足"。
    // 与 bash 前缀区分开，使 Monitor 完成不会折叠到"N 个后台命令已完成"的折叠区域中。
    switch (status) {
      case 'completed':
        summary = `Monitor "${description}" stream ended`;
        break;
      case 'failed':
        summary = `Monitor "${description}" script failed${exitCode !== undefined ? ` (exit ${exitCode})` : ''}`;
        break;
      case 'killed':
        summary = `Monitor "${description}" stopped`;
        break;
    }
  } else {
    switch (status) {
      case 'completed':
        summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" completed${exitCode !== undefined ? ` (exit code ${exitCode})` : ''}`;
        break;
      case 'failed':
        summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" failed${exitCode !== undefined ? ` with exit code ${exitCode}` : ''}`;
        break;
      case 'killed':
        summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" was stopped`;
        break;
    }
  }
  const outputPath = getTaskOutputPath(taskId);
  const toolUseIdLine = toolUseId ? `\n<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>` : '';
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${status}</${STATUS_TAG}>
<${SUMMARY_TAG}>${escapeXml(summary)}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>`;
  enqueuePendingNotification({
    value: message,
    mode: 'task-notification',
    priority: feature('MONITOR_TOOL') ? 'next' : 'later',
    agentId
  });
}
export const LocalShellTask: Task = {
  name: 'LocalShellTask',
  type: 'local_bash',
  async kill(taskId, setAppState) {
    killTask(taskId, setAppState);
  }
};
export async function spawnShellTask(input: LocalShellSpawnInput & {
  shellCommand: ShellCommand;
}, context: TaskContext): Promise<TaskHandle> {
  const {
    command,
    description,
    shellCommand,
    toolUseId,
    agentId,
    kind
  } = input;
  const {
    setAppState
  } = context;

  // TaskOutput 拥有数据——使用其 taskId 以确保磁盘写入一致性
  const {
    taskOutput
  } = shellCommand;
  const taskId = taskOutput.taskId;
  const unregisterCleanup = registerCleanup(async () => {
    killTask(taskId, setAppState);
  });
  const taskState: LocalShellTaskState = {
    ...createTaskStateBase(taskId, 'local_bash', description, toolUseId),
    type: 'local_bash',
    status: 'running',
    command,
    completionStatusSentInAttachment: false,
    shellCommand,
    unregisterCleanup,
    lastReportedTotalLines: 0,
    isBackgrounded: true,
    agentId,
    kind
  };
  registerTask(taskState, setAppState);

  // 数据通过 TaskOutput 自动流动——无需流监听器。
  // 只需转换为后台状态，使进程继续运行。
  shellCommand.background(taskId);
  const cancelStallWatchdog = startStallWatchdog(taskId, description, kind, toolUseId, agentId);
  void shellCommand.result.then(async result => {
    cancelStallWatchdog();
    await flushAndCleanup(shellCommand);
    let wasKilled = false;
    updateTaskState<LocalShellTaskState>(taskId, setAppState, task => {
      if (task.status === 'killed') {
        wasKilled = true;
        return task;
      }
      return {
        ...task,
        status: result.code === 0 ? 'completed' : 'failed',
        result: {
          code: result.code,
          interrupted: result.interrupted
        },
        shellCommand: null,
        unregisterCleanup: undefined,
        endTime: Date.now()
      };
    });
    enqueueShellNotification(taskId, description, wasKilled ? 'killed' : result.code === 0 ? 'completed' : 'failed', result.code, setAppState, toolUseId, kind, agentId);
    void evictTaskOutput(taskId);
  });
  return {
    taskId,
    cleanup: () => {
      unregisterCleanup();
    }
  };
}

/**
 * 注册一个可在后续转为后台运行的前台任务。
 * 当 bash 命令运行时间足够长以显示 BackgroundHint 时调用。
 * @returns 已注册任务的 taskId
 */
export function registerForeground(input: LocalShellSpawnInput & {
  shellCommand: ShellCommand;
}, setAppState: SetAppState, toolUseId?: string): string {
  const {
    command,
    description,
    shellCommand,
    agentId
  } = input;
  const taskId = shellCommand.taskOutput.taskId;
  const unregisterCleanup = registerCleanup(async () => {
    killTask(taskId, setAppState);
  });
  const taskState: LocalShellTaskState = {
    ...createTaskStateBase(taskId, 'local_bash', description, toolUseId),
    type: 'local_bash',
    status: 'running',
    command,
    completionStatusSentInAttachment: false,
    shellCommand,
    unregisterCleanup,
    lastReportedTotalLines: 0,
    isBackgrounded: false,
    // 尚未后台化——在前台运行中
    agentId
  };
  registerTask(taskState, setAppState);
  return taskId;
}

/**
 * 将指定的前台任务转为后台运行。
 * @returns 成功后台化返回 true，否则返回 false
 */
function backgroundTask(taskId: string, getAppState: () => AppState, setAppState: SetAppState): boolean {
  // 步骤 1：从当前状态获取任务和 shell 命令
  const state = getAppState();
  const task = state.tasks[taskId];
  if (!isLocalShellTask(task) || task.isBackgrounded || !task.shellCommand) {
    return false;
  }
  const shellCommand = task.shellCommand;
  const description = task.description;
  const {
    toolUseId,
    kind,
    agentId
  } = task;

  // 转换为后台状态——TaskOutput 继续自动接收数据
  if (!shellCommand.background(taskId)) {
    return false;
  }
  setAppState(prev => {
    const prevTask = prev.tasks[taskId];
    if (!isLocalShellTask(prevTask) || prevTask.isBackgrounded) {
      return prev;
    }
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...prevTask,
          isBackgrounded: true
        }
      }
    };
  });
  const cancelStallWatchdog = startStallWatchdog(taskId, description, kind, toolUseId, agentId);

  // 设置结果处理器
  void shellCommand.result.then(async result => {
    cancelStallWatchdog();
    await flushAndCleanup(shellCommand);
    let wasKilled = false;
    let cleanupFn: (() => void) | undefined;
    updateTaskState<LocalShellTaskState>(taskId, setAppState, t => {
      if (t.status === 'killed') {
        wasKilled = true;
        return t;
      }

      // 捕获清理函数，在更新器外部调用
      cleanupFn = t.unregisterCleanup;
      return {
        ...t,
        status: result.code === 0 ? 'completed' : 'failed',
        result: {
          code: result.code,
          interrupted: result.interrupted
        },
        shellCommand: null,
        unregisterCleanup: undefined,
        endTime: Date.now()
      };
    });

    // 在状态更新器外部调用清理（避免在更新器中产生副作用）
    cleanupFn?.();
    if (wasKilled) {
      enqueueShellNotification(taskId, description, 'killed', result.code, setAppState, toolUseId, kind, agentId);
    } else {
      const finalStatus = result.code === 0 ? 'completed' : 'failed';
      enqueueShellNotification(taskId, description, finalStatus, result.code, setAppState, toolUseId, kind, agentId);
    }
    void evictTaskOutput(taskId);
  });
  return true;
}

/**
 * 将所有前台任务（bash 命令和代理）转为后台运行。
 * 当用户按下 Ctrl+B 将所有运行中的任务后台化时调用。
 */
/**
 * 检查是否存在可后台化的前台任务（bash 或代理）。
 * 用于判断 Ctrl+B 是应将现有任务后台化还是将整个会话后台化。
 */
export function hasForegroundTasks(state: AppState): boolean {
  return Object.values(state.tasks).some(task => {
    if (isLocalShellTask(task) && !task.isBackgrounded && task.shellCommand) {
      return true;
    }
    // 排除主会话任务——它们显示在主视图中，而非作为前台任务
    if (isLocalAgentTask(task) && !task.isBackgrounded && !isMainSessionTask(task)) {
      return true;
    }
    return false;
  });
}
export function backgroundAll(getAppState: () => AppState, setAppState: SetAppState): void {
  const state = getAppState();

  // 将所有前台 bash 任务转为后台
  const foregroundBashTaskIds = Object.keys(state.tasks).filter(id => {
    const task = state.tasks[id];
    return isLocalShellTask(task) && !task.isBackgrounded && task.shellCommand;
  });
  for (const taskId of foregroundBashTaskIds) {
    backgroundTask(taskId, getAppState, setAppState);
  }

  // 将所有前台代理任务转为后台
  const foregroundAgentTaskIds = Object.keys(state.tasks).filter(id => {
    const task = state.tasks[id];
    return isLocalAgentTask(task) && !task.isBackgrounded;
  });
  for (const taskId of foregroundAgentTaskIds) {
    backgroundAgentTask(taskId, getAppState, setAppState);
  }
}

/**
 * 在原地将已注册的前台任务转为后台运行。
 * 与 spawn() 不同，此方法不会重新注册任务——它翻转现有注册的 isBackgrounded 标志
 * 并设置完成处理器。
 * 用于在 registerForeground() 已注册任务后自动后台定时器触发时
 * （避免重复的 task_started SDK 事件和泄漏的清理回调）。
 */
export function backgroundExistingForegroundTask(taskId: string, shellCommand: ShellCommand, description: string, setAppState: SetAppState, toolUseId?: string): boolean {
  if (!shellCommand.background(taskId)) {
    return false;
  }
  let agentId: AgentId | undefined;
  setAppState(prev => {
    const prevTask = prev.tasks[taskId];
    if (!isLocalShellTask(prevTask) || prevTask.isBackgrounded) {
      return prev;
    }
    agentId = prevTask.agentId;
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...prevTask,
          isBackgrounded: true
        }
      }
    };
  });
  const cancelStallWatchdog = startStallWatchdog(taskId, description, undefined, toolUseId, agentId);

  // 设置结果处理器（与 backgroundTask 的处理器镜像）
  void shellCommand.result.then(async result => {
    cancelStallWatchdog();
    await flushAndCleanup(shellCommand);
    let wasKilled = false;
    let cleanupFn: (() => void) | undefined;
    updateTaskState<LocalShellTaskState>(taskId, setAppState, t => {
      if (t.status === 'killed') {
        wasKilled = true;
        return t;
      }
      cleanupFn = t.unregisterCleanup;
      return {
        ...t,
        status: result.code === 0 ? 'completed' : 'failed',
        result: {
          code: result.code,
          interrupted: result.interrupted
        },
        shellCommand: null,
        unregisterCleanup: undefined,
        endTime: Date.now()
      };
    });
    cleanupFn?.();
    const finalStatus = wasKilled ? 'killed' : result.code === 0 ? 'completed' : 'failed';
    enqueueShellNotification(taskId, description, finalStatus, result.code, setAppState, toolUseId, undefined, agentId);
    void evictTaskOutput(taskId);
  });
  return true;
}

/**
 * 将任务标记为已通知，以抑制待处理的 enqueueShellNotification。
 * 用于后台化与完成时机竞争的场景——工具结果已包含完整输出，
 * 因此 <task_notification> 将是冗余的。
 */
export function markTaskNotified(taskId: string, setAppState: SetAppState): void {
  updateTaskState(taskId, setAppState, t => t.notified ? t : {
    ...t,
    notified: true
  });
}

/**
 * 当命令在前台完成（未转为后台）时注销前台任务。
 */
export function unregisterForeground(taskId: string, setAppState: SetAppState): void {
  let cleanupFn: (() => void) | undefined;
  setAppState(prev => {
    const task = prev.tasks[taskId];
    // 仅当是前台任务（未后台化）时才移除
    if (!isLocalShellTask(task) || task.isBackgrounded) {
      return prev;
    }

    // 捕获清理函数，在更新器外部调用
    cleanupFn = task.unregisterCleanup;
    const {
      [taskId]: removed,
      ...rest
    } = prev.tasks;
    return {
      ...prev,
      tasks: rest
    };
  });

  // 在状态更新器外部调用清理（避免在更新器中产生副作用）
  cleanupFn?.();
}
async function flushAndCleanup(shellCommand: ShellCommand): Promise<void> {
  try {
    await shellCommand.taskOutput.flush();
    shellCommand.cleanup();
  } catch (error) {
    logError(error);
  }
}
