import type { Dirent, Stats } from 'fs'
import { readdir, readFile, stat } from 'fs/promises'
import * as path from 'path'
import { z } from 'zod/v4'
import { errorMessage, getErrnoCode, isENOENT } from '../errors.js'
import { FRONTMATTER_REGEX } from '../frontmatterParser.js'
import { jsonParse } from '../slowOperations.js'
import { parseYaml } from '../yaml.js'
import {
  PluginHooksSchema,
  PluginManifestSchema,
  PluginMarketplaceEntrySchema,
  PluginMarketplaceSchema,
} from './schemas.js'

/**
 * 属于 marketplace.json 条目（PluginMarketplaceEntrySchema）但不属于 plugin.json（PluginManifestSchema）的字段。
 * 插件作者容易将两者混淆复制。通过 `claude plugin validate` 作为警告呈现，因为这是已知的混淆点——
 * 加载路径通过 zod 的默认行为静默剥离所有未知键，因此在运行时无害，但值得向作者提示。
 */
const MARKETPLACE_ONLY_MANIFEST_FIELDS = new Set([
  'category',
  'source',
  'tags',
  'strict',
  'id',
])

export type ValidationResult = {
  success: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  filePath: string
  fileType: 'plugin' | 'marketplace' | 'skill' | 'agent' | 'command' | 'hooks'
}

export type ValidationError = {
  path: string
  message: string
  code?: string
}

export type ValidationWarning = {
  path: string
  message: string
}

/**
 * 检测文件是插件清单还是市场清单
 */
function detectManifestType(
  filePath: string,
): 'plugin' | 'marketplace' | 'unknown' {
  const fileName = path.basename(filePath)
  const dirName = path.basename(path.dirname(filePath))

  // 检查文件名模式
  if (fileName === 'plugin.json') return 'plugin'
  if (fileName === 'marketplace.json') return 'marketplace'

  // 检查是否位于 .claude-plugin 目录下
  if (dirName === '.claude-plugin') {
    return 'plugin' // 很可能是 plugin.json
  }

  return 'unknown'
}

/**
 * 将 Zod 验证错误格式化为可读格式
 */
function formatZodErrors(zodError: z.ZodError): ValidationError[] {
  return zodError.issues.map(error => ({
    path: error.path.join('.') || 'root',
    message: error.message,
    code: error.code,
  }))
}

/**
 * 检查路径字符串中是否包含父目录片段（'..'）。
 *
 * 对于 plugin.json 中的组件路径，这是一个安全隐患（可能逃逸插件目录）。
 * 对于 marketplace.json 中的源路径，几乎总是对解析基础的误解：
 * 路径相对于市场仓库根目录解析，而非 marketplace.json 所在位置，因此用户添加的
 * '..' 旨在“跳出 .claude-plugin/”是不必要的。调用方通过 `hint` 附加正确的解释。
 */
function checkPathTraversal(
  p: string,
  field: string,
  errors: ValidationError[],
  hint?: string,
): void {
  if (p.includes('..')) {
    errors.push({
      path: field,
      message: hint
        ? `路径包含 ".."：${p}。${hint}`
        : `路径包含 ".." 可能是路径遍历尝试：${p}`,
    })
  }
}

// 当市场插件源包含 '..' 时显示。大多数用户遇到此问题是因为他们期望路径相对于 marketplace.json（位于 .claude-plugin/ 内）解析，
// 但实际上解析从市场仓库根目录开始——参见 gh-29485。
// 根据用户的实际路径计算定制的“使用 X 代替 Y”建议，而非硬编码示例（针对 #20895 的审查反馈）。
function marketplaceSourceHint(p: string): string {
  // 剥离开头的 ../ 片段：用户添加的 '..' 旨在“跳出 .claude-plugin/”是不必要的，因为路径已从仓库根目录开始。
  // 如果 '..' 出现在路径中间（罕见），回退到通用示例。
  const stripped = p.replace(/^(\.\.\/)+/, '')
  const corrected = stripped !== p ? `./${stripped}` : './plugins/my-plugin'
  return (
    '插件源路径相对于市场根目录（包含 .claude-plugin/ 的目录）解析，而非相对于 marketplace.json。' +
    `请使用 "${corrected}" 代替 "${p}"。`
  )
}

/**
 * 验证插件清单文件（plugin.json）
 */
