import { execFileSync, spawn,ChildProcess  } from 'child_process'
import { constants as fsConstants, readFileSync, unlinkSync } from 'fs'
import { type FileHandle, mkdir, open, realpath } from 'fs/promises'
import { memoize } from '../vendor/lodash.js'
import { isAbsolute, resolve } from 'path'
import { join as posixJoin } from 'path/posix'
import { logEvent } from '../services/analytics/index.js'
import {
  getOriginalCwd,
  getSessionId,
  setCwdState,
} from '../bootstrap/state.js'
import { generateTaskId } from '../Task.js'
import { pwd } from './cwd.js'
import { logForDebugging } from './debug.js'
import { errorMessage, isENOENT } from './errors.js'
import { getFsImplementation } from './fsOperations.js'
import { logError } from './log.js'
import {
  createAbortedCommand,
  createFailedCommand,
  type ShellCommand,
  wrapSpawn,
} from './ShellCommand.js'
import { getTaskOutputDir } from './task/diskOutput.js'
import { TaskOutput } from './task/TaskOutput.js'
import { which } from './which.js'

export type { ExecResult } from './ShellCommand.js'

import { accessSync } from 'fs'
import { onCwdChangedForHooks } from './hooks/fileChangedWatcher.js'
import { getClaudeTempDirName } from './permissions/filesystem.js'
import { getPlatform } from './platform.js'
import { SandboxManager } from './sandbox/sandbox-adapter.js'
import { invalidateSessionEnvCache } from './sessionEnvironment.js'
import { createBashShellProvider } from './shell/bashProvider.js'
import { getCachedPowerShellPath } from './shell/powershellDetection.js'
import { createPowerShellProvider } from './shell/powershellProvider.js'
import type { ShellProvider, ShellType } from './shell/shellProvider.js'
import { subprocessEnv } from './subprocessEnv.js'
import { posixPathToWindowsPath } from './windowsPaths.js'

// Windows cmd.exe 下执行命令通常很快（< 1 秒）。
// 30 分钟超时对 cmd.exe 来说太长——如果命令出错（如命令不存在），
// 用户会卡死 30 分钟。使用更短默认值，同时保留环境变量覆盖能力。
const DEFAULT_TIMEOUT = process.env.BASH_DEFAULT_TIMEOUT_MS
  ? parseInt(process.env.BASH_DEFAULT_TIMEOUT_MS, 10)
  : process.platform === 'win32'
    ? 5 * 60 * 1000 // Windows 默认 5 分钟
    : 30 * 60 * 1000 // 其他平台 30 分钟

export type ShellConfig = {
  provider: ShellProvider
}
export interface StreamingCommand {
  onStdout: (callback: (chunk: string) => void) => void;
  onStderr: (callback: (chunk: string) => void) => void;
  onClose: (callback: (code: number | null) => void) => void;
  kill: () => void;
}
/**
 * 创建一个流式命令执行器
 * @param command 要执行的命令
 * @param shell 使用的 shell (bash/powershell/cmd)
 * @param options 环境变量等
 */
