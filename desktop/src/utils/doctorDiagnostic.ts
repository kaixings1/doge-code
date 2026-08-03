import { execa } from 'execa'
import { readFile, realpath } from 'fs/promises'
import { homedir } from 'os'
import { delimiter, join, posix, win32 } from 'path'
import { checkGlobalInstallPermissions } from './autoUpdater.js'
import { isInBundledMode } from './bundledMode.js'
import {
  formatAutoUpdaterDisabledReason,
  getAutoUpdaterDisabledReason,
  getGlobalConfig,
  type InstallMethod,
} from './config.js'
import { getCwd } from './cwd.js'
import { isEnvTruthy } from './envUtils.js'
import { execFileNoThrow } from './execFileNoThrow.js'
import { getFsImplementation } from './fsOperations.js'
import {
  getShellType,
  isRunningFromLocalInstallation,
  localInstallationExists,
} from './localInstaller.js'
import {
  detectApk,
  detectAsdf,
  detectDeb,
  detectHomebrew,
  detectMise,
  detectPacman,
  detectRpm,
  detectWinget,
  getPackageManager,
} from './nativeInstaller/packageManagers.js'
import { getPlatform } from './platform.js'
import { getRipgrepStatus } from './ripgrep.js'
import { SandboxManager } from './sandbox/sandbox-adapter.js'
import { getManagedFilePath } from './settings/managedPath.js'
import { CUSTOMIZATION_SURFACES } from './settings/types.js'
import {
  findClaudeAlias,
  findValidClaudeAlias,
  getShellConfigPaths,
} from './shellConfig.js'
import { jsonParse } from './slowOperations.js'
import { which } from './which.js'

export type InstallationType =
  | 'npm-global'
  | 'npm-local'
  | 'native'
  | 'package-manager'
  | 'development'
  | 'unknown'

export type DiagnosticInfo = {
  installationType: InstallationType
  version: string
  installationPath: string
  invokedBinary: string
  configInstallMethod: InstallMethod | 'not set'
  autoUpdates: string
  hasUpdatePermissions: boolean | null
  multipleInstallations: Array<{ type: string; path: string }>
  warnings: Array<{ issue: string; fix: string }>
  recommendation?: string
  packageManager?: string
  ripgrepStatus: {
    working: boolean
    mode: 'system' | 'builtin' | 'embedded'
    systemPath: string | null
  }
}

function getNormalizedPaths(): [invokedPath: string, execPath: string] {
  let invokedPath = process.argv[1] || ''
  let execPath = process.execPath || process.argv[0] || ''

  // 在 Windows 上将反斜杠转换为正斜杠，保证路径匹配一致
  if (getPlatform() === 'windows') {
    invokedPath = invokedPath.split(win32.sep).join(posix.sep)
    execPath = execPath.split(win32.sep).join(posix.sep)
  }

  return [invokedPath, execPath]
}

export async function getCurrentInstallationType(): Promise<InstallationType> {
  if (process.env.NODE_ENV === 'development') {
    return 'development'
  }

  const [invokedPath] = getNormalizedPaths()

  // 首先检查是否运行在打包模式
  if (isInBundledMode()) {
    // 检查该打包实例是否由包管理器安装
    if (
      detectHomebrew() ||
      detectWinget() ||
      detectMise() ||
      detectAsdf() ||
      (await detectPacman()) ||
      (await detectDeb()) ||
      (await detectRpm()) ||
      (await detectApk())
    ) {
      return 'package-manager'
    }
    return 'native'
  }

  // 检查是否从本地 npm 安装运行
  if (isRunningFromLocalInstallation()) {
    return 'npm-local'
  }

  // 检查是否在典型的 npm 全局安装路径中
  const npmGlobalPaths = [
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
    '/opt/homebrew/lib/node_modules',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/.nvm/versions/node/', // nvm 安装
  ]

  if (npmGlobalPaths.some(path => invokedPath.includes(path))) {
    return 'npm-global'
  }

  // 即使不在标准路径，也检查路径中是否包含 npm/nvm
  if (invokedPath.includes('/npm/') || invokedPath.includes('/nvm/')) {
    return 'npm-global'
  }

  const npmConfigResult = await execa('npm config get prefix', {
    shell: true,
    reject: false,
  })
  const globalPrefix =
    npmConfigResult.exitCode === 0 ? npmConfigResult.stdout.trim() : null

  if (globalPrefix && invokedPath.startsWith(globalPrefix)) {
    return 'npm-global'
  }

  // 无法确定，返回 unknown
  return 'unknown'
}

