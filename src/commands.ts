// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得重新排序
import { safeRequire, loadConditionalCommand } from './commands/loader.js'

// 动态扫描 commands/ 目录下所有 index.ts 文件，替代 200+ 静态导入
// eager: true 使导入同步执行，避免异步兼容问题
// 在 Node.js 等非 Bun 环境中 import.meta.glob 不可用，使用 fs 动态扫描降级
// import.meta.glob 在 Bun 编译时完成扫描，结果直接嵌入二进制
// 无需运行时 readdirSync 降级——编译后 import.meta.dir/url 指向虚拟路径，
// 磁盘上的 commands/ 目录不存在于二进制内部
let commandModules: Record<string, { default?: any }> = {}
// import.meta.glob 是 Bun 编译期特性，在测试环境（Vite 模拟）下会触发级联导入，
// 导致所有命令模块被静态加载并引发大量失败。检测到测试环境时直接跳过 glob，
// 降级到 fs.readdirSync 动态扫描。
const isTestEnv = process.env.NODE_ENV === 'test'
if (!isTestEnv) {
  try {
    commandModules = import.meta.glob('./commands/**/index.ts', { eager: true })
  } catch {
    // glob 不可用，降级到 fs 扫描
  }
}
if (Object.keys(commandModules).length === 0) {
  // import.meta.glob 不可用或跳过，使用 fs 动态扫描 commands/ 目录
  // 使用 import.meta.url 而非 import.meta.dir，因为 Bun 编译后 import.meta.dir
  // 可能被映射到虚拟路径（如 B:\~BUN\root\），导致 scandir 失败
  const fs = require('fs')
  const path = require('path')
  const baseDir = path.resolve(new URL('.', import.meta.url).pathname, 'commands')
  const modules: Record<string, { default?: any }> = {}
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = baseDir + '/' + entry.name
        const indexPath = dirPath + '/index.ts'
        const indexTsxPath = dirPath + '/index.tsx'
        const target = fs.existsSync(indexPath) ? indexPath : fs.existsSync(indexTsxPath) ? indexTsxPath : null
        if (!target) continue
        const allowed = ['index.ts', 'index.tsx']
        if (!allowed.includes(path.basename(target))) continue
        try {
          const mod = require(target)
          modules[entry.name] = mod
        } catch {
          // 静默跳过无法加载的模块
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        // 单文件命令（如 init.ts、workspace.ts、commit.ts 等）
        // ponytail: 文件名即命令名，仅限 commands/ 顶层 .ts 文件
        const filePath = baseDir + '/' + entry.name
        const commandName = entry.name.replace(/\.ts$/, '')
        try {
          const mod = require(filePath)
          modules[commandName] = mod
        } catch {
          // 静默跳过无法加载的模块
        }
      }
    }
  } catch {
    // 扫描目录失败，返回空对象
  }
  commandModules = modules
}

import { feature } from 'bun:bundle'
import { memoize } from './vendor/lodash.js'
import { isUsing3PServices, isClaudeAISubscriber } from './utils/auth.js'
import { isFirstPartyAnthropicBaseUrl } from './utils/model/providers.js'
import {
  type Command,
  getCommandName,
  isCommandEnabled,
} from './types/command.js'
import { toError } from './utils/errors.js'
import { logError } from './utils/log.js'
import { logForDebugging } from './utils/debug.js'
import {
  getSkillDirCommands,
  clearSkillCaches,
  getDynamicSkills,
} from './skills/loadSkillsDir.js'
import { getBundledSkills } from './skills/bundledSkills.js'
import { getBuiltinPluginSkillCommands } from './plugins/builtinPlugins.js'
import {
  getPluginCommands,
  clearPluginCommandCache,
  getPluginSkills,
  clearPluginSkillsCache,
} from './utils/plugins/loadPluginCommands.js'

// 从集中位置重新导出类型
export type {
  Command,
  CommandBase,
  CommandResultDisplay,
  LocalCommandResult,
  LocalJSXCommandContext,
  PromptCommand,
  ResumeEntrypoint,
} from './types/command.js'
export { getCommandName, isCommandEnabled } from './types/command.js'

/**
 * 检查给定名称是否匹配命令列表中的任何命令。
 * 匹配顺序：name → aliases → userFacingName（若提供）
 */
export function hasCommand(name: string, commands: Command[]): boolean {
  return commands.some(cmd => {
    if (cmd.name === name) return true
    if (cmd.aliases?.includes(name)) return true
    const userFacing = cmd.userFacingName?.()
    if (userFacing === name) return true
    return false
  })
}