export function createStreamingCommand(
  command: string,
  shell: 'bash' | 'powershell' | 'cmd' = 'bash',
  options?: { env?: Record<string, string> }
): StreamingCommand {
  const child: ChildProcess = spawn(command, {
    shell: shell,
    env: { ...process.env, ...options?.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    // 避免缓冲问题
  });
  const callbacks = {
    stdout: [] as Array<(chunk: string) => void>,
    stderr: [] as Array<(chunk: string) => void>,
    close: [] as Array<(code: number | null) => void>,
  };
  child.stdout?.on('data', (data: Buffer) => {
    const text = data.toString();
    callbacks.stdout.forEach(cb => cb(text));
  });
  child.stderr?.on('data', (data: Buffer) => {
    const text = data.toString();
    callbacks.stderr.forEach(cb => cb(text));
  });
  child.on('close', (code) => {
    callbacks.close.forEach(cb => cb(code));
  });
  return {
    onStdout: (cb) => callbacks.stdout.push(cb),
    onStderr: (cb) => callbacks.stderr.push(cb),
    onClose: (cb) => callbacks.close.push(cb),
    kill: () => child.kill(),
  };
}

function isExecutable(shellPath: string): boolean {
  try {
    accessSync(shellPath, fsConstants.X_OK)
    return true
  } catch (_err) {
    // Fallback for Nix and other environments where X_OK check might fail
    try {
      // Try to execute the shell with --version, which should exit quickly
      // Use execFileSync to avoid shell injection vulnerabilities
      execFileSync(shellPath, ['--version'], {
        timeout: 1000,
        stdio: 'ignore',
      })
      return true
    } catch {
      return false
    }
  }
}

/**
 * Determines the best available shell to use.
 */
export async function findSuitableShell(): Promise<string> {
  // 检查 CLAUDE_CODE_SHELL 显式覆盖
  const shellOverride = process.env.CLAUDE_CODE_SHELL
  if (shellOverride) {
    const shim = shellOverride.toLowerCase()
    const isBashOrZsh = shim.includes('bash') || shim.includes('zsh')
    const isWindowsShell = shim.includes('cmd') || shim.includes('powershell') || shim.includes('pwsh')
    if (isBashOrZsh && isExecutable(shellOverride)) {
      logForDebugging(`Using shell override: ${shellOverride}`)
      return shellOverride
    }
    if (isWindowsShell) {
      logForDebugging(`Using Windows shell override: ${shellOverride}`)
      return shellOverride
    }
    if (!isBashOrZsh && !isWindowsShell) {
      logForDebugging(
        `CLAUDE_CODE_SHELL="${shellOverride}" 不是支持的 shell (bash/zsh/cmd/powershell/pwsh)，回退到自动检测`,
      )
    }
  }

  const isWindows = process.platform === 'win32'

  //  Windows 默认行为：除非用户显式指定 bash/zsh，否则使用 cmd.exe
  // MSYS2/Git Bash 在多行内联代码（python3 -c、node -e 等）中会破坏
  // "、[、]、&、(、)、'、\ 等字符，导致所有文件创建操作不可靠。
  if (isWindows) {
    const envShell = process.env.SHELL
    const shellShim = (envShell || '').toLowerCase()

    // 检查用户是否通过 CLAUDE_CODE_SHELL_WANT_BASH 显式要求 bash
    // Git bash/MSYS2 在多行内联代码（python3 -c、node -e 等）中会破坏
    // "、[、]、&、(、)、'、\ 等字符，除非用户明确选择，默认禁止 bash
    if (process.env.CLAUDE_CODE_SHELL_WANT_BASH === '1') {
      if (shellShim.includes('bash') || shellShim.includes('zsh')) {
        if (envShell && isExecutable(envShell)) {
          logForDebugging(`Using bash/zsh from SHELL as explicitly requested via CLAUDE_CODE_SHELL_WANT_BASH: ${envShell}`)
          return envShell
        }
        const found = await which(shellShim.includes('bash') ? 'bash' : 'zsh')
        if (found && isExecutable(found)) {
          logForDebugging(`Using ${shellShim.includes('bash') ? 'bash' : 'zsh'} from which() via CLAUDE_CODE_SHELL_WANT_BASH: ${found}`)
          return found
        }
      }
      logForDebugging('CLAUDE_CODE_SHELL_WANT_BASH=1 but no bash/zsh found, falling back to cmd.exe')
    }

    // 默认使用 cmd.exe（无论是 SHELL 未设置、SHELL 为 cmd/powershell、还是找不到 bash）
    const cmdPath = 'C:\\Windows\\System32\\cmd.exe'
    logForDebugging(`Windows 默认使用 cmd.exe (SHELL=${envShell || '(未设置)'})`)
    return cmdPath
  }

  // ====== Linux / macOS 路径（原逻辑保持不变）======

  const env_shell = process.env.SHELL
  const isEnvShellSupported =
    env_shell && (env_shell.includes('bash') || env_shell.includes('zsh'))
  const preferBash = env_shell?.includes('bash')

  const [zshPath, bashPath] = await Promise.all([which('zsh'), which('bash')])

  const shellPaths = [
    '/bin',
    '/usr/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]

  const shellOrder = preferBash ? ['bash', 'zsh'] : ['zsh', 'bash']
  const supportedShells = shellOrder.flatMap(shell =>
    shellPaths.map(path => `${path}/${shell}`),
  )

  if (preferBash) {
    if (bashPath) supportedShells.unshift(bashPath)
    if (zshPath) supportedShells.push(zshPath)
  } else {
    if (zshPath) supportedShells.unshift(zshPath)
    if (bashPath) supportedShells.push(bashPath)
  }

  if (isEnvShellSupported && isExecutable(env_shell)) {
    supportedShells.unshift(env_shell)
  }

  const shellPath = supportedShells.find(shell => shell && isExecutable(shell))

  if (!shellPath) {
    const errorMsg =
      '未找到合适的 shell。Claude CLI 需要 Posix shell 环境。' +
      '请确保你已安装有效的 shell 并设置了 SHELL 环境变量。'
    logError(new Error(errorMsg))
    throw new Error(errorMsg)
  }

  return shellPath
}

async function getShellConfigImpl(): Promise<ShellConfig> {
  const binShell = await findSuitableShell()
  // 当 shellPath 是 cmd.exe 或 powershell 时，使用对应的 provider
  const shim = binShell.toLowerCase()
  if (shim.includes('cmd')) {
    // cmd.exe 使用简单的 shell provider，直接执行命令
    const { createCmdShellProvider } = await import('./shell/cmdProvider.js')
    const provider = createCmdShellProvider(binShell)
    return { provider }
  }
  if (shim.includes('powershell') || shim.includes('pwsh')) {
    const provider = createPowerShellProvider(binShell)
    return { provider }
  }
  const provider = await createBashShellProvider(binShell)
  return { provider }
}

// Memoize the entire shell config so it only happens once per session
export const getShellConfig = memoize(getShellConfigImpl)

export const getPsProvider = memoize(async (): Promise<ShellProvider> => {
  const psPath = await getCachedPowerShellPath()
  if (!psPath) {
    throw new Error('PowerShell 不可用')
  }
  return createPowerShellProvider(psPath)
})

let _cmdProvider: ShellProvider | null = null
async function getCmdProvider(): Promise<ShellProvider> {
  if (!_cmdProvider) {
    const { createCmdShellProvider } = await import('./shell/cmdProvider.js')
    _cmdProvider = createCmdShellProvider('C:\\Windows\\System32\\cmd.exe')
  }
  return _cmdProvider
}

// getResolveProvider：根据 shellType 字符串安全返回对应的 ShellProvider
// 使用 switch-case（而非对象映射），避免打包后对象键缺失导致的 "is not a function" 错误
async function getResolveProvider(shellType: string): Promise<ShellProvider> {
  const shim = (shellType || '').toLowerCase()
  switch (shim) {
    case 'cmd':
      return getCmdProvider()
    case 'powershell':
    case 'pwsh':
      return getPsProvider()
    case 'bash':
    case 'zsh':
      return (await getShellConfig()).provider
    default:
      logForDebugging(`[resolveProvider] 未知 shellType="${shellType}"，回退到 cmdProvider`)
      return getCmdProvider()
  }
}

// 扩展 ShellType 以支持 'cmd'
type ShellTypeInternal = ShellType | 'cmd'

export type ExecOptions = {
  timeout?: number
  onProgress?: (
    lastLines: string,
    allLines: string,
    totalLines: number,
    totalBytes: number,
    isIncomplete: boolean,
  ) => void
  preventCwdChanges?: boolean
  shouldUseSandbox?: boolean
  shouldAutoBackground?: boolean
  /** When provided, stdout is piped (not sent to file) and this callback fires on each data chunk. */
  onStdout?: (data: string) => void
}

/**
 * Execute a shell command using the environment snapshot
 * Creates a new shell process for each command execution
 */
export async function exec(
  command: string,
  abortSignal: AbortSignal,
  shellType: ShellType,
  options?: ExecOptions,
): Promise<ShellCommand> {
  //  Windows 安全保护：禁止 bashProvider 被调用（MSYS2 破坏内联代码）
  // 除非用户显式通过 CLAUDE_CODE_SHELL=xxx 或 CLAUDE_CODE_SHELL_WANT_BASH=1 授权
  // BashTool.tsx 中的命令归一化层会检查此逻辑的镜像版本，以确保方向正确。
  if (process.platform === 'win32' && !process.env.CLAUDE_CODE_SHELL_WANT_BASH) {
    const shim = (process.env.CLAUDE_CODE_SHELL || '').toLowerCase()
    if (!shim.includes('cmd') && !shim.includes('powershell') && !shim.includes('pwsh')) {
      // 强制降级到 cmd.exe
      const { createCmdShellProvider } = await import('./shell/cmdProvider.js')
      const cmdPath = 'C:\\Windows\\System32\\cmd.exe'
      logForDebugging(`[exec] Windows 安全保护：强制使用 cmd.exe (shellType=${shellType}, CLAUDE_CODE_SHELL=${process.env.CLAUDE_CODE_SHELL || '(未设置)'})`)
      return execWithProvider(command, abortSignal, createCmdShellProvider(cmdPath), options)
    }
  }

  // 如果 shellType 为 'cmd'，直接使用 cmdProvider
  if (shellType === 'cmd') {
    logForDebugging('[exec] shellType=cmd，使用 cmdProvider')
    const provider = await getCmdProvider()
    return execWithProvider(command, abortSignal, provider, options)
  }

  logForDebugging(`[exec] 通过 getResolveProvider 解析 shellType="${shellType}"`)
  const provider = await getResolveProvider(shellType)
  return execWithProvider(command, abortSignal, provider, options)
}

/**
 * 使用指定的 ShellProvider 执行命令（内部函数，供 exec 和 Windows 安全保护使用）
 */
async function execWithProvider(
  command: string,
  abortSignal: AbortSignal,
  provider: ShellProvider,
  options?: ExecOptions,
): Promise<ShellCommand> {
  const {
    timeout,
    onProgress,
    preventCwdChanges,
    shouldUseSandbox,
    shouldAutoBackground,
    onStdout,
  } = options ?? {}
  const commandTimeout = timeout || DEFAULT_TIMEOUT

  const id = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0')

  // Sandbox temp directory - use per-user directory name to prevent multi-user permission conflicts
  const sandboxTmpDir = posixJoin(
    process.env.CLAUDE_CODE_TMPDIR || '/tmp',
    getClaudeTempDirName(),
  )

  const { commandString: builtCommand, cwdFilePath } =
    await provider.buildExecCommand(command, {
      id,
      sandboxTmpDir: shouldUseSandbox ? sandboxTmpDir : undefined,
      useSandbox: shouldUseSandbox ?? false,
    })

  let commandString = builtCommand

  let cwd = pwd()

  // Recover if the current working directory no longer exists on disk.
  // This can happen when a command deletes its own CWD (e.g., temp dir cleanup).
  try {
    await realpath(cwd)
  } catch {
    const fallback = getOriginalCwd()
    logForDebugging(
      `Shell CWD "${cwd}" no longer exists, recovering to "${fallback}"`,
    )
    try {
      await realpath(fallback)
      setCwdState(fallback)
      cwd = fallback
    } catch {
      return createFailedCommand(
        `工作目录 "${cwd}" 不再存在。请从现有目录重新启动 Claude。`,
      )
    }
  }

  // If already aborted, don't spawn the process at all
  if (abortSignal.aborted) {
    return createAbortedCommand()
  }

  const binShell = provider.shellPath

  // Sandboxed PowerShell: wrapWithSandbox hardcodes `<binShell> -c '<cmd>'` —
  // using pwsh there would lose -NoProfile -NonInteractive (profile load
  // inside sandbox → delays, stray output, may hang on prompts). Instead:
  //   • powershellProvider.buildExecCommand (useSandbox) pre-wraps as
  //     `pwsh -NoProfile -NonInteractive -EncodedCommand <base64>` — base64
  //     survives the runtime's shellquote.quote() layer
  //   • pass /bin/sh as the sandbox's inner shell to exec that invocation
  //   • outer spawn is also /bin/sh -c to parse the runtime's POSIX output
  // /bin/sh exists on every platform where sandbox is supported.
  const isSandboxedPowerShell = shouldUseSandbox && shellType === 'powershell'
  const sandboxBinShell = isSandboxedPowerShell ? '/bin/sh' : binShell

  if (shouldUseSandbox) {
    commandString = await SandboxManager.wrapWithSandbox(
      commandString,
      sandboxBinShell,
      undefined,
      abortSignal,
    )
    // Create sandbox temp directory for sandboxed processes with secure permissions
    try {
      const fs = getFsImplementation()
      await fs.mkdir(sandboxTmpDir, { mode: 0o700 })
    } catch (error) {
      logForDebugging(`Failed to create ${sandboxTmpDir} directory: ${error}`)
    }
  }

  const spawnBinary = isSandboxedPowerShell ? '/bin/sh' : binShell
  const shellArgs = isSandboxedPowerShell
    ? ['-c', commandString]
    : provider.getSpawnArgs(commandString)
  const envOverrides = await provider.getEnvironmentOverrides(command)

  // When onStdout is provided, use pipe mode: stdout flows through
  // StreamWrapper → TaskOutput in-memory buffer instead of a file fd.
  // This lets callers receive real-time stdout callbacks.
  const usePipeMode = !!onStdout
  const taskId = generateTaskId('local_bash')
  const taskOutput = new TaskOutput(taskId, onProgress ?? null, !usePipeMode)
  await mkdir(getTaskOutputDir(), { recursive: true })

  // In file mode, both stdout and stderr go to the same file fd.
  // On POSIX, O_APPEND makes each write atomic (seek-to-end + write), so
  // stdout and stderr are interleaved chronologically without tearing.
  // On Windows, 'a' mode strips FILE_WRITE_DATA (only grants FILE_APPEND_DATA)
  // via libuv's fs__open. MSYS2/Cygwin probes inherited handles with
  // NtQueryInformationFile(FileAccessInformation) and treats handles without
  // FILE_WRITE_DATA as read-only, silently discarding all output. Using 'w'
  // grants FILE_GENERIC_WRITE. Atomicity is preserved because duplicated
  // handles share the same FILE_OBJECT with FILE_SYNCHRONOUS_IO_NONALERT,
  // which serializes all I/O through a single kernel lock.
  // SECURITY: O_NOFOLLOW prevents symlink-following attacks from the sandbox.
  // On Windows, use string flags — numeric flags can produce EINVAL through libuv.
  let outputHandle: FileHandle | undefined
  if (!usePipeMode) {
    const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0
    outputHandle = await open(
      taskOutput.path,
      process.platform === 'win32'
        ? 'w'
        : fsConstants.O_WRONLY |
            fsConstants.O_CREAT |
            fsConstants.O_APPEND |
            O_NOFOLLOW,
    )
  }

  try {
    const childProcess = spawn(spawnBinary, shellArgs, {
      env: {
        ...subprocessEnv(),
        SHELL: binShell,
        GIT_EDITOR: 'true',
        CLAUDECODE: '1',
        ...envOverrides,
        ...(process.env.USER_TYPE === 'ant'
          ? {
              CLAUDE_CODE_SESSION_ID: getSessionId(),
            }
          : {}),
      },
      cwd,
      stdio: usePipeMode
        ? ['pipe', 'pipe', 'pipe']
        : ['pipe', outputHandle?.fd, outputHandle?.fd],
      // Don't pass the signal - we'll handle termination ourselves with tree-kill
      detached: provider.detached,
      // Prevent visible console window on Windows (no-op on other platforms)
      windowsHide: true,
    })

    const shellCommand = wrapSpawn(
      childProcess,
      abortSignal,
      commandTimeout,
      taskOutput,
      shouldAutoBackground,
    )

    // Close our copy of the fd — the child has its own dup.
    // Must happen after wrapSpawn attaches 'error' listener, since the await
    // yields and the child's ENOENT 'error' event can fire in that window.
    // Wrapped in its own try/catch so a close failure (e.g. EIO) doesn't fall
    // through to the spawn-failure catch block, which would orphan the child.
    if (outputHandle !== undefined) {
      try {
        await outputHandle.close()
      } catch {
        // fd may already be closed by the child; safe to ignore
      }
    }

    // In pipe mode, attach the caller's callbacks alongside StreamWrapper.
    // Both listeners receive the same data chunks (Node.js ReadableStream supports
    // multiple 'data' listeners). StreamWrapper feeds TaskOutput for persistence;
    // these callbacks give the caller real-time access.
    if (childProcess.stdout && onStdout) {
      childProcess.stdout.on('data', (chunk: string | Buffer) => {
        onStdout(typeof chunk === 'string' ? chunk : chunk.toString())
      })
    }

    // Attach cleanup to the command result
    // NOTE: readFileSync/unlinkSync are intentional here — these must complete
    // synchronously within the .then() microtask so that callers who
    // `await shellCommand.result` see the updated cwd immediately after.
    // Using async readFile would introduce a microtask boundary, causing
    // a race where cwd hasn't been updated yet when the caller continues.

    // On Windows, cwdFilePath is a POSIX path (for bash's `pwd -P >| $path`),
    // but Node.js needs a native Windows path for readFileSync/unlinkSync.
    // Similarly, `pwd -P` outputs a POSIX path that must be converted before setCwd.
    const nativeCwdFilePath =
      getPlatform() === 'windows'
        ? posixPathToWindowsPath(cwdFilePath)
        : cwdFilePath

    void shellCommand.result.then(async result => {
      // On Linux, bwrap creates 0-byte mount-point files on the host to deny
      // writes to non-existent paths (.bashrc, HEAD, etc.). These persist after
      // bwrap exits as ghost dotfiles in cwd. Cleanup is synchronous and a no-op
      // on macOS. Keep before any await so callers awaiting .result see a clean
      // working tree in the same microtask.
      if (shouldUseSandbox) {
        SandboxManager.cleanupAfterCommand()
      }
      // Only foreground tasks update the cwd
      if (result && !preventCwdChanges && !result.backgroundTaskId) {
        try {
          let newCwd = readFileSync(nativeCwdFilePath, {
            encoding: 'utf8',
          }).trim()
          if (getPlatform() === 'windows') {
            newCwd = posixPathToWindowsPath(newCwd)
          }
          // cwd is NFC-normalized (setCwdState); newCwd from `pwd -P` may be
          // NFD on macOS APFS. Normalize before comparing so Unicode paths
          // don't false-positive as "changed" on every command.
          if (newCwd.normalize('NFC') !== cwd) {
            setCwd(newCwd, cwd)
            invalidateSessionEnvCache()
            void onCwdChangedForHooks(cwd, newCwd)
          }
        } catch {
          logEvent('tengu_shell_set_cwd', { success: false })
        }
      }
      // Clean up the temp file used for cwd tracking
      try {
        unlinkSync(nativeCwdFilePath)
      } catch {
        // File may not exist if command failed before pwd -P ran
      }
    })

    return shellCommand
  } catch (error) {
    // Close the fd if spawn failed (child never got its dup)
    if (outputHandle !== undefined) {
      try {
        await outputHandle.close()
      } catch {
        // May already be closed
      }
    }
    taskOutput.clear()

    logForDebugging(`Shell exec error: ${errorMessage(error)}`)

    return createAbortedCommand(undefined, {
      code: 126, // Standard Unix code for execution errors
      stderr: errorMessage(error),
    })
  }
}

/**
 * Set the current working directory
 */
export function setCwd(path: string, relativeTo?: string): void {
  const resolved = isAbsolute(path)
    ? path
    : resolve(relativeTo || getFsImplementation().cwd(), path)
  // Resolve symlinks to match the behavior of pwd -P.
  // realpathSync throws ENOENT if the path doesn't exist - convert to a
  // friendlier error message instead of a separate existsSync pre-check (TOCTOU).
  let physicalPath: string
  try {
    physicalPath = getFsImplementation().realpathSync(resolved)
  } catch (e) {
    if (isENOENT(e)) {
      throw new Error(`路径 "${resolved}" 不存在`)
    }
    throw e
  }

  setCwdState(physicalPath)
  if (process.env.NODE_ENV !== 'test') {
    try {
      logEvent('tengu_shell_set_cwd', {
        success: true,
      })
    } catch (_error) {
      // Ignore logging errors to prevent test failures
    }
  }
}
