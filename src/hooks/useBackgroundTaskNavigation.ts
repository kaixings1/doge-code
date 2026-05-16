import { useEffect, useRef } from 'react'
import { KeyboardEvent } from '../ink/events/keyboard-event.js'
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- backward-compat bridge until REPL wires handleKeyDown to <Box onKeyDown>
import { useInput } from '../ink.js'
import {
  type AppState,
  useAppState,
  useSetAppState,
} from '../state/AppState.js'
import {
  enterTeammateView,
  exitTeammateView,
} from '../state/teammateViewHelpers.js'
import {
  getRunningTeammatesSorted,
  InProcessTeammateTask,
} from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
import {
  type InProcessTeammateTaskState,
  isInProcessTeammateTask,
} from '../tasks/InProcessTeammateTask/types.js'
import { isBackgroundTask } from '../tasks/types.js'

// 按增量步进队友选择，在 leader(-1)..teammates(0..n-1)..hide(n) 间循环。
// 从折叠树首次步进会展开树并停在 leader 上。
function stepTeammateSelection(
  delta: 1 | -1,
  setAppState: (updater: (prev: AppState) => AppState) => void,
): void {
  setAppState(prev => {
    const currentCount = getRunningTeammatesSorted(prev.tasks).length
    if (currentCount === 0) return prev

    if (prev.expandedView !== 'teammates') {
      return {
        ...prev,
        expandedView: 'teammates' as const,
        viewSelectionMode: 'selecting-agent',
        selectedIPAgentIndex: -1,
      }
    }

    const maxIdx = currentCount // hide row
    const cur = prev.selectedIPAgentIndex
    const next =
      delta === 1
        ? cur >= maxIdx
          ? -1
          : cur + 1
        : cur <= -1
          ? maxIdx
          : cur - 1
    return {
      ...prev,
      selectedIPAgentIndex: next,
      viewSelectionMode: 'selecting-agent',
    }
  })
}

/**
 * Custom hook that handles Shift+Up/Down keyboard navigation for background tasks.
 * When teammates (swarm) are present, navigates between leader and teammates.
 * When only non-teammate background tasks exist, opens the background tasks dialog.
 * Also handles Enter to confirm selection, 'f' to view transcript, and 'k' to kill.
 */