export async function validatePluginManifest(
  filePath: string,
): Promise<ValidationResult> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  const absolutePath = path.resolve(filePath)

  // 读取文件内容——直接处理 ENOENT / EISDIR / 权限错误
  let content: string
  try {
    content = await readFile(absolutePath, { encoding: 'utf-8' })
  } catch (error: unknown) {
    const code = getErrnoCode(error)
    let message: string
    if (code === 'ENOENT') {
      message = `文件未找到：${absolutePath}`
    } else if (code === 'EISDIR') {
      message = `路径不是文件：${absolutePath}`
    } else {
      message = `读取文件失败：${errorMessage(error)}`
    }
    return {
      success: false,
      errors: [{ path: 'file', message, code }],
      warnings: [],
      filePath: absolutePath,
      fileType: 'plugin',
    }
  }

  let parsed: unknown
  try {
    parsed = jsonParse(content)
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          path: 'json',
          message: `无效的 JSON 语法：${errorMessage(error)}`,
        },
      ],
      warnings: [],
      filePath: absolutePath,
      fileType: 'plugin',
    }
  }

  // 在 schema 验证之前检查解析后的 JSON 中的路径遍历
  // 这确保即使 schema 验证失败也能捕获安全问题
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>

    // 检查 commands
    if (obj.commands) {
      const commands = Array.isArray(obj.commands)
        ? obj.commands
        : [obj.commands]
      commands.forEach((cmd, i) => {
        if (typeof cmd === 'string') {
          checkPathTraversal(cmd, `commands[${i}]`, errors)
        }
      })
    }

    // 检查 agents
    if (obj.agents) {
      const agents = Array.isArray(obj.agents) ? obj.agents : [obj.agents]
      agents.forEach((agent, i) => {
        if (typeof agent === 'string') {
          checkPathTraversal(agent, `agents[${i}]`, errors)
        }
      })
    }

    // 检查 skills
    if (obj.skills) {
      const skills = Array.isArray(obj.skills) ? obj.skills : [obj.skills]
      skills.forEach((skill, i) => {
        if (typeof skill === 'string') {
          checkPathTraversal(skill, `skills[${i}]`, errors)
        }
      })
    }
  }

  // 在验证标记之前，先将仅限市场的字段作为警告呈现。
  // `claude plugin validate` 是一个开发者工具——运行它的作者想知道这些字段不属于此处。
  // 但这是警告而非错误：插件在运行时加载正常（基础 schema 会剥离未知键）。
  // 我们在此处剥离它们，以便下面的 .strict() 调用不会在有针对性的警告之上再次报告它们为未识别键错误。
  let toValidate = parsed
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    const strayKeys = Object.keys(obj).filter(k =>
      MARKETPLACE_ONLY_MANIFEST_FIELDS.has(k),
    )
    if (strayKeys.length > 0) {
      const stripped = { ...obj }
      for (const key of strayKeys) {
        delete stripped[key]
        warnings.push({
          path: key,
          message:
            `字段 '${key}' 属于市场条目（marketplace.json），而非 plugin.json。` +
            `此处无害但无用——Claude Code 在加载时会忽略它。`,
        })
      }
      toValidate = stripped
    }
  }

  // 根据 schema 进行验证（剥离后，以免市场字段导致失败）。
  // 尽管基础 schema 是宽松的，我们在此处局部调用 .strict() —— 运行时加载路径为弹性而静默剥离未知键，
  // 但这是一个开发者工具，运行它的作者希望获得拼写错误的反馈。
  const result = PluginManifestSchema().strict().safeParse(toValidate)

  if (!result.success) {
    errors.push(...formatZodErrors(result.error))
  }

  // 检查常见问题并添加警告
  if (result.success) {
    const manifest = result.data

    // 如果名称不是严格的 kebab-case 则发出警告。CC 的 schema 仅拒绝空格，
    // 但 Claude.ai 市场同步拒绝非 kebab 名称。在此处提示可让作者在同步失败前于 CI 中捕获。
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name)) {
      warnings.push({
        path: 'name',
        message:
          `插件名称 "${manifest.name}" 不是 kebab-case 格式。Claude Code 接受它，` +
          `但 Claude.ai 市场同步要求使用 kebab-case（仅小写字母、数字和连字符，例如 "my-plugin"）。`,
      })
    }

    // 如果未指定版本则警告
    if (!manifest.version) {
      warnings.push({
        path: 'version',
        message:
          '未指定版本。建议添加符合 semver 的版本（例如 "1.0.0"）',
      })
    }

    // 如果未提供描述则警告
    if (!manifest.description) {
      warnings.push({
        path: 'description',
        message:
          '未提供描述。添加描述有助于用户了解你的插件功能',
      })
    }

    // 如果未提供作者信息则警告
    if (!manifest.author) {
      warnings.push({
        path: 'author',
        message:
          '未提供作者信息。建议添加作者详情以标识插件归属',
      })
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    filePath: absolutePath,
    fileType: 'plugin',
  }
}

