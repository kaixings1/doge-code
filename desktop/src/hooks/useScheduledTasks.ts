import { useEffect, useRef } from 'react'
import { useAppStateStore, useSetAppState } from '../state/AppState.js'
import { isTerminalTaskStatus } from '../Task.js'
import {
  findTeammateTaskByAgentId,
  injectUserMessageToTeammate,
} from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import { isKairosCronEnabled } from '../tools/ScheduleCronTool/prompt.js'
import type { Message } from '../types/message.js'
import { getCronJitterConfig } from '../utils/cronJitterConfig.js'
import { createCronScheduler } from '../utils/cronScheduler.js'
import { removeCronTasks } from '../utils/cronTasks.js'
import { logForDebugging } from '../utils/debug.js'
import { enqueuePendingNotification } from '../utils/messageQueueManager.js'
import { createScheduledTaskFireMessage } from '../utils/messages.js'
import { WORKLOAD_CRON } from '../utils/workloadContext.js'

type Props = {
  isLoading: boolean
  /**
   * 为 true 时，绕过 isLoading 门控，使任务能在查询流式传输时入队，
   * 而非等到轮次结束后下一次 1 秒检查周期。Assistant 模式不再强制
   * --proactive（#20425），因此 isLoading 像普通 REPL 一样在轮次间
   * 下降——此绕过现在是延迟优化，而非饥饿修复。提示以 'later' 优先级
   * 入队，在轮次间排出。
   */
  assistantMode?: boolean
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
}

/**
 * cron 调度器的 REPL 包装器。挂载时启动调度器，卸载时清理。
 * 触发的提示以 'later' 优先级进入命令队列，REPL 通过
 * useCommandQueue 在轮次间排出。
 *
 * 调度器核心（定时器、文件监视器、触发逻辑）位于 cronScheduler.ts，
 * 以便 SDK/-p 模式共享——无头模式接线见 print.ts。
 */
export function useScheduledTasks({
  isLoading,
  assistantMode = false,
  setMessages,
}: Props): void {
  // 最新值 ref，确保调度器的 isLoading() 获取器不会捕获过期的闭包。
  // effect 只挂载一次；isLoading 每个轮次都会变化。
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  const store = useAppStateStore()
  const setAppState = useSetAppState()

  useEffect(() => {
    // 运行时门控在此处检查（而非 hook 调用处），使得 hook
    // 始终保持无条件挂载——rules-of-hooks 禁止在动态条件中包装
    // 调用。getFeatureValue_CACHED_WITH_REFRESH 从磁盘读取；
    // 5 分钟 TTL 触发后台重新获取，但 effect 不会在值变化时
    // 重新运行（assistantMode 是唯一的依赖），因此此守卫仅为
    // 启动粒度。会话中的终止开关是下面的 isKilled 选项——
    // check() 每个 tick 轮询它。
    if (!isKairosCronEnabled()) return

    // 系统生成——从队列预览和对话记录 UI 中隐藏。
    // 在简洁模式下，executeForkedSlashCommand 作为后台
    // 子代理运行，不返回可见消息。在普通模式下，
    // isMeta 仅对纯文本提示传播（通过 processTextPrompt）；
    // 像 /context:fork 这样的斜杠命令不会转发 isMeta，
    // 因此它们的消息在对话记录中保持可见。
    // 这是可接受的，因为普通模式不是定时任务的主要用例。
    const enqueueForLead = (prompt: string) =>
      enqueuePendingNotification({
        value: prompt,
        mode: 'prompt',
        priority: 'later',
        isMeta: true,
        // 传递到计费头部的 cc_workload= 属性块，以便 API
        // 在容量紧张时可以以较低的 QoS 服务 cron 发起的请求。
        // 没有用户正在等待此响应。
        workload: WORKLOAD_CRON,
      })

    const scheduler = createCronScheduler({
      // 遗漏任务浮出（onFire 回退）。队友 crons 始终是
      // 仅会话（durable:false），因此它们从不出现在遗漏列表中，
      // 该列表在调度器启动时从磁盘填充——此路径仅处理
      // 团队领导持久化 crons。
      onFire: enqueueForLead,
      // 正常触发接收完整的 CronTask，以便我们按 agentId 路由。
      onFireTask: task => {
        if (task.agentId) {
          const teammate = findTeammateTaskByAgentId(
            task.agentId,
            store.getState().tasks,
          )
          if (teammate && !isTerminalTaskStatus(teammate.status)) {
            injectUserMessageToTeammate(teammate.id, task.prompt, setAppState)
            return
          }
          // 队友已消失——清理孤立 cron，使其不会每个 tick 持续触发到空处。
          // 一次性 cron 无论如何会在触发后自动删除，但重复 cron 会
          // 一直循环直到自动过期。
          logForDebugging(
            `[ScheduledTasks] teammate ${task.agentId} gone, removing orphaned cron ${task.id}`,
          )
          void removeCronTasks([task.id])
          return
        }
        const msg = createScheduledTaskFireMessage(
          `Running scheduled task (${formatCronFireTime(new Date())})`,
        )
        setMessages(prev => [...prev, msg])
        enqueueForLead(task.prompt)
      },
      isLoading: () => isLoadingRef.current,
      assistantMode,
      getJitterConfig: getCronJitterConfig,
      isKilled: () => !isKairosCronEnabled(),
    })
    scheduler.start()
    return () => scheduler.stop()
    // assistantMode 在会话生命周期内是稳定的；store/setAppState 是
    // useSyncExternalStore 的稳定 ref；setMessages 是稳定的 useCallback。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantMode])
}

function formatCronFireTime(d: Date): string {
  return d
    .toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(/,? at |, /, ' ')
    .replace(/ ([AP]M)/, (_, ampm) => ampm.toLowerCase())
}
