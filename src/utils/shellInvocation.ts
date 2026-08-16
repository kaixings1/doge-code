/**
 * Shell 调用工具
 * 吸收自 cline SDK (sdk/packages/shared/src/parse/shell.ts)
 *
 * - getShellKind: 将 shell 可执行文件分类为 powershell/cmd/wsl/posix
 * - getShellInvocation: 构建跨平台的 shell 调用参数（PowerShell 通过 UTF-8 stdin 避免命令行编码问题）
 */

export type ShellKind = 'powershell' | 'cmd' | 'wsl' | 'posix'

export interface ShellInvocation {
  args: string[]
  input?: string
}

/**
 * 将 shell 可执行文件名或路径标准化，用于家族匹配。
 */
function normalizeShellName(shell: string): string {
  const normalizedPath = shell.replaceAll('\\', '/')
  const lastSeparatorIndex = normalizedPath.lastIndexOf('/')
  const baseName =
    lastSeparatorIndex >= 0
      ? normalizedPath.slice(lastSeparatorIndex + 1)
      : normalizedPath
  return baseName.toLowerCase()
}

/**
 * 将 shell 可执行文件（名称或完整路径）分类到其家族。
 *
 * 此分类同时用于构建 spawn 参数（getShellInvocation）和 shell 专用提示。
 */
export function getShellKind(shell: string): ShellKind {
  const shellName = normalizeShellName(shell)

  if (
    shellName === 'powershell' ||
    shellName === 'powershell.exe' ||
    shellName === 'pwsh' ||
    shellName === 'pwsh.exe'
  ) {
    return 'powershell'
  }

  if (shellName === 'cmd' || shellName === 'cmd.exe') {
    return 'cmd'
  }

  if (shellName === 'wsl' || shellName === 'wsl.exe') {
    return 'wsl'
  }

  return 'posix'
}

/**
 * 构建跨平台命令执行的 shell 调用参数。
 *
 * 关键设计决策：
 * - PowerShell: 命令通过 UTF-8 stdin 传输（避免 Windows 代码页问题）
 * - WSL: 委托给默认发行版内的 bash
 * - POSIX: 使用 `-c` 标志
 */
export function getShellInvocation(
  shell: string,
  command: string,
): ShellInvocation {
  switch (getShellKind(shell)) {
    case 'powershell': {
      // PowerShell 的命令行解析器通过活动 Windows 代码页解码 -Command。
      // 保持命令行仅含 ASCII，通过 UTF-8 stdin 发送命令，并使重定向输出为 UTF-8。
      // Stdin 也避免因 base64 扩展而缩减 Windows 进程命令行限制。
      return {
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '[Console]::InputEncoding=[Text.UTF8Encoding]::new();' +
            '[Console]::OutputEncoding=[Text.UTF8Encoding]::new();' +
            '$c=[Console]::In.ReadToEnd();' +
            '$c+=[Environment]::NewLine+\'if(-not $?){exit 1}\';' +
            '& ([ScriptBlock]::Create($c))',
        ],
        input: command,
      }
    }
    case 'cmd':
      return { args: ['/d', '/s', '/c', command] }
    // wsl.exe 是默认 WSL 发行版的 Windows 启动器，不是 shell 本身。
    // 通过客户端的 bash 运行命令，使 `|` 和 `;` 等操作符由 bash 处理，
    // 而非作为 wsl.exe 参数处理。
    case 'wsl':
      return { args: ['bash', '-c', command] }
    case 'posix':
      return { args: ['-c', command] }
  }
}