/**
 * 验证市场清单文件（marketplace.json）
 */
export async function validateMarketplaceManifest(
  filePath: string,
): Promise<ValidationResult> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  const absolutePath = path.resolve(filePath)

  // 读取文件内容——直接处理 ENOENT / EISDIR / 权限错误
  let content: string
  try {
    content = await readFile(absolutePath, { encoding: 'utf-8' })
  } catch (error: unknown) {
    const code = getErrnoCode(error)
    let message: string
    if (code === 'ENOENT') {
      message = `文件未找到：${absolutePath}`
    } else if (code === 'EISDIR') {
      message = `路径不是文件：${absolutePath}`
    } else {
      message = `读取文件失败：${errorMessage(error)}`
    }
    return {
      success: false,
      errors: [{ path: 'file', message, code }],
      warnings: [],
      filePath: absolutePath,
      fileType: 'marketplace',
    }
  }

  let parsed: unknown
  try {
    parsed = jsonParse(content)
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          path: 'json',
          message: `无效的 JSON 语法：${errorMessage(error)}`,
        },
      ],
      warnings: [],
      filePath: absolutePath,
      fileType: 'marketplace',
    }
  }

  // 在 schema 验证之前检查插件源中的路径遍历
  // 这确保即使 schema 验证失败也能捕获安全问题
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>

    if (Array.isArray(obj.plugins)) {
      obj.plugins.forEach((plugin: unknown, i: number) => {
        if (plugin && typeof plugin === 'object' && 'source' in plugin) {
          const source = (plugin as { source: unknown }).source
          // 检查字符串源（相对路径）
          if (typeof source === 'string') {
            checkPathTraversal(
              source,
              `plugins[${i}].source`,
              errors,
              marketplaceSourceHint(source),
            )
          }
          // 检查对象源中的 .path（git-subdir：远程仓库中的子目录，稀疏克隆）。
          // 此处的 '..' 是远程仓库树内的真正遍历尝试，而非市场根目录误解——保持安全表述（无 marketplaceSourceHint）。
          if (
            source &&
            typeof source === 'object' &&
            'path' in source &&
            typeof (source as { path: unknown }).path === 'string'
          ) {
            checkPathTraversal(
              (source as { path: string }).path,
              `plugins[${i}].source.path`,
              errors,
            )
          }
        }
      })
    }
  }

  // 根据 schema 进行验证。
  // 基础 schema 是宽松的（为运行时弹性剥离未知键），但这是开发者工具——作者希望获得拼写错误的反馈。
  // 我们在此处用 .strict() 重建 schema。注意外部对象的 .strict() 不会传播到 z.array() 元素内部，
  // 因此我们还用严格条目覆盖 plugins 数组，以便同样捕获单个插件条目内部的拼写错误。
  const strictMarketplaceSchema = PluginMarketplaceSchema()
    .extend({
      plugins: z.array(PluginMarketplaceEntrySchema().strict()),
    })
    .strict()
  const result = strictMarketplaceSchema.safeParse(parsed)

  if (!result.success) {
    errors.push(...formatZodErrors(result.error))
  }

  // 检查常见问题并添加警告
  if (result.success) {
    const marketplace = result.data

    // 如果没有插件则警告
    if (!marketplace.plugins || marketplace.plugins.length === 0) {
      warnings.push({
        path: 'plugins',
        message: '市场未定义任何插件',
      })
    }

    // 检查每个插件条目
    if (marketplace.plugins) {
      marketplace.plugins.forEach((plugin, i) => {
        // 检查重复的插件名称
        const duplicates = marketplace.plugins.filter(
          p => p.name === plugin.name,
        )
        if (duplicates.length > 1) {
          errors.push({
            path: `plugins[${i}].name`,
            message: `在市场中发现重复的插件名称 "${plugin.name}"`,
          })
        }
      })

      // 版本不匹配检查：对于声明了版本的本地源条目，与插件自身的 plugin.json 进行比较。
      // 安装时，calculatePluginVersion（pluginVersioning.ts）优先使用清单版本而静默忽略条目版本——
      // 因此过期的 entry.version 会导致用户困惑（市场 UI 显示一个版本，/status 安装后显示另一个版本）。
      // 仅限本地源：远程源需要克隆才能检查。
      const manifestDir = path.dirname(absolutePath)
      const marketplaceRoot =
        path.basename(manifestDir) === '.claude-plugin'
          ? path.dirname(manifestDir)
          : manifestDir
      for (const [i, entry] of marketplace.plugins.entries()) {
        if (
          !entry.version ||
          typeof entry.source !== 'string' ||
          !entry.source.startsWith('./')
        ) {
          continue
        }
        const pluginJsonPath = path.join(
          marketplaceRoot,
          entry.source,
          '.claude-plugin',
          'plugin.json',
        )
        let manifestVersion: string | undefined
        try {
          const raw = await readFile(pluginJsonPath, { encoding: 'utf-8' })
          const parsed = jsonParse(raw) as { version?: unknown }
          if (typeof parsed.version === 'string') {
            manifestVersion = parsed.version
          }
        } catch {
          // 缺失或无法读取的 plugin.json 由其他错误报告，此处继续
          continue
        }
        if (manifestVersion && manifestVersion !== entry.version) {
          warnings.push({
            path: `plugins[${i}].version`,
            message:
              `条目声明版本为 "${entry.version}"，但 ${entry.source}/.claude-plugin/plugin.json 显示为 "${manifestVersion}"。` +
              `安装时，plugin.json 优先（calculatePluginVersion 优先级）——条目版本被静默忽略。` +
              `请将此条目更新为 "${manifestVersion}" 以保持一致。`,
          })
        }
      }
    }

    // 如果元数据中无描述则警告
    if (!marketplace.metadata?.description) {
      warnings.push({
        path: 'metadata.description',
        message:
          '未提供市场描述。添加描述有助于用户了解此市场提供的内容',
      })
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    filePath: absolutePath,
    fileType: 'marketplace',
  }
}
/**
 * 验证插件组件 Markdown 文件中的 YAML 前置元数据。
 *
 * 运行时加载器（parseFrontmatter）会将无法解析的 YAML 静默丢弃到调试日志并返回空对象。
 * 这是加载路径正确的弹性选择，但运行 `claude plugin validate` 的作者希望获得明确信号。
 * 此处重新解析前置元数据块，并将加载器静默丢弃的内容呈现出来。
 */
