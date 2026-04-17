import { homedir } from 'os'
import { getGlobalConfig, saveGlobalConfig } from '../../../utils/config.js'
import { logForDebugging } from '../../../utils/debug.js'
import {
  execFileNoThrow,
  execFileNoThrowWithCwd,
} from '../../../utils/execFileNoThrow.js'
import { logError } from '../../../utils/log.js'

/**
 * Package manager types for installing it2.
 * Listed in order of preference.
 */
export type PythonPackageManager = 'uvx' | 'pipx' | 'pip'

/**
 * Result of attempting to install it2.
 */
export type It2InstallResult = {
  success: boolean
  error?: string
  packageManager?: PythonPackageManager
}

/**
 * Result of verifying it2 setup.
 */
export type It2VerifyResult = {
  success: boolean
  error?: string
  needsPythonApiEnabled?: boolean
}

/**
 * Detects which Python package manager is available on the system.
 * Checks in order of preference: uvx, pipx, pip.
 *
 * @returns The detected package manager, or null if none found
 */
export async function detectPythonPackageManager(): Promise<PythonPackageManager | null> {
  // 优先检查 uv（推荐用于隔离环境）
  // 我们检查 'uv' 因为 'uv tool install' 是安装命令
  const uvResult = await execFileNoThrow('which', ['uv'])
  if (uvResult.code === 0) {
    logForDebugging('[it2Setup] 找到 uv（将使用 uv tool install）')
    return 'uvx' // 保持类型名称兼容性
  }

  // 检查 pipx（适用于隔离环境）
  const pipxResult = await execFileNoThrow('which', ['pipx'])
  if (pipxResult.code === 0) {
    logForDebugging('[it2Setup] 找到 pipx 包管理器')
    return 'pipx'
  }

  // 检查 pip（备选方案）
  const pipResult = await execFileNoThrow('which', ['pip'])
  if (pipResult.code === 0) {
    logForDebugging('[it2Setup] 找到 pip 包管理器')
    return 'pip'
  }

  // 同时检查 pip3
  const pip3Result = await execFileNoThrow('which', ['pip3'])
  if (pip3Result.code === 0) {
    logForDebugging('[it2Setup] 找到 pip3 包管理器')
    return 'pip'
  }

  logForDebugging('[it2Setup] 未找到 Python 包管理器')
  return null
}

/**
 * Checks if the it2 CLI tool is installed and accessible.
 *
 * @returns true if it2 is available
 */
export async function isIt2CliAvailable(): Promise<boolean> {
  const result = await execFileNoThrow('which', ['it2'])
  return result.code === 0
}

/**
 * Installs the it2 CLI tool using the detected package manager.
 *
 * @param packageManager - The package manager to use for installation
 * @returns Result indicating success or failure
 */
export async function installIt2(
  packageManager: PythonPackageManager,
): Promise<It2InstallResult> {
  logForDebugging(`[it2Setup] 正在使用 ${packageManager} 安装 it2`)

  // 从主目录运行以避免读取项目级别的 pip.conf/uv.toml
  // 这些文件可能被恶意构造以重定向到攻击者的 PyPI 服务器
  let result
  switch (packageManager) {
    case 'uvx':
      // uv tool install it2 全局安装到隔离环境
      //（uvx 用于运行，uv tool install 用于安装）
      result = await execFileNoThrowWithCwd('uv', ['tool', 'install', 'it2'], {
        cwd: homedir(),
      })
      break
    case 'pipx':
      result = await execFileNoThrowWithCwd('pipx', ['install', 'it2'], {
        cwd: homedir(),
      })
      break
    case 'pip':
      // 使用 --user 安装无需 sudo
      result = await execFileNoThrowWithCwd(
        'pip',
        ['install', '--user', 'it2'],
        { cwd: homedir() },
      )
      if (result.code !== 0) {
        // 如果 pip 失败，尝试 pip3
        result = await execFileNoThrowWithCwd(
          'pip3',
          ['install', '--user', 'it2'],
          { cwd: homedir() },
        )
      }
      break
  }

  if (result.code !== 0) {
    const error = result.stderr || '未知安装错误'
    logError(new Error(`[it2Setup] 安装 it2 失败：${error}`))
    return {
      success: false,
      error,
      packageManager,
    }
  }

  logForDebugging('[it2Setup] it2 安装成功')
  return {
    success: true,
    packageManager,
  }
}

/**
 * Verifies that it2 is properly configured and can communicate with iTerm2.
 * This tests the Python API connection by running a simple it2 command.
 *
 * @returns Result indicating success or the specific failure reason
 */
export async function verifyIt2Setup(): Promise<It2VerifyResult> {
  logForDebugging('[it2Setup] 正在验证 it2 设置...')

  // 首先检查 it2 是否已安装
  const installed = await isIt2CliAvailable()
  if (!installed) {
    return {
      success: false,
      error: 'it2 CLI 未安装或不在 PATH 中',
    }
  }

  // 尝试列出会话 - 这会测试 Python API 连接
  const result = await execFileNoThrow('it2', ['session', 'list'])

  if (result.code !== 0) {
    const stderr = result.stderr.toLowerCase()

    // 检查常见的 Python API 错误
    if (
      stderr.includes('api') ||
      stderr.includes('python') ||
      stderr.includes('connection refused') ||
      stderr.includes('not enabled')
    ) {
      logForDebugging('[it2Setup] iTerm2 中未启用 Python API')
      return {
        success: false,
        error: 'iTerm2 偏好设置中未启用 Python API',
        needsPythonApiEnabled: true,
      }
    }

    return {
      success: false,
      error: result.stderr || '无法与 iTerm2 通信',
    }
  }

  logForDebugging('[it2Setup] it2 设置验证成功')
  return {
    success: true,
  }
}

/**
 * Returns instructions for enabling the Python API in iTerm2.
 */
export function getPythonApiInstructions(): string[] {
  return [
    '即将完成！请在 iTerm2 中启用 Python API：',
    '',
    '  iTerm2 → 设置 → 通用 → 魔法 → 启用 Python API',
    '',
    '启用后，可能需要重启 iTerm2。',
  ]
}

/**
 * Marks that it2 setup has been completed successfully.
 * This prevents showing the setup prompt again.
 */
export function markIt2SetupComplete(): void {
  const config = getGlobalConfig()
  if (config.iterm2It2SetupComplete !== true) {
    saveGlobalConfig(current => ({
      ...current,
      iterm2It2SetupComplete: true,
    }))
    logForDebugging('[it2Setup] 已标记 it2 设置完成')
  }
}

/**
 * Marks that the user prefers to use tmux over iTerm2 split panes.
 * This prevents showing the setup prompt when in iTerm2.
 */
export function setPreferTmuxOverIterm2(prefer: boolean): void {
  const config = getGlobalConfig()
  if (config.preferTmuxOverIterm2 !== prefer) {
    saveGlobalConfig(current => ({
      ...current,
      preferTmuxOverIterm2: prefer,
    }))
    logForDebugging(`[it2Setup] 设置 preferTmuxOverIterm2 = ${prefer}`)
  }
}

/**
 * Checks if the user prefers tmux over iTerm2 split panes.
 */
export function getPreferTmuxOverIterm2(): boolean {
  return getGlobalConfig().preferTmuxOverIterm2 === true
}