/**
 * 在命令列表中按名称查找命令，返回匹配的 Command 对象或空值。
 * 匹配顺序：name → aliases → userFacingName（若提供）
 */
export function getCommand(name: string, commands: Command[]): Command | null {
  for (const cmd of commands) {
    if (cmd.name === name) return cmd
    if (cmd.aliases?.includes(name)) return cmd
    const userFacing = cmd.userFacingName?.()
    if (userFacing === name) return cmd
  }
  return null
}

/**
 * 与 getCommand 同义，用于在 slashCommand 处理等路径中保持语义清晰。
 */
export const findCommand = getCommand

/**
 * 格式化命令描述，附加上来源标签。
 * 用于建议列表中显示命令的来源信息。
 */
export function formatDescriptionWithSource(cmd: Command): string {
  const sourceLabel: Record<string, string> = {
    builtin: '内置',
    bundled: '捆绑',
    mcp: 'MCP',
    plugin: '插件',
    skills: '技能',
    commands_DEPRECATED: '命令',
    managed: '托管',
    userSettings: '用户',
    projectSettings: '项目',
    localSettings: '本地',
    flagSettings: '标志',
    policySettings: '管理',
  }
  const label = sourceLabel[cmd.source] ?? cmd.source
  return cmd.description + ' (' + label + ')'
}

// --- 动态命令加载 ---

/**
 * 从 glob 结果中提取标准命令
 */
function getGlobCommands(): Command[] {
  const commands: Command[] = []
  for (const mod of Object.values(commandModules)) {
    const cmd = (mod as { default?: Command }).default
    if (cmd) commands.push(cmd)
  }
  return commands
}

// --- 例外命令（非标准 index.ts 模式） ---

// insights 懒加载垫片：113KB 重型模块推迟到实际调用时加载
const usageReport: Command = {
  type: 'prompt',
  name: 'insights',
  description: '生成分析报告，分析你的 Claude Code 会话模式',
  contentLength: 0,
  progressMessage: '正在分析你的会话',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    const real = (await import('./commands/insights.js')).default
    if (real.type !== 'prompt') throw new Error('不可达代码')
    return real.getPromptForCommand(args, context)
  },
}

// 多导出命令映射（非标准默认导出）
const multiExportCommands: Record<string, () => Command | Command[] | null> = {
  contextNonInteractive: () => {
    const mod = require('./commands/context/index.ts')
    return mod.contextNonInteractive ?? null
  },
  ultrareview: () => {
    const mod = require('./commands/review.ts')
    return mod.ultrareview ?? null
  },
  resetLimits: () => {
    const mod = require('./commands/reset-limits/index.tsx')
    return mod.resetLimits ?? null
  },
  resetLimitsNonInteractive: () => {
    const mod = require('./commands/reset-limits/index.tsx')
    return mod.resetLimitsNonInteractive ?? null
  },
  loopShortcuts: () => {
    const mod = require('./commands/loop/shortcuts.ts')
    return mod.loopShortcuts ?? null
  },
}