function validateComponentFile(
  filePath: string,
  content: string,
  fileType: 'skill' | 'agent' | 'command',
): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const match = content.match(FRONTMATTER_REGEX)
  if (!match) {
    warnings.push({
      path: 'frontmatter',
      message:
        '未找到前置元数据块。请在文件顶部添加 YAML 前置元数据，置于 --- 分隔符之间，以设置描述及其他元数据。',
    })
    return { success: true, errors, warnings, filePath, fileType }
  }

  const frontmatterText = match[1] || ''
  let parsed: unknown
  try {
    parsed = parseYaml(frontmatterText)
  } catch (e) {
    errors.push({
      path: 'frontmatter',
      message:
        `YAML 前置元数据解析失败：${errorMessage(e)}。` +
        `运行时，此 ${fileType} 将以空元数据加载（所有前置元数据字段将被静默丢弃）。`,
    })
    return { success: false, errors, warnings, filePath, fileType }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push({
      path: 'frontmatter',
      message:
        '前置元数据必须为 YAML 映射（键值对），收到的是 ' +
        `${Array.isArray(parsed) ? '数组' : parsed === null ? 'null' : typeof parsed}。`,
    })
    return { success: false, errors, warnings, filePath, fileType }
  }

  const fm = parsed as Record<string, unknown>

  // description：必须是标量。coerceDescriptionToString 在运行时会记录并丢弃数组/对象。
  if (fm.description !== undefined) {
    const d = fm.description
    if (
      typeof d !== 'string' &&
      typeof d !== 'number' &&
      typeof d !== 'boolean' &&
      d !== null
    ) {
      errors.push({
        path: 'description',
        message:
          `description 必须为字符串，收到的是 ${Array.isArray(d) ? '数组' : typeof d}。` +
          `运行时该值将被丢弃。`,
      })
    }
  } else {
    warnings.push({
      path: 'description',
      message:
        `前置元数据中无 description。描述有助于用户和 Claude 理解何时使用此 ${fileType}。`,
    })
  }

  // name：如果存在，必须是字符串（skills/commands 用作 displayName；插件 agents 用作 agentType 词干——非字符串会字符串化为垃圾）
  if (
    fm.name !== undefined &&
    fm.name !== null &&
    typeof fm.name !== 'string'
  ) {
    errors.push({
      path: 'name',
      message: `name 必须为字符串，收到的是 ${typeof fm.name}。`,
    })
  }

  // allowed-tools：字符串或字符串数组
  const at = fm['allowed-tools']
  if (at !== undefined && at !== null) {
    if (typeof at !== 'string' && !Array.isArray(at)) {
      errors.push({
        path: 'allowed-tools',
        message: `allowed-tools 必须为字符串或字符串数组，收到的是 ${typeof at}。`,
      })
    } else if (Array.isArray(at) && at.some(t => typeof t !== 'string')) {
      errors.push({
        path: 'allowed-tools',
        message: 'allowed-tools 数组必须仅包含字符串。',
      })
    }
  }

  // shell: 'bash' | 'powershell'（控制 !`cmd` 块路由）
  const sh = fm.shell
  if (sh !== undefined && sh !== null) {
    if (typeof sh !== 'string') {
      errors.push({
        path: 'shell',
        message: `shell 必须为字符串，收到的是 ${typeof sh}。`,
      })
    } else {
      // 规范化以匹配 parseShellFrontmatter() 运行时行为——`shell: PowerShell` 不应验证失败但应在运行时工作。
      const normalized = sh.trim().toLowerCase()
      if (normalized !== 'bash' && normalized !== 'powershell') {
        errors.push({
          path: 'shell',
          message: `shell 必须为 'bash' 或 'powershell'，收到的是 '${sh}'。`,
        })
      }
    }
  }

  return { success: errors.length === 0, errors, warnings, filePath, fileType }
}