export function useBackgroundTaskNavigation(options?: {
  onOpenBackgroundTasks?: () => void
}): { handleKeyDown: (e: KeyboardEvent) => void } {
  const tasks = useAppState(s => s.tasks)
  const viewSelectionMode = useAppState(s => s.viewSelectionMode)
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId)
  const selectedIPAgentIndex = useAppState(s => s.selectedIPAgentIndex)
  const setAppState = useSetAppState()

  // 过滤出正在运行的队友并按字母排序，以匹配 TeammateSpinnerTree 显示
  const teammateTasks = getRunningTeammatesSorted(tasks)
  const teammateCount = teammateTasks.length

  // 检查非队友的后台任务（local_agent, local_bash 等）
  const hasNonTeammateBackgroundTasks = Object.values(tasks).some(
    t => isBackgroundTask(t) && t.type !== 'in_process_teammate',
  )

  // 跟踪先前的队友数量，以检测队友被移除的情况
  const prevTeammateCountRef = useRef<number>(teammateCount)

  // 当队友被移除时钳制选择索引，或在数量变为 0 时重置
  useEffect(() => {
    const prevCount = prevTeammateCountRef.current
    prevTeammateCountRef.current = teammateCount

    setAppState(prev => {
      const currentTeammates = getRunningTeammatesSorted(prev.tasks)
      const currentCount = currentTeammates.length

      // 当队友被移除（数量从 >0 变为 0）时，重置选择
      // 仅当之前有队友时才重置（不是在初始挂载为 0 时）
      // 如果正在查看队友转录，不要覆盖 viewSelectionMode —
      // 用户可能正在审查已完成的队友，需要通过 escape 退出
      if (
        currentCount === 0 &&
        prevCount > 0 &&
        prev.selectedIPAgentIndex !== -1
      ) {
        if (prev.viewSelectionMode === 'viewing-agent') {
          return {
            ...prev,
            selectedIPAgentIndex: -1,
          }
        }
        return {
          ...prev,
          selectedIPAgentIndex: -1,
          viewSelectionMode: 'none',
        }
      }

      // 如果索引越界则钳制
      // 当 spinner 树显示时，最大有效索引是 currentCount（"隐藏"行）
      const maxIndex =
        prev.expandedView === 'teammates' ? currentCount : currentCount - 1
      if (currentCount > 0 && prev.selectedIPAgentIndex > maxIndex) {
        return {
          ...prev,
          selectedIPAgentIndex: maxIndex,
        }
      }

      return prev
    })
  }, [teammateCount, setAppState])

  // 获取选中的队友的任务信息
  const getSelectedTeammate = (): {
    taskId: string
    task: InProcessTeammateTaskState
  } | null => {
    if (teammateCount === 0) return null
    const selectedIndex = selectedIPAgentIndex
    const task = teammateTasks[selectedIndex]
    if (!task) return null

    return { taskId: task.id, task }
  }

  const handleKeyDown = (e: KeyboardEvent): void => {
    // 查看模式下的 Escape：
    // - 如果队友正在运行：仅中止当前工作（停止当前轮次，队友保持存活）
    // - 如果队友未运行（已完成/已杀死/已失败）：退出视图返回 leader
    if (e.key === 'escape' && viewSelectionMode === 'viewing-agent') {
      e.preventDefault()
      const taskId = viewingAgentTaskId
      if (taskId) {
        const task = tasks[taskId]
        if (isInProcessTeammateTask(task) && task.status === 'running') {
          // 中止 currentWorkAbortController（停止当前轮次），而非 abortController（杀死队友）
          task.currentWorkAbortController?.abort()
          return
        }
      }
      // 队友未运行或任务不存在 — 退出视图
      exitTeammateView(setAppState)
      return
    }

    // 选择模式下的 Escape：退出选择，不中止 leader
    if (e.key === 'escape' && viewSelectionMode === 'selecting-agent') {
      e.preventDefault()
      setAppState(prev => ({
        ...prev,
        viewSelectionMode: 'none',
        selectedIPAgentIndex: -1,
      }))
      return
    }

    // Shift+Up/Down 用于切换队友转录（带循环）
    // 索引 -1 代表 leader，0+ 是队友
    // 当 showSpinnerTree 为 true 时，索引 === teammateCount 是"隐藏"行
    if (e.shift && (e.key === 'up' || e.key === 'down')) {
      e.preventDefault()
      if (teammateCount > 0) {
        stepTeammateSelection(e.key === 'down' ? 1 : -1, setAppState)
      } else if (hasNonTeammateBackgroundTasks) {
        options?.onOpenBackgroundTasks?.()
      }
      return
    }

    // 'f' to view selected teammate's transcript (only in selecting mode)
    if (
      e.key === 'f' &&
      viewSelectionMode === 'selecting-agent' &&
      teammateCount > 0
    ) {
      e.preventDefault()
      const selected = getSelectedTeammate()
      if (selected) {
        enterTeammateView(selected.taskId, setAppState)
      }
      return
    }

    // Enter 确认选择（仅在选择模式中）
    if (e.key === 'return' && viewSelectionMode === 'selecting-agent') {
      e.preventDefault()
      if (selectedIPAgentIndex === -1) {
        exitTeammateView(setAppState)
      } else if (selectedIPAgentIndex >= teammateCount) {
        // "Hide" row selected - collapse the spinner tree
        setAppState(prev => ({
          ...prev,
          expandedView: 'none' as const,
          viewSelectionMode: 'none',
          selectedIPAgentIndex: -1,
        }))
      } else {
        const selected = getSelectedTeammate()
        if (selected) {
          enterTeammateView(selected.taskId, setAppState)
        }
      }
      return
    }

    // k to kill selected teammate (only in selecting mode)
    if (
      e.key === 'k' &&
      viewSelectionMode === 'selecting-agent' &&
      selectedIPAgentIndex >= 0
    ) {
      e.preventDefault()
      const selected = getSelectedTeammate()
      if (selected && selected.task.status === 'running') {
        void InProcessTeammateTask.kill(selected.taskId, setAppState)
      }
      return
    }
  }

  // 向后兼容桥接：REPL.tsx 尚未将 handleKeyDown 连接到
  // <Box onKeyDown>。通过 useInput 订阅并适配 InputEvent →
  // KeyboardEvent，直到使用者完成迁移（单独 PR）。
  // TODO(onKeyDown-migration): remove once REPL passes handleKeyDown.
  useInput((_input, _key, event) => {
    handleKeyDown(new KeyboardEvent(event.keypress))
  })

  return { handleKeyDown }
}