// 条件命令映射（基于环境变量的 feature flag）
const conditionalCommands: Record<string, () => Command | null> = {
  agentsPlatform: () =>
    process.env.USER_TYPE === 'ant'
      ? safeRequire('./commands/agents-platform/index.js')?.default ?? null
      : null,
  proactive: () =>
    process.env['CLAUDE_CODE_FEATURE_PROACTIVE'] === '1' ||
    process.env['CLAUDE_CODE_FEATURE_KAIROS'] === '1'
      ? safeRequire('./commands/proactive.js')?.default ?? null
      : null,
  briefCommand: () =>
    process.env['CLAUDE_CODE_FEATURE_KAIROS'] === '1' ||
    process.env['CLAUDE_CODE_FEATURE_KAIROS_BRIEF'] === '1'
      ? safeRequire('./commands/brief.js')?.default ?? null
      : null,
  assistantCommand: () =>
    process.env['CLAUDE_CODE_FEATURE_KAIROS'] === '1'
      ? safeRequire('./commands/assistant/index.js')?.default ?? null
      : null,
  bridge: () =>
    process.env['CLAUDE_CODE_FEATURE_BRIDGE_MODE'] === '1'
      ? safeRequire('./commands/bridge/index.js')?.default ?? null
      : null,
  remoteControlServerCommand: () =>
    process.env['CLAUDE_CODE_FEATURE_DAEMON'] === '1' &&
    process.env['CLAUDE_CODE_FEATURE_BRIDGE_MODE'] === '1'
      ? safeRequire('./commands/remoteControlServer/index.js')?.default ?? null
      : null,
  voiceCommand: () =>
    process.env['CLAUDE_CODE_FEATURE_VOICE_MODE'] === '1'
      ? safeRequire('./commands/voice/index.js')?.default ?? null
      : null,
  forceSnip: () =>
    process.env['CLAUDE_CODE_FEATURE_HISTORY_SNIP'] === '1'
      ? safeRequire('./commands/force-snip.js')?.default ?? null
      : null,
  webCmd: () =>
    process.env['CLAUDE_CODE_FEATURE_CCR_REMOTE_SETUP'] === '1'
      ? safeRequire('./commands/remote-setup/index.js')?.default ?? null
      : null,
  subscribePr: () =>
    process.env['CLAUDE_CODE_FEATURE_KAIROS_GITHUB_WEBHOOKS'] === '1'
      ? safeRequire('./commands/subscribe-pr.js')?.default ?? null
      : null,
  ultraplan: () =>
    process.env['CLAUDE_CODE_FEATURE_ULTRAPLAN'] === '1'
      ? safeRequire('./commands/ultraplan.js')?.default ?? null
      : null,
  torch: () =>
    process.env['CLAUDE_CODE_FEATURE_TORCH'] === '1'
      ? safeRequire('./commands/torch.js')?.default ?? null
      : null,
  peersCmd: () =>
    process.env['CLAUDE_CODE_FEATURE_UDS_INBOX'] === '1'
      ? safeRequire('./commands/peers/index.js')?.default ?? null
      : null,
  forkCmd: () =>
    process.env['CLAUDE_CODE_FEATURE_FORK_SUBAGENT'] === '1'
      ? safeRequire('./commands/fork/index.js')?.default ?? null
      : null,
}

// --- COMMANDS 注册表 ---

const COMMANDS = (): Command[] => {
  const commands: Command[] = []

  // 1. 动态加载所有标准 commands/**/index.ts
  commands.push(...getGlobCommands())

  // 2. 多导出命令
  for (const [name, loader] of Object.entries(multiExportCommands)) {
    const result = loader()
    if (result) {
      commands.push(...(Array.isArray(result) ? result : [result]))
    }
  }

  // 3. 条件命令（feature flag）
  for (const [name, loader] of Object.entries(conditionalCommands)) {
    const result = loader()
    if (result) commands.push(result)
  }

  // 4. 懒加载命令
  commands.push(usageReport)

  return commands
}

export const builtInCommandNames = memoize(
  (): Set<string> =>
    new Set(COMMANDS().flatMap(_ => [_.name, ...(_.aliases ?? [])])),
)

// --- 技能/插件/工作流加载 ---

async function getSkills(cwd: string): Promise<{
  skillDirCommands: Command[]
  pluginSkills: Command[]
  bundledSkills: Command[]
  builtinPluginSkills: Command[]
}> {
  try {
    const [skillDirCommands, pluginSkills] = await Promise.all([
      getSkillDirCommands(cwd).catch(err => {
        logError(toError(err))
        logForDebugging('技能目录命令加载失败，将在无技能目录的情况下继续运行')
        return []
      }),
      getPluginSkills().catch(err => {
        logError(toError(err))
        logForDebugging('插件技能加载失败，将在无插件技能的情况下继续运行')
        return []
      }),
    ])
    const bundledSkills = getBundledSkills()
    const builtinPluginSkills = getBuiltinPluginSkillCommands()
    logForDebugging(
      `getSkills 返回：${skillDirCommands.length} 个技能目录命令，${pluginSkills.length} 个插件技能，${bundledSkills.length} 个内置技能，${builtinPluginSkills.length} 个内置插件技能`,
    )
    return {
      skillDirCommands,
      pluginSkills,
      bundledSkills,
      builtinPluginSkills,
    }
  } catch (err) {
    logError(toError(err))
    logForDebugging('❌ 错误: getSkills 中发生意外错误，返回空数组')
    return {
      skillDirCommands: [],
      pluginSkills: [],
      bundledSkills: [],
      builtinPluginSkills: [],
    }
  }
}

const getWorkflowCommands = loadConditionalCommand(
  () => process.env['CLAUDE_CODE_FEATURE_WORKFLOW_SCRIPTS'] === '1',
  () => (safeRequire('./tools/WorkflowTool/createWorkflowCommand.js') as { getWorkflowCommands: (cwd: string) => Promise<Command[]> } | null)?.getWorkflowCommands ?? null
)

