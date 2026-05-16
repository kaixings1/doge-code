/**
 * 对话清除工具。
 * 此模块依赖较重，应尽可能懒加载。
 */
import { feature } from 'bun:bundle'
import { randomUUID, type UUID } from 'crypto'
import {
  getLastMainRequestId,
  getOriginalCwd,
  getSessionId,
  regenerateSessionId,
} from '../../bootstrap/state.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { AppState } from '../../state/AppState.js'
import { isInProcessTeammateTask } from '../../tasks/InProcessTeammateTask/types.js'
import {
  isLocalAgentTask,
  type LocalAgentTaskState,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { isLocalShellTask } from '../../tasks/LocalShellTask/guards.js'
import { asAgentId } from '../../types/ids.js'
import type { Message } from '../../types/message.js'
import { createEmptyAttributionState } from '../../utils/commitAttribution.js'
import type { FileStateCache } from '../../utils/fileStateCache.js'
import {
  executeSessionEndHooks,
  getSessionEndHookTimeoutMs,
} from '../../utils/hooks.js'
import { logError } from '../../utils/log.js'
import { clearAllPlanSlugs } from '../../utils/plans.js'
import { setCwd } from '../../utils/Shell.js'
import { processSessionStartHooks } from '../../utils/sessionStart.js'
import {
  clearSessionMetadata,
  getAgentTranscriptPath,
  resetSessionFilePointer,
  saveWorktreeState,
} from '../../utils/sessionStorage.js'
import {
  evictTaskOutput,
  initTaskOutputAsSymlink,
} from '../../utils/task/diskOutput.js'
import { getCurrentWorktreeSession } from '../../utils/worktree.js'
import { clearSessionCaches } from './caches.js'
import { resetSessionStartTime } from '../../components/StatusLine.js'

export async function clearConversation({
  setMessages,
  readFileState,
  discoveredSkillNames,
  loadedNestedMemoryPaths,
  getAppState,
  setAppState,
  setConversationId,
}: {
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  readFileState: FileStateCache
  discoveredSkillNames?: Set<string>
  loadedNestedMemoryPaths?: Set<string>
  getAppState?: () => AppState
  setAppState?: (f: (prev: AppState) => AppState) => void
  setConversationId?: (id: UUID) => void
}): Promise<void> {
  // 在清除前执行 SessionEnd 钩子（受 CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS 限制，默认 1.5 秒）
  const sessionEndTimeoutMs = getSessionEndHookTimeoutMs()
  await executeSessionEndHooks('clear', {
    getAppState,
    setAppState,
    signal: AbortSignal.timeout(sessionEndTimeoutMs),
    timeoutMs: sessionEndTimeoutMs,
  })

  // 向推理引擎发出信号：此对话的缓存可被驱逐。
  const lastRequestId = getLastMainRequestId()
  if (lastRequestId) {
    logEvent('tengu_cache_eviction_hint', {
      scope:
        'conversation_clear' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_request_id:
        lastRequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  // 预先计算要保留的任务，以便其每个 agent 的状态能在下面的缓存清除中幸存。
  // 除非任务显式设置了 isBackgrounded === false，否则会被保留。
  // 主会话任务（Ctrl+B）会被保留——它们写入隔离的按任务转录文件，
  // 并在 agent 上下文中运行，因此在会话 ID 重新生成后仍然安全。
  // 参见 LocalMainSessionTask.ts startBackgroundSession。
  const preservedAgentIds = new Set<string>()
  const preservedLocalAgents: LocalAgentTaskState[] = []
  const shouldKillTask = (task: AppState['tasks'][string]): boolean =>
    'isBackgrounded' in task && task.isBackgrounded === false
  if (getAppState) {
    for (const task of Object.values(getAppState().tasks)) {
      if (shouldKillTask(task)) continue
      if (isLocalAgentTask(task)) {
        preservedAgentIds.add(task.agentId)
        preservedLocalAgents.push(task)
      } else if (isInProcessTeammateTask(task)) {
        preservedAgentIds.add(task.identity.agentId)
      }
    }
  }

  setMessages(() => [])

  // 清除上下文阻塞标志，以便 /clear 后主动 tick 恢复
  if (feature('PROACTIVE') || feature('KAIROS')) {
     
    const { setContextBlocked } = require('../../proactive/index.js')
     
    setContextBlocked(false)
  }

  // 通过更新 conversationId 强制重新渲染 logo
  if (setConversationId) {
    setConversationId(randomUUID())
  }

  // 清除所有与会话相关的缓存。保留的后台任务（已调用的技能、待处理的权限回调、
  // dump 状态、缓存破坏跟踪）的每个 agent 状态会被保留，以便这些 agent 继续运行。
  clearSessionCaches(preservedAgentIds)

  setCwd(getOriginalCwd())
  readFileState.clear()
  discoveredSkillNames?.clear()
  loadedNestedMemoryPaths?.clear()

  // 从 App State 中清理必要的项
  if (setAppState) {
    setAppState(prev => {
      // 使用上面计算的相同谓词对任务进行分区：
      // 杀死并移除前台任务，保留其他所有任务。
      const nextTasks: AppState['tasks'] = {}
      for (const [taskId, task] of Object.entries(prev.tasks)) {
        if (!shouldKillTask(task)) {
          nextTasks[taskId] = task
          continue
        }
        // 前台任务：杀死并从状态中移除
        try {
          if (task.status === 'running') {
            if (isLocalShellTask(task)) {
              task.shellCommand?.kill()
              task.shellCommand?.cleanup()
              if (task.cleanupTimeoutId) {
                clearTimeout(task.cleanupTimeoutId)
              }
            }
            if ('abortController' in task) {
              task.abortController?.abort()
            }
            if ('unregisterCleanup' in task) {
              task.unregisterCleanup?.()
            }
          }
        } catch (error) {
          logError(error)
        }
        void evictTaskOutput(taskId)
      }

      return {
        ...prev,
        tasks: nextTasks,
        attribution: createEmptyAttributionState(),
        // 清除独立 agent 上下文（由 /rename、/color 设置的名称/颜色）
        // 以便新会话不显示旧会话的身份标识
        standaloneAgentContext: undefined,
        fileHistory: {
          snapshots: [],
          trackedFiles: new Set(),
          snapshotSequence: 0,
        },
        // 将 MCP 状态重置为默认值以触发重新初始化。
        // 保留 pluginReconnectKey，这样 /clear 不会导致空操作
        // （它只由 /reload-plugins 更新）。
        mcp: {
          clients: [],
          tools: [],
          commands: [],
          resources: {},
          pluginReconnectKey: prev.mcp.pluginReconnectKey,
        },
      }
    })
  }

  // 清除 plan slug 缓存，以便 /clear 后使用新的 plan 文件
  clearAllPlanSlugs()

  // 清除缓存的会话元数据（标题、标签、agent 名称/颜色）
  // 以便新会话不继承前一个会话的身份
  clearSessionMetadata()

  // 生成新的会话 ID 以提供全新状态
  // 将旧会话设置为父会话，用于分析血缘追踪
  regenerateSessionId({ setCurrentAsParent: true })
  // 更新环境变量，使子进程使用新的会话 ID
  if (process.env.USER_TYPE === 'ant' && process.env.CLAUDE_CODE_SESSION_ID) {
    process.env.CLAUDE_CODE_SESSION_ID = getSessionId()
  }
  await resetSessionFilePointer()

  // 被保留的 local_agent 任务在生成时其 TaskOutput 符号链接指向的是旧的会话 ID，
  // 但清除后的转录写入会落到新的会话目录下（appendEntry 会重新读取 getSessionId()）。
  // 重新指向符号链接，使 TaskOutput 读取实时的文件，而不是清除前的冻结快照。
  // 只重新指向正在运行的任务——已完成的任务不会再写入，
  // 因此重新指向会用无效的悬空链接替换有效的符号链接。
  // 主会话任务使用相同的按 agent 路径（它们通过 recordSidechainTranscript 写入 getAgentTranscriptPath），因此没有特殊情况。
  for (const task of preservedLocalAgents) {
    if (task.status !== 'running') continue
    void initTaskOutputAsSymlink(
      task.id,
      getAgentTranscriptPath(asAgentId(task.agentId)),
    )
  }

  // 清除后重新持久化 mode 和 worktree 状态，以便未来的 --resume
  // 知道新清除后的会话处于什么状态。clearSessionMetadata
  // 从缓存中清除了这两者，但进程仍然处于相同的 mode
  // 和（如果适用）相同的 worktree 目录中。
  if (feature('COORDINATOR_MODE')) {
     
    const { saveMode } = require('../../utils/sessionStorage.js')
    const {
      isCoordinatorMode,
    } = require('../../coordinator/coordinatorMode.js')
     
    saveMode(isCoordinatorMode() ? 'coordinator' : 'normal')
  }
  const worktreeSession = getCurrentWorktreeSession()
  if (worktreeSession) {
    saveWorktreeState(worktreeSession)
  }

  // 清除后执行 SessionStart 钩子
  const hookMessages = await processSessionStartHooks('clear')

  // 使用钩子结果更新消息
  if (hookMessages.length > 0) {
    setMessages(() => hookMessages)
  }

  // DOGE: /clear 时重置会话开始时间
  resetSessionStartTime()
}