/**
 * 验证插件的 hooks.json 文件。与前置元数据不同，此文件在运行时会硬错误（pluginLoader 使用 .parse() 而非 .safeParse()）——错误的 hooks.json 会破坏整个插件加载。
 * 在此处呈现是至关重要的。
 */
async function validateHooksJson(filePath: string): Promise<ValidationResult> {
  let content: string
  try {
    content = await readFile(filePath, { encoding: 'utf-8' })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    // ENOENT 是正常的——钩子是可选的
    if (code === 'ENOENT') {
      return {
        success: true,
        errors: [],
        warnings: [],
        filePath,
        fileType: 'hooks',
      }
    }
    return {
      success: false,
      errors: [
        { path: 'file', message: `读取文件失败：${errorMessage(e)}` },
      ],
      warnings: [],
      filePath,
      fileType: 'hooks',
    }
  }

  let parsed: unknown
  try {
    parsed = jsonParse(content)
  } catch (e) {
    return {
      success: false,
      errors: [
        {
          path: 'json',
          message:
            `无效的 JSON 语法：${errorMessage(e)}。` +
            `运行时这将破坏整个插件加载。`,
        },
      ],
      warnings: [],
      filePath,
      fileType: 'hooks',
    }
  }

  const result = PluginHooksSchema().safeParse(parsed)
  if (!result.success) {
    return {
      success: false,
      errors: formatZodErrors(result.error),
      warnings: [],
      filePath,
      fileType: 'hooks',
    }
  }

  return {
    success: true,
    errors: [],
    warnings: [],
    filePath,
    fileType: 'hooks',
  }
}

/**
 * 递归收集目录下的 .md 文件。使用 withFileTypes 避免每个条目一次 stat 调用。
 * 返回绝对路径以便错误消息保持可读。
 */
async function collectMarkdown(
  dir: string,
  isSkillsDir: boolean,
): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT' || code === 'ENOTDIR') return []
    throw e
  }

  // Skills 使用 <name>/SKILL.md —— 仅下降一级，仅收集 SKILL.md。
  // 与运行时加载器匹配：skills/ 中的单个 .md 文件不会被加载，技能目录的子目录也不会被扫描。
  // 路径是推测性的（子目录可能缺少 SKILL.md）；调用方会处理 ENOENT。
  if (isSkillsDir) {
    return entries
      .filter(e => e.isDirectory())
      .map(e => path.join(dir, e.name, 'SKILL.md'))
  }

  // Commands/agents：递归并收集所有 .md 文件。
  const out: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectMarkdown(full, false)))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