/**
 * 根据命令声明的 `availability`（认证/提供商要求）进行过滤。
 * 没有 `availability` 的命令视为通用命令。
 * 此步骤在 `isEnabled()` 之前运行，以便无论功能开关状态如何，受提供商限制的命令都会被隐藏。
 *
 * 未进行 memoization —— 认证状态可能在会话中途改变（例如 /login 之后），
 * 因此必须在每次 getCommands() 调用时重新执行。
 */
export function meetsAvailabilityRequirement(cmd: Command): boolean {
  if (!cmd.availability) return true
  for (const a of cmd.availability) {
    switch (a) {
      case 'claude-ai':
        if (isClaudeAISubscriber()) return true
        break
      case 'console':
        // Console API 密钥用户 = 直接的一手 API 客户（非第三方，非 claude.ai）。
        // 排除未设置 ANTHROPIC_BASE_URL 的第三方（Bedrock/Vertex/Foundry）
        // 以及通过自定义基础 URL 代理的网关用户。
        if (
          !isClaudeAISubscriber() &&
          !isUsing3PServices() &&
          isFirstPartyAnthropicBaseUrl()
        )
          return true
        break
      default: {
        const _exhaustive: never = a
        void _exhaustive
        break
      }
    }
  }
  return false
}

/**
 * 加载所有命令源（技能、插件、工作流）。基于 cwd 进行 memoization，
 * 因为加载开销较大（磁盘 I/O、动态导入）。
 */
const loadAllCommandSources = memoize(async (cwd: string): Promise<Command[]> => {
  const [
    { skillDirCommands, pluginSkills, bundledSkills, builtinPluginSkills },
    pluginCommands,
    workflowCommands,
  ] = await Promise.all([
    getSkills(cwd),
    getPluginCommands(),
    getWorkflowCommands ? getWorkflowCommands(cwd) : Promise.resolve([]),
  ])

  return [
    ...bundledSkills,
    ...builtinPluginSkills,
    ...skillDirCommands,
    ...workflowCommands,
    ...pluginCommands,
    ...pluginSkills,
    ...COMMANDS(),
  ]
})

/**
 * 返回当前用户可用的命令。开销较大的加载部分已 memoization，
 * 但 availability 和 isEnabled 检查每次调用都会重新执行，
 * 以便认证变更（如 /login）能立即生效。
 */
export async function getCommands(cwd: string): Promise<Command[]> {
  const allCommands = await loadAllCommandSources(cwd)

  // 获取在文件操作期间发现的动态技能
  const dynamicSkills = getDynamicSkills()

  // 构建不含动态技能的基础命令列表
  const baseCommands = allCommands.filter(
    _ => meetsAvailabilityRequirement(_) && isCommandEnabled(_),
  )

  if (dynamicSkills.length === 0) {
    return baseCommands
  }

  // 动态技能去重 —— 仅添加尚未存在的
  const baseCommandNames = new Set(baseCommands.map(c => c.name))
  const uniqueDynamicSkills = dynamicSkills.filter(
    s =>
      !baseCommandNames.has(s.name) &&
      meetsAvailabilityRequirement(s) &&
      isCommandEnabled(s),
  )

  if (uniqueDynamicSkills.length === 0) {
    return baseCommands
  }

  // 将动态技能插入到插件技能之后、内置命令之前
  const builtInNames = new Set(COMMANDS().map(c => c.name))
  const insertIndex = baseCommands.findIndex(c => builtInNames.has(c.name))

  if (insertIndex === -1) {
    return [...baseCommands, ...uniqueDynamicSkills]
  }

  return [
    ...baseCommands.slice(0, insertIndex),
    ...uniqueDynamicSkills,
    ...baseCommands.slice(insertIndex),
  ]
}

/**
 * 仅清除命令的 memoization 缓存，而不清除技能缓存。
 * 当添加了动态技能时，使用此函数使缓存的命令列表失效。
 */
export function clearCommandMemoizationCaches(): void {
  loadAllCommandSources.cache?.clear?.()
  getSkillToolCommands.cache?.clear?.()
  getSlashCommandToolSkills.cache?.clear?.()
  // skillSearch/localSearch.ts 中的 getSkillIndex 是建立在
  // getSkillToolCommands/getCommands 之上的另一层 memoization。
  // 仅清除内部缓存对最外层是无效的 —— lodash memoize 会直接返回缓存结果，
  // 而不会进入已被清除的内层。必须显式清除它。
  if (process.env['CLAUDE_CODE_FEATURE_EXPERIMENTAL_SKILL_SEARCH'] === '1') {
    safeRequire('./services/skillSearch/localSearch.js')?.clearSkillIndexCache?.()
  }
}

