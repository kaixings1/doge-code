/**
 * useWorkflowMode — Agent 编排层 Hook
 *
 * 根据当前上下文自动切换面板工作模式：
 * - 'chat'      — 正常对话模式
 * - 'edit'      — 内联编辑模式（用户按了 Ctrl+K）
 * - 'review'    — 代码审查模式（打开文件且有 git changes）
 * - 'debug'     — 调试模式（有活跃的 debug session）
 *
 * 面板可根据 mode 自动调整 UI 和快捷行为。
 */

import { useState, useCallback, useEffect, useRef } from 'react'

export type WorkflowMode = 'chat' | 'edit' | 'review' | 'debug'

export interface WorkflowModeState {
  mode: WorkflowMode
  /** 当前触发模式的原因（用于调试/展示） */
  reason?: string
  /** 是否有活跃的 AI 操作在进行 */
  isProcessing: boolean
  /** 用户是否手动锁定了模式（锁定后不会自动切换） */
  locked: boolean
  /** 切换到指定模式 */
  setMode: (mode: WorkflowMode, reason?: string) => void
  /** 锁定/解锁模式 */
  setLocked: (locked: boolean) => void
  /** 标记处理开始/结束 */
  setProcessing: (processing: boolean) => void
}

export function useWorkflowMode(
  selectedFile: string | null,
  gitChangesCount: number,
  hasDebugSession: boolean,
): WorkflowModeState {
  const [mode, setModeState] = useState<WorkflowMode>('chat')
  const [reason, setReason] = useState<string | undefined>(undefined)
  const [isProcessing, setProcessing] = useState(false)
  const [locked, setLockedState] = useState(false)
  const prevSelectedFile = useRef<string | null>(null)

  const setMode = useCallback((newMode: WorkflowMode, newReason?: string) => {
    setModeState(newMode)
    setReason(newReason)
  }, [])

  const setLocked = useCallback((v: boolean) => {
    setLockedState(v)
  }, [])

  // 当文件变化时自动推断模式
  useEffect(() => {
    if (locked) return
    // 如果文件刚被选中且有 git 变更，自动切换到 review 模式
    if (selectedFile && selectedFile !== prevSelectedFile.current) {
      prevSelectedFile.current = selectedFile
      if (gitChangesCount > 0) {
        setMode('review', `文件 "${selectedFile.split('/').pop()}" 有 ${gitChangesCount} 个变更待审查`)
      } else {
        setMode('chat', '已切换到对话模式')
      }
    }
    // 如果当前文件被关闭，回到 chat 模式
    if (!selectedFile && prevSelectedFile.current) {
      prevSelectedFile.current = null
      setMode('chat')
    }
  }, [selectedFile, gitChangesCount, setMode, locked])

  // 如果有活跃的 debug session，自动切换到 debug 模式
  useEffect(() => {
    if (locked) return
    if (hasDebugSession && mode !== 'edit') {
      setMode('debug', '检测到活跃的调试会话')
    }
  }, [hasDebugSession, mode, setMode, locked])

  return {
    mode,
    reason,
    isProcessing,
    locked,
    setMode,
    setLocked,
    setProcessing,
  }
}
