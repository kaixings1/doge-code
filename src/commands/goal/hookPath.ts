/**
 * 定位 goal 的 hook 脚本路径。
 *
 * 开发模式：__dirname 指向 src/commands/goal/
 * 编译后（doge.exe）：__dirname 为虚拟路径，回退到 exe 同目录 / cwd/src。
 * 与 src/source-manager.ts 的定位模式一致。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IS_BUNDLED = __dirname.includes('~BUN') || __dirname.includes('bundle')

export const GOAL_STOP_HOOK_BASENAME = 'goal-stop-hook.cjs'
export const GOAL_SESSIONSTART_HOOK_BASENAME = 'goal-sessionstart-hook.cjs'

/** 定位指定 hook 脚本的绝对路径（都找不到则返回源码候选路径兜底） */
function resolveHookPath(basename: string): string {
  const candidates: string[] = []

  if (!IS_BUNDLED) {
    candidates.push(path.join(__dirname, basename))
  } else {
    const exeDir = path.dirname(process.execPath)
    // 1. exe 同目录下的 commands/goal/
    candidates.push(path.join(exeDir, 'commands', 'goal', basename))
    // 2. exe 同目录直接放脚本
    candidates.push(path.join(exeDir, basename))
    // 3. cwd/src/commands/goal/（开发版运行）
    candidates.push(path.join(process.cwd(), 'src', 'commands', 'goal', basename))
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]!
}

/** Stop hook（裁判闭环闸门）脚本路径 */
export function getGoalStopHookPath(): string {
  return resolveHookPath(GOAL_STOP_HOOK_BASENAME)
}

/** SessionStart hook（跨会话恢复提示）脚本路径 */
export function getGoalSessionStartHookPath(): string {
  return resolveHookPath(GOAL_SESSIONSTART_HOOK_BASENAME)
}

/** 构造可在 hook 配置中执行的命令字符串：node "<path>" */
function hookCommand(scriptPath: string): string {
  return `node ${JSON.stringify(scriptPath)}`
}

/** Stop hook 的可执行命令串 */
export function getGoalStopHookCommand(): string {
  return hookCommand(getGoalStopHookPath())
}

/** SessionStart hook 的可执行命令串 */
export function getGoalSessionStartHookCommand(): string {
  return hookCommand(getGoalSessionStartHookPath())
}

/** Stop hook 命令中用于匹配/移除的标识 */
export const GOAL_HOOK_MARKER = GOAL_STOP_HOOK_BASENAME
