/**
 * 修复验证脚本：抓取真实 cleanupTerminalModes 的终端清理序列
 *
 * 背景：修复「会话结束但绿色空闲图标未清除」bug 的回归验证。
 * 方法：单文件运行（bun run），重定向 stdout 抓取 writeSync(1) 的原始字节，
 *       mock process.exit 防止杀进程，比较修复前后清理序列差异。
 *
 * 运行：
 *   bun run tests/verify-terminal-cleanup.ts > temp/out.bin 2> temp/err.txt
 *   然后检查 temp/out.bin 是否含 OSC 0 清空序列（\x1b]0;\x07）
 *
 * 对比数据（2026-09-19 实测）：
 *   - 修复前：win32 分支仅 process.title=''，不写任何 OSC 序列 → 绿色图标残留
 *   - 修复后：显式写 OSC 0 清空（\x1b]0;\x07）+ OSC 21337 清空 → 图标被清除
 */
import { resetShutdownState, gracefulShutdownSync } from '../src/utils/gracefulShutdown.js'

// ---- 环境准备 ----
try {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
} catch {
  console.error('[SETUP] isTTY define failed')
}
Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
// ant0 + NO_FLICKER=0：非全屏场景（修复针对的残留场景）
process.env.USER_TYPE = 'ant0'
process.env.CLAUDE_CODE_NO_FLICKER = '0'
delete process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE

// mock process.exit 阻止杀进程
const origExit = process.exit
;(process as any).exit = ((code?: number) => {
  console.error(`[MOCK] process.exit(${code}) 已拦截`)
  return undefined as never
}) as never

console.error('[SETUP] platform=win32, isTTY=true, USER_TYPE=ant0, NO_FLICKER=0')

// ---- 执行真实清理 ----
resetShutdownState()
console.error('[RUN] gracefulShutdownSync(0) ...')
gracefulShutdownSync(0, 'other')
await new Promise((r) => setTimeout(r, 200))
console.error('[DONE] 清理序列已写入 stdout（重定向文件），含 OSC 0 清空 = 修复生效')

;(process as any).exit = origExit
