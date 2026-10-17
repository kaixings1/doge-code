import { type UUID } from 'crypto'
import { getParentSessionId } from '../../bootstrap/state.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import type { LogOption } from '../../types/logs.js'
import {
  getLastSessionLog,
  isLiteLog,
  loadFullLog,
} from '../../utils/sessionStorage.js'

/**
 * /undo-clear — 撤销最近一次 /clear，恢复 clear 前的对话。
 *
 * 对齐官方 W26「/rewind can resume a conversation from before /clear」。
 * 官方把它并入 /rewind；本仓库 /rewind 是 git stash 文件检查点（不同语义，
 * 不混，见 .dogerules「不混无关改动」），故独立成 /undo-clear。
 *
 * 原理：/clear 调 regenerateSessionId({setCurrentAsParent:true})，旧会话
 * 落盘完整、ID 存入 STATE.parentSessionId（bootstrap/state.ts:431）。本命令
 * 读回它并走现成的 context.resume 通道——与 /resume 同一条流水线
 * （REPL.tsx:1617），复用其反序列化 / 切会话 / 重建对话逻辑。
 *
 * 限制：parentSessionId 仅存活于当前进程内存，重启进程后丢失；即仅
 * 「clear 后未退出 CLI」时可撤销。这正是官方目标场景（clear 后悔、立即撤销）。
 * 若需跨进程，用 /resume <sessionId>。
 */
export const call: LocalJSXCommandCall = async (onDone, context) => {
  const parentSessionId = getParentSessionId()

  if (!parentSessionId) {
    onDone('没有可撤销的 /clear（本会话尚未 clear 过，或已重启进程丢失 parent 链）。可用 /resume 选择历史会话。', {
      display: 'system',
    })
    return null
  }

  // 按 parent sessionId 读盘（getLastSessionLog 已封装 loadTranscriptFile + 链构建）。
  const directLog = await getLastSessionLog(parentSessionId as UUID)
  if (!directLog) {
    onDone('parent 会话转录不可读（可能已被清理）。可用 /resume 手动选择历史会话恢复。', {
      display: 'system',
    })
    return null
  }

  // 与 /resume handleSelect 一致：lite log 升级为 full log 再恢复。
  const log: LogOption = isLiteLog(directLog) ? await loadFullLog(directLog) : directLog

  try {
    // 现成 resume 通道，调用形态与 /resume 完全一致（resume.tsx:235）。
    await context.resume?.(parentSessionId as UUID, log, 'slash_command_session_id')
    onDone('已撤销 /clear，恢复上一个对话。', { display: 'system' })
  } catch (error) {
    onDone(`恢复失败：${error instanceof Error ? error.message : String(error)}`, {
      display: 'system',
    })
  }
  return null
}