/**
 * 验证插件目录内的内容文件——skills、agents、commands 以及 hooks.json。
 * 扫描默认组件目录（清单可以声明自定义路径，但默认布局覆盖绝大多数插件；这是一个检查器而非加载器）。
 *
 * 为每个有错误或警告的文件返回一个 ValidationResult。干净的插件返回空数组。
 */
export async function validatePluginContents(
  pluginDir: string,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []

  const dirs: Array<['skill' | 'agent' | 'command', string]> = [
    ['skill', path.join(pluginDir, 'skills')],
    ['agent', path.join(pluginDir, 'agents')],
    ['command', path.join(pluginDir, 'commands')],
  ]

  for (const [fileType, dir] of dirs) {
    const files = await collectMarkdown(dir, fileType === 'skill')
    for (const filePath of files) {
      let content: string
      try {
        content = await readFile(filePath, { encoding: 'utf-8' })
      } catch (e: unknown) {
        // 对于推测性的技能路径（没有 SKILL.md 的子目录），ENOENT 是预期的
        if (isENOENT(e)) continue
        results.push({
          success: false,
          errors: [
            { path: 'file', message: `读取失败：${errorMessage(e)}` },
          ],
          warnings: [],
          filePath,
          fileType,
        })
        continue
      }
      const r = validateComponentFile(filePath, content, fileType)
      if (r.errors.length > 0 || r.warnings.length > 0) {
        results.push(r)
      }
    }
  }

  const hooksResult = await validateHooksJson(
    path.join(pluginDir, 'hooks', 'hooks.json'),
  )
  if (hooksResult.errors.length > 0 || hooksResult.warnings.length > 0) {
    results.push(hooksResult)
  }

  return results
}

/**
 * 验证清单文件或目录（自动检测类型）
 */
export async function validateManifest(
  filePath: string,
): Promise<ValidationResult> {
  const absolutePath = path.resolve(filePath)

  // 获取路径信息以检查是否为目录——直接处理 ENOENT
  let stats: Stats | null = null
  try {
    stats = await stat(absolutePath)
  } catch (e: unknown) {
    if (!isENOENT(e)) {
      throw e
    }
  }

  if (stats?.isDirectory()) {
    // 在 .claude-plugin 目录中查找清单文件
    // 优先 marketplace.json 而非 plugin.json
    const marketplacePath = path.join(
      absolutePath,
      '.claude-plugin',
      'marketplace.json',
    )
    const marketplaceResult = await validateMarketplaceManifest(marketplacePath)
    // 仅当市场文件未找到（ENOENT）时才回退
    if (marketplaceResult.errors[0]?.code !== 'ENOENT') {
      return marketplaceResult
    }

    const pluginPath = path.join(absolutePath, '.claude-plugin', 'plugin.json')
    const pluginResult = await validatePluginManifest(pluginPath)
    if (pluginResult.errors[0]?.code !== 'ENOENT') {
      return pluginResult
    }

    return {
      success: false,
      errors: [
        {
          path: 'directory',
          message: `目录中未找到清单文件。期望 .claude-plugin/marketplace.json 或 .claude-plugin/plugin.json`,
        },
      ],
      warnings: [],
      filePath: absolutePath,
      fileType: 'plugin',
    }
  }

  const manifestType = detectManifestType(filePath)

  switch (manifestType) {
    case 'plugin':
      return validatePluginManifest(filePath)
    case 'marketplace':
      return validateMarketplaceManifest(filePath)
    case 'unknown': {
      // 尝试解析并根据内容猜测
      try {
        const content = await readFile(absolutePath, { encoding: 'utf-8' })
        const parsed = jsonParse(content) as Record<string, unknown>

        // 启发式：如果有 "plugins" 数组，很可能是市场清单
        if (Array.isArray(parsed.plugins)) {
          return validateMarketplaceManifest(filePath)
        }
      } catch (e: unknown) {
        const code = getErrnoCode(e)
        if (code === 'ENOENT') {
          return {
            success: false,
            errors: [
              {
                path: 'file',
                message: `文件未找到：${absolutePath}`,
              },
            ],
            warnings: [],
            filePath: absolutePath,
            fileType: 'plugin', // 默认作为插件清单报告错误
          }
        }
        // 对于其他错误（如 JSON 解析）回退到默认验证
      }

      // 默认：作为插件清单验证
      return validatePluginManifest(filePath)
    }
  }
}