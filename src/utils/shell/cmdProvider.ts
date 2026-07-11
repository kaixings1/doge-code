import { tmpdir } from 'os'
import { join } from 'path'
import type { ShellProvider } from './shellProvider.js'

/**
 * 为 cmd.exe 创建 ShellProvider。
 *
 * spawn 参数使用 ['/d', '/c', commandString]：
 * - /d：禁止 AutoRun，避免执行 autorun 脚本干扰命令结果
 * - /c：执行命令后退出
 *
 * 🔴 关键注意事项：
 * - 不要在 buildExecCommand 中追加任何 pwd 跟踪（如 & echo %cd% > file），
 *   因为 %cd% 展开后的路径可能包含空格/括号/特殊字符（如 Program Files (x86)），
 *   导致 The syntax of the command is incorrect 错误。
 * - pwd 跟踪由 Shell.ts 中的 result.then() 回调处理，
 *   如果 cwdFilePath 文件不存在则静默跳过。
 * - 不使用 /s：spawn 的参数不经过 CMD 命令行解析，每个参数独立传递给
 *   CreateProcessW，无需引号剥离。
 */
export function createCmdShellProvider(shellPath: string): ShellProvider {
  return {
    type: 'cmd' as ShellProvider['type'],
    shellPath,
    detached: false,

    async buildExecCommand(
      command: string,
      _opts: { id: number | string; sandboxTmpDir?: string; useSandbox: boolean },
    ): Promise<{ commandString: string; cwdFilePath: string }> {
      const cwdFilePath = join(tmpdir(), 'claude_cwd_' + _opts.id + '.txt')
      // 🔴 注意：不要在这里追加任何 pwd 跟踪命令！
      // %cd% 展开包含空格/括号时会导致语法错误。
      // CWD 跟踪由 Shell.ts 的 result.then() 在命令完成后处理，
      // 如果文件不存在则使用当前 cwd 而不是报错。
      return {
        commandString: command,
        cwdFilePath,
      }
    },

    getSpawnArgs(commandString: string): string[] {
      // /d: 禁止 AutoRun
      // /c: 执行命令后退出
      // 注意：commandString 中如果包含 & | > < 等连接符是合法的，
      // 因为 spawn 将它们作为 /c 参数整体传递给 CMD，CMD 会正确解析
      return ['/d', '/c', commandString]
    },

    async getEnvironmentOverrides(_command: string): Promise<Record<string, string>> {
      return {}
    },
  }
}
