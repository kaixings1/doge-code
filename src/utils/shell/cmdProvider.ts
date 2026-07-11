import { tmpdir } from 'os'
import { join } from 'path'
import type { ShellProvider } from './shellProvider.js'

/**
 * 为 cmd.exe 创建 ShellProvider。
 *
 * spawn 参数使用 ['/d', '/c', commandString]：
 * - /d：禁止 AutoRun，避免执行 autorun 脚本干扰命令结果
 * - /c：执行命令后退出
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
      return {
        commandString: command,
        cwdFilePath,
      }
    },

    getSpawnArgs(commandString: string): string[] {
      return ['/d', '/c', commandString]
    },

    async getEnvironmentOverrides(_command: string): Promise<Record<string, string>> {
      return {}
    },
  }
}