export function clearCommandsCache(): void {
  clearCommandMemoizationCaches()
  clearPluginCommandCache()
  clearPluginSkillsCache()
  clearSkillCaches()
}

/**
 * SkillTool 展示模型可调用的所有基于 prompt 的命令。
 * 包括技能（来自 /skills/）和命令（来自 /commands/）。
 */
export const getSkillToolCommands = memoize(
  async (cwd: string): Promise<Command[]> => {
    const allCommands = await getCommands(cwd)
    return allCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        !cmd.disableModelInvocation &&
        cmd.source !== 'builtin' &&
        (cmd.loadedFrom === 'bundled' ||
          cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'commands_DEPRECATED' ||
          cmd.hasUserSpecifiedDescription ||
          cmd.whenToUse),
    )
  },
)

/**
 * 筛选命令，仅包含技能。技能是为模型提供专用能力的命令。
 */
export const getSlashCommandToolSkills = memoize(
  async (cwd: string): Promise<Command[]> => {
    try {
      const allCommands = await getCommands(cwd)
      return allCommands.filter(
        cmd =>
          cmd.type === 'prompt' &&
          cmd.source !== 'builtin' &&
          (cmd.hasUserSpecifiedDescription || cmd.whenToUse) &&
          (cmd.loadedFrom === 'skills' ||
            cmd.loadedFrom === 'plugin' ||
            cmd.loadedFrom === 'bundled' ||
            cmd.disableModelInvocation),
      )
    } catch (error) {
      logError(toError(error))
      logForDebugging('由于加载失败，返回空的技能数组')
      return []
    }
  },
)

/**
 * 筛选 AppState.mcp.commands 中属于 MCP 提供的技能（prompt 类型、模型可调用、从 MCP 加载）。
 * 这些技能存在于 getCommands() 之外，因此需要它们的调用方单独将 MCP 技能传入其技能索引。
 */
export function getMcpSkillCommands(
  mcpCommands: readonly Command[],
): readonly Command[] {
  if (feature('MCP_SKILLS')) {
    return mcpCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        cmd.loadedFrom === 'mcp' &&
        !cmd.disableModelInvocation,
    )
  }
  if (process.env['CLAUDE_CODE_FEATURE_MCP_SKILLS'] === '1') {
    return mcpCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        cmd.loadedFrom === 'mcp' &&
        !cmd.disableModelInvocation,
    )
  }
  return []
}

/**
 * 判断命令是否可在桥接/远程模式下安全执行。
 *
 * PromptCommand（type: 'prompt'）将内容作为 prompt 发送给模型，不依赖本地执行环境，因此是安全的。
 * LocalCommand（type: 'local'）需要本地 Node.js 执行环境，LocalJSXCommand（type: 'local-jsx'）
 * 需要本地 JSX 渲染，远程模式下均不可用。
 */
export function isBridgeSafeCommand(cmd: Command): boolean {
  return cmd.type === 'prompt'
}

/**
 * 返回可在远程模式（CCR）下安全执行的命令集合。
 * 仅包含 PromptCommand 类型且非敏感的的命令。
 */
export const getRemoteSafeCommands = memoize(
  (commands: readonly Command[]): Set<Command> => {
    return new Set(
      commands.filter(
        cmd =>
          cmd.type === 'prompt' &&
          !cmd.isSensitive &&
          isCommandEnabled(cmd),
      ),
    )
  },
)

/**
 * 过滤出可在远程模式（CCR）下安全执行的命令。
 *
 * 远程模式只有 PromptCommand（type: 'prompt'）是安全的——
 * 它们将内容作为 prompt 发送给模型，不依赖本地执行环境。
 * LocalCommand（type: 'local'）和 LocalJSXCommand（type: 'local-jsx'）
 * 都要求本地 Node.js 执行环境，远程模式下不可用。
 */
export function filterCommandsForRemoteMode(
  commands: readonly Command[],
): Command[] {
  const available = new Set(['claude-ai', 'console'])

  return commands.filter(
    cmd =>
      cmd.type === 'prompt' &&
      !cmd.isSensitive &&
      isCommandEnabled(cmd) &&
      (!cmd.availability ||
        cmd.availability.some(a => available.has(a))),
  )
}
