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
    // [2026-10-20] 与 bashProvider 对齐：detached 让子进程脱离父进程组，
    // 父进程（doge-code）崩溃时不会连带子进程脱离可追踪的树。原本为 false，
    // 导致父进程被强杀后 cmd.exe 及其子进程成为无法通过 tree-kill 定位的孤儿。
    // Windows 上 detach 不创建新控制台窗口（另有 windowsHide: true 保障），
    // 也不影响 Ctrl+C：终止由 tree-kill(taskkill /T /F) 完成，不依赖进程组。
    // 注意：这意味着 cmd 子进程不再随父控制台的 Ctrl+C 自动收到信号，
    // 必须由 ShellCommand.#doKill 显式终止 —— 该路径已存在且是所有工具的统一出口。
    detached: true,

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
