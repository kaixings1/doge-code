/**
 * 定位 goal-stop-hook.cjs 脚本路径。
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

const HOOK_BASENAME = 'goal-stop-hook.cjs'

/** 返回 hook 脚本的绝对路径（若都找不到则返回源码候选路径作为兜底） */
export function getGoalStopHookPath(): string {
  const candidates: string[] = []

  if (!IS_BUNDLED) {
    candidates.push(path.join(__dirname, HOOK_BASENAME))
  } else {
    const exeDir = path.dirname(process.execPath)
    // 1. exe 同目录下的 commands/goal/
    candidates.push(path.join(exeDir, 'commands', 'goal', HOOK_BASENAME))
    // 2. exe 同目录直接放脚本
    candidates.push(path.join(exeDir, HOOK_BASENAME))
    // 3. cwd/src/commands/goal/（开发版运行）
    candidates.push(path.join(process.cwd(), 'src', 'commands', 'goal', HOOK_BASENAME))
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]!
}

/** 构造可在 hook 配置中执行的命令字符串：node "<path>" */
export function getGoalStopHookCommand(): string {
  return `node ${JSON.stringify(getGoalStopHookPath())}`
}

/** hook 命令中用于匹配/移除的标识 */
export const GOAL_HOOK_MARKER = HOOK_BASENAME