async function getInstallationPath(): Promise<string> {
  if (process.env.NODE_ENV === 'development') {
    return getCwd()
  }

  // 对于打包/原生构建，显示二进制文件位置
  if (isInBundledMode()) {
    // 尝试查找实际调用的二进制文件
    try {
      return await realpath(process.execPath)
    } catch {
      // 该函数不预期错误
    }

    try {
      const path = await which('claude')
      if (path) {
        return path
      }
    } catch {
      // 该函数不预期错误
    }

    // 如果仍未找到，检查常见位置
    try {
      await getFsImplementation().stat(join(homedir(), '.local/bin/claude'))
      return join(homedir(), '.local/bin/claude')
    } catch {
      // 未找到
    }
    return 'native'
  }

  // 对于 npm 安装，使用可执行文件的路径
  try {
    return process.argv[0] || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function getInvokedBinary(): string {
  try {
    // 对于打包/编译的可执行文件，显示实际的二进制路径
    if (isInBundledMode()) {
      return process.execPath || 'unknown'
    }

    // 对于 npm/开发环境，显示脚本路径
    return process.argv[1] || 'unknown'
  } catch {
    return 'unknown'
  }
}

async function detectMultipleInstallations(): Promise<
  Array<{ type: string; path: string }>
> {
  const fs = getFsImplementation()
  const installations: Array<{ type: string; path: string }> = []

  // 检查本地安装
  const localPath = join(homedir(), '.claude', 'local')
  if (await localInstallationExists()) {
    installations.push({ type: 'npm-local', path: localPath })
  }

  // 检查全局 npm 安装
  const packagesToCheck = ['@anthropic-ai/claude-code']
  if (MACRO.PACKAGE_URL && MACRO.PACKAGE_URL !== '@anthropic-ai/claude-code') {
    packagesToCheck.push(MACRO.PACKAGE_URL)
  }
  const npmResult = await execFileNoThrow('npm', [
    '-g',
    'config',
    'get',
    'prefix',
  ])
  if (npmResult.code === 0 && npmResult.stdout) {
    const npmPrefix = npmResult.stdout.trim()
    const isWindows = getPlatform() === 'windows'

    // 首先通过 bin/claude 检查活动的安装
    // Linux / macOS 为 prefix/bin/claude 和 prefix/lib/node_modules
    // Windows 为 prefix/claude 和 prefix/node_modules
    const globalBinPath = isWindows
      ? join(npmPrefix, 'claude')
      : join(npmPrefix, 'bin', 'claude')

    let globalBinExists = false
    try {
      await fs.stat(globalBinPath)
      globalBinExists = true
    } catch {
      // 未找到
    }

    if (globalBinExists) {
      // 检查这是否实际上是 Homebrew cask 安装，而非 npm-global
      // 当 npm 通过 Homebrew 安装时，两者都可能存在于 /opt/homebrew/bin/claude
      // 我们需要解析符号链接以查看实际指向
      let isCurrentHomebrewInstallation = false

      try {
        // 解析符号链接获取实际目标
        const realPath = await realpath(globalBinPath)

        // 如果符号链接指向 Caskroom 目录，则为 Homebrew cask
        // 仅当它与当前正在运行的 Homebrew 安装相同时才跳过
        if (realPath.includes('/Caskroom/')) {
          isCurrentHomebrewInstallation = detectHomebrew()
        }
      } catch {
        // 如果无法解析符号链接，仍然包含它
      }

      if (!isCurrentHomebrewInstallation) {
        installations.push({ type: 'npm-global', path: globalBinPath })
      }
    } else {
      // 如果没有 bin/claude，检查是否有孤儿包（无 bin/claude 符号链接）
      for (const packageName of packagesToCheck) {
        const globalPackagePath = isWindows
          ? join(npmPrefix, 'node_modules', packageName)
          : join(npmPrefix, 'lib', 'node_modules', packageName)

        try {
          await fs.stat(globalPackagePath)
          installations.push({
            type: 'npm-global-orphan',
            path: globalPackagePath,
          })
        } catch {
          // 未找到包
        }
      }
    }
  }

  // 检查原生安装

  // 检查常见的原生安装路径
  const nativeBinPath = join(homedir(), '.local', 'bin', 'claude')
  try {
    await fs.stat(nativeBinPath)
    installations.push({ type: 'native', path: nativeBinPath })
  } catch {
    // 未找到
  }

  // 同时检查配置是否指示原生安装
  const config = getGlobalConfig()
  if (config.installMethod === 'native') {
    const nativeDataPath = join(homedir(), '.local', 'share', 'claude')
    try {
      await fs.stat(nativeDataPath)
      if (!installations.some(i => i.type === 'native')) {
        installations.push({ type: 'native', path: nativeDataPath })
      }
    } catch {
      // 未找到
    }
  }

  return installations
}

async function detectConfigurationIssues(
  type: InstallationType,
): Promise<Array<{ issue: string; fix: string }>> {
  const warnings: Array<{ issue: string; fix: string }> = []

  // 托管设置的前向兼容性：架构预处理器会静默丢弃
  // 未知的 strictPluginOnlyCustomization 表面名称，以便未来的一个枚举值
  // 不会使整个策略文件失效（settings.ts:101）。但管理员应该知晓——读取原始文件并比较。
  // 在开发模式提前返回前运行：这是配置正确性检查，而非安装路径检查，
  // 并且在开发测试中也有用。
  try {
    const raw = await readFile(
      join(getManagedFilePath(), 'managed-settings.json'),
      'utf-8',
    )
    const parsed: unknown = jsonParse(raw)
    const field =
      parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>).strictPluginOnlyCustomization
        : undefined
    if (field !== undefined && typeof field !== 'boolean') {
      if (!Array.isArray(field)) {
        // 架构中的 .catch(undefined) 会静默丢弃此值，因此其余的
        // 托管设置仍能存活——但管理员输入了错误的内容（一个对象、一个字符串等）。
        warnings.push({
          issue: `managed-settings.json：strictPluginOnlyCustomization 包含无效值（期望 true 或数组，实际为 ${typeof field}）`,
          fix: `该字段被静默忽略（架构 .catch 拯救了它）。请将其设置为 true，或设置为包含以下值的数组：${CUSTOMIZATION_SURFACES.join(', ')}。`,
        })
      } else {
        const unknown = field.filter(
          x =>
            typeof x === 'string' &&
            !(CUSTOMIZATION_SURFACES as readonly string[]).includes(x),
        )
        if (unknown.length > 0) {
          warnings.push({
            issue: `managed-settings.json：strictPluginOnlyCustomization 包含 ${unknown.length} 个此客户端无法识别的值：${unknown.map(String).join(', ')}`,
            fix: `这些值被静默忽略（前向兼容）。此版本已知的表面为：${CUSTOMIZATION_SURFACES.join(', ')}。请移除它们，或此客户端版本低于托管设置的预期。`,
          })
        }
      }
    }
  } catch {
    // ENOENT（无托管设置）/ 解析错误——不属于此检查的关注范围。
    // 解析错误由设置加载器本身处理。
  }

  const config = getGlobalConfig()

  // 开发模式下跳过大多数警告
  if (type === 'development') {
    return warnings
  }

  // 检查原生安装时 ~/.local/bin 是否在 PATH 中
  if (type === 'native') {
    const path = process.env.PATH || ''
    const pathDirectories = path.split(delimiter)
    const homeDir = homedir()
    const localBinPath = join(homeDir, '.local', 'bin')

    // 在 Windows 上将反斜杠转换为正斜杠，保证路径匹配一致
    let normalizedLocalBinPath = localBinPath
    if (getPlatform() === 'windows') {
      normalizedLocalBinPath = localBinPath.split(win32.sep).join(posix.sep)
    }

    // 检查 ~/.local/bin 是否在 PATH 中（处理展开和未展开形式）
    // 同时处理用户可能在 PATH 中包含的尾部斜杠
    const localBinInPath = pathDirectories.some(dir => {
      let normalizedDir = dir
      if (getPlatform() === 'windows') {
        normalizedDir = dir.split(win32.sep).join(posix.sep)
      }
      // 去除尾部斜杠用于比较（处理如 /home/user/.local/bin/ 的路径）
      const trimmedDir = normalizedDir.replace(/\/+$/, '')
      const trimmedRawDir = dir.replace(/[/\\]+$/, '')
      return (
        trimmedDir === normalizedLocalBinPath ||
        trimmedRawDir === '~/.local/bin' ||
        trimmedRawDir === '$HOME/.local/bin'
      )
    })

    if (!localBinInPath) {
      const isWindows = getPlatform() === 'windows'
      if (isWindows) {
        // Windows 特定的 PATH 指令
        const windowsLocalBinPath = localBinPath
          .split(posix.sep)
          .join(win32.sep)
        warnings.push({
          issue: `存在原生安装，但 ${windowsLocalBinPath} 不在您的 PATH 中`,
          fix: `添加路径：打开：系统属性 → 环境变量 → 编辑用户 PATH → 新建 → 添加上述路径。然后重启终端。`,
        })
      } else {
        // Unix 风格的 PATH 指令
        const shellType = getShellType()
        const configPaths = getShellConfigPaths()
        const configFile = configPaths[shellType as keyof typeof configPaths]
        const displayPath = configFile
          ? configFile.replace(homedir(), '~')
          : '您的 shell 配置文件'

        warnings.push({
          issue:
            '存在原生安装，但 ~/.local/bin 不在您的 PATH 中',
          fix: `运行：echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${displayPath} 然后打开新终端或运行：source ${displayPath}`,
        })
      }
    }
  }

  // 检查配置不匹配
  // 如果设置了 DISABLE_INSTALLATION_CHECKS（例如在 HFI 中），跳过这些检查
  if (!isEnvTruthy(process.env.DISABLE_INSTALLATION_CHECKS)) {
    if (type === 'npm-local' && config.installMethod !== 'local') {
      warnings.push({
        issue: `正在从本地安装运行，但配置安装方法为 '${config.installMethod}'`,
        fix: '考虑使用原生安装：claude install',
      })
    }

    if (type === 'native' && config.installMethod !== 'native') {
      warnings.push({
        issue: `正在运行原生安装，但配置安装方法为 '${config.installMethod}'`,
        fix: '运行 claude install 更新配置',
      })
    }
  }

  if (type === 'npm-global' && (await localInstallationExists())) {
    warnings.push({
      issue: '存在本地安装但未被使用',
      fix: '考虑使用原生安装：claude install',
    })
  }

  const existingAlias = await findClaudeAlias()
  const validAlias = await findValidClaudeAlias()

  // 检查是否从本地安装运行但不在 PATH 中
  if (type === 'npm-local') {
    // 检查 claude 是否已可通过 PATH 访问
    const whichResult = await which('claude')
    const claudeInPath = !!whichResult

    // 仅当 claude 不在 PATH 且没有有效别名时显示警告
    if (!claudeInPath && !validAlias) {
      if (existingAlias) {
        // 别名存在但指向无效目标
        warnings.push({
          issue: '本地安装不可访问',
          fix: `别名存在但指向无效目标：${existingAlias}。更新别名：alias claude="~/.claude/local/claude"`,
        })
      } else {
        // 没有别名且不在 PATH 中
        warnings.push({
          issue: '本地安装不可访问',
          fix: '创建别名：alias claude="~/.claude/local/claude"',
        })
      }
    }
  }

  return warnings
}

export function detectLinuxGlobPatternWarnings(): Array<{
  issue: string
  fix: string
}> {
  if (getPlatform() !== 'linux') {
    return []
  }

  const warnings: Array<{ issue: string; fix: string }> = []
  const globPatterns = SandboxManager.getLinuxGlobPatternWarnings()

  if (globPatterns.length > 0) {
    // 显示前 3 个模式，如果有更多则提示
    const displayPatterns = globPatterns.slice(0, 3).join(', ')
    const remaining = globPatterns.length - 3
    const patternList =
      remaining > 0 ? `${displayPatterns} (还有 ${remaining} 个)` : displayPatterns

    warnings.push({
      issue: `沙箱权限规则中的 Glob 模式在 Linux 上不完全受支持`,
      fix: `发现 ${globPatterns.length} 个模式：${patternList}。在 Linux 上，编辑/读取规则中的 Glob 模式将被忽略。`,
    })
  }

  return warnings
}

export async function getDoctorDiagnostic(): Promise<DiagnosticInfo> {
  const installationType = await getCurrentInstallationType()
  const version =
    typeof MACRO !== 'undefined' && MACRO.VERSION ? MACRO.VERSION : 'unknown'
  const installationPath = await getInstallationPath()
  const invokedBinary = getInvokedBinary()
  const multipleInstallations = await detectMultipleInstallations()
  const warnings = await detectConfigurationIssues(installationType)

  // 添加 Linux 沙箱的 Glob 模式警告
  warnings.push(...detectLinuxGlobPatternWarnings())

  // 运行原生安装时，添加关于残留 npm 安装的警告
  if (installationType === 'native') {
    const npmInstalls = multipleInstallations.filter(
      i =>
        i.type === 'npm-global' ||
        i.type === 'npm-global-orphan' ||
        i.type === 'npm-local',
    )

    const isWindows = getPlatform() === 'windows'

    for (const install of npmInstalls) {
      if (install.type === 'npm-global') {
        let uninstallCmd = 'npm -g uninstall @anthropic-ai/claude-code'
        if (
          MACRO.PACKAGE_URL &&
          MACRO.PACKAGE_URL !== '@anthropic-ai/claude-code'
        ) {
          uninstallCmd += ` && npm -g uninstall ${MACRO.PACKAGE_URL}`
        }
        warnings.push({
          issue: `残留的 npm 全局安装位于 ${install.path}`,
          fix: `运行：${uninstallCmd}`,
        })
      } else if (install.type === 'npm-global-orphan') {
        warnings.push({
          issue: `孤立的 npm 全局包位于 ${install.path}`,
          fix: isWindows
            ? `运行：rmdir /s /q "${install.path}"`
            : `运行：rm -rf ${install.path}`,
        })
      } else if (install.type === 'npm-local') {
        warnings.push({
          issue: `残留的 npm 本地安装位于 ${install.path}`,
          fix: isWindows
            ? `运行：rmdir /s /q "${install.path}"`
            : `运行：rm -rf ${install.path}`,
        })
      }
    }
  }

  const config = getGlobalConfig()

  // 获取配置值用于显示
  const configInstallMethod = config.installMethod || '未设置'

  // 检查全局安装的权限
  let hasUpdatePermissions: boolean | null = null
  if (installationType === 'npm-global') {
    const permCheck = await checkGlobalInstallPermissions()
    hasUpdatePermissions = permCheck.hasPermissions

    // 如果没有权限且未禁用自动更新，添加警告
    if (!hasUpdatePermissions && !getAutoUpdaterDisabledReason()) {
      warnings.push({
        issue: '自动更新权限不足',
        fix: '请执行以下操作之一：(1) 不使用 sudo 重新安装 node，或 (2) 使用 `claude install` 进行原生安装',
      })
    }
  }

  // 获取 ripgrep 状态和配置
  const ripgrepStatusRaw = getRipgrepStatus()

  // 提供简单的 ripgrep 状态信息
  const ripgrepStatus = {
    working: ripgrepStatusRaw.working ?? true, // 尚未测试时假定正常
    mode: ripgrepStatusRaw.mode,
    systemPath:
      ripgrepStatusRaw.mode === 'system' ? ripgrepStatusRaw.path : null,
  }

  // 如果从包管理器运行，获取包管理器信息
  const packageManager =
    installationType === 'package-manager'
      ? await getPackageManager()
      : undefined

  const diagnostic: DiagnosticInfo = {
    installationType,
    version,
    installationPath,
    invokedBinary,
    configInstallMethod,
    autoUpdates: (() => {
      const reason = getAutoUpdaterDisabledReason()
      return reason
        ? `已禁用（${formatAutoUpdaterDisabledReason(reason)}）`
        : '已启用'
    })(),
    hasUpdatePermissions,
    multipleInstallations,
    warnings,
    packageManager,
    ripgrepStatus,
  }

  return diagnostic
}