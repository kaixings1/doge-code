import { tmpdir } from 'os'
import { join } from 'path'
import type { ShellProvider } from './shellProvider.js'

/**
 * cmd.exe 的 spawn args。
 * /d: 禁止 AutoRun（避免执行 autorun 脚本干扰命令结果）
 * /s: 禁用字符串替换行为
 * /c: 执行命令后退出
 */
function buildCmdArgs(cmd: string): string[] {
  return ['/d', '/s', '/c', cmd]
}

/**
 * 为 cmd.exe 创建 ShellProvider。
 * cmd.exe 是 Windows 原生 shell，没有 bash 的那些特性（extglob、pwd 跟踪等），
 * 但比 MSYS2 bash 更可靠——不会转义多行参数、不会乱改路径。
 */
export function createCmdShellProvider(shellPath: string): ShellProvider {
  return {
    type: 'bash' as any,
    shellPath,
    detached: false,

    async buildExecCommand(
      command: string,
      _opts: { id: number | string; sandboxTmpDir?: string; useSandbox: boolean },
    ): Promise<{ commandString: string; cwdFilePath: string }> {
      const cwdFilePath = join(tmpdir(), 'claude_cwd_' + _opts.id + '.txt')
      // chcp 65001 确保 UTF-8 编码输出
      const cmdPrefix = '@chcp 65001 >nul 2>&1 &&'
      const pwdSuffix = '&& echo %cd% > "' + cwdFilePath + '"'
      return {
        commandString: cmdPrefix + ' ' + command + ' ' + pwdSuffix,
        cwdFilePath,
      }
    },

    getSpawnArgs(commandString: string): string[] {
      return ['/d', '/s', '/c', commandString]
    },

    async getEnvironmentOverrides(_command: string): Promise<Record<string, string>> {
      return {}
    },
  }
}
