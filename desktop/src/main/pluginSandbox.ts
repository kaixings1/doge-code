/**
 * pluginSandbox.ts — 插件安全与沙箱隔离
 *
 * 提供多层安全防护：
 * 1. Manifest 验证 — JSON Schema 校验 + 字段白名单
 * 2. 内容净化 — 防止 XSS/注入/路径遍历
 * 3. 路径安全 — 规范化路径检查，阻止目录逃逸
 * 4. 资源限制 — 文件大小、数量、嵌套深度限制
 * 5. 来源验证 — 安装来源白名单/黑名单
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── 类型 ───

export interface SandboxConfig {
  maxManifestSize: number        // manifest.json 最大字节
  maxCommandFileSize: number     // 单个命令文件最大字节
  maxAgentFileSize: number       // 单个 agent 文件最大字节
  maxCommandsPerPlugin: number   // 最大命令数
  maxAgentsPerPlugin: number     // 最大 agent 数
  maxNestingDepth: number        // 目录最大嵌套深度
  allowedExtensions: string[]    // 允许的文件扩展名
  blockedPatterns: RegExp[]      // 阻止的内容模式
  trustedSources: string[]       // 信任的安装来源（可选）
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface SanitizationResult {
  content: string
  modified: boolean
  issues: string[]
}

// ─── 默认配置 ───

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  maxManifestSize: 64 * 1024,           // 64KB
  maxCommandFileSize: 256 * 1024,       // 256KB
  maxAgentFileSize: 256 * 1024,         // 256KB
  maxCommandsPerPlugin: 50,
  maxAgentsPerPlugin: 20,
  maxNestingDepth: 3,
  allowedExtensions: ['.md', '.json', '.txt'],
  blockedPatterns: [
    /<script[\s>]/i,                    // <script> 标签
    /javascript:/i,                     // javascript: URI
    /on\w+\s*=/i,                       // 事件处理器属性
    /\.\.\//,                           // 路径遍历尝试
    /<%.*%>/,                           // 服务端脚本标签
    /\{\{.*\}\}/,                       // 模板注入
    /\$\{.*\}/,                         // 模板字面量注入
    /import\s+.*from/i,                 // ES module import（md 中不应出现）
    /require\s*\(/i,                    // CommonJS require
  ],
  trustedSources: [],
}

// ─── Manifest 验证 ───

const MANIFEST_REQUIRED_FIELDS = ['name']
const MANIFEST_STRING_FIELDS = ['name', 'description', 'version', 'author']
const MANIFEST_ARRAY_FIELDS = ['commands', 'agents', 'hooks', 'mcpServers']

/**
 * 验证 plugin.json 清单
 */
export function validateManifest(raw: unknown, config: SandboxConfig = DEFAULT_SANDBOX_CONFIG): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (raw === null || typeof raw !== 'object') {
    return { valid: false, errors: ['manifest 必须是 JSON 对象'], warnings: [] }
  }

  const manifest = raw as Record<string, unknown>

  // 必填字段检查
  for (const field of MANIFEST_REQUIRED_FIELDS) {
    if (!manifest[field] || typeof manifest[field] !== 'string') {
      errors.push(`缺少必填字段 "${field}" 或类型错误`)
    }
  }

  // 字段类型检查
  for (const field of MANIFEST_STRING_FIELDS) {
    if (manifest[field] !== undefined && typeof manifest[field] !== 'string') {
      errors.push(`字段 "${field}" 必须是字符串`)
    }
  }

  for (const field of MANIFEST_ARRAY_FIELDS) {
    if (manifest[field] !== undefined) {
      if (!Array.isArray(manifest[field])) {
        errors.push(`字段 "${field}" 必须是数组`)
      } else {
        // 检查数组元素类型
        const arr = manifest[field] as unknown[]
        if (!arr.every(item => typeof item === 'string')) {
          errors.push(`字段 "${field}" 的所有元素必须是字符串`)
        }
      }
    }
  }

  // 名称格式检查
  if (typeof manifest.name === 'string') {
    if (manifest.name.length === 0 || manifest.name.length > 128) {
      errors.push('插件名称长度必须在 1-128 之间')
    }
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(manifest.name)) {
      errors.push('插件名称只能包含字母、数字、下划线、连字符和点')
    }
    if (manifest.name.includes('..')) {
      errors.push('插件名称不能包含 ".."')
    }
  }

  // 版本格式检查
  if (typeof manifest.version === 'string') {
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      warnings.push('建议使用语义化版本格式 (x.y.z)')
    }
  }

  // 字段白名单检查（额外字段警告）
  const allowedFields = [...MANIFEST_STRING_FIELDS, ...MANIFEST_ARRAY_FIELDS]
  for (const key of Object.keys(manifest)) {
    if (!allowedFields.includes(key)) {
      warnings.push(`未知字段 "${key}" 将被忽略`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ─── 路径安全检查 ───

/**
 * 验证插件路径是否在允许的目录范围内
 * 防止路径遍历攻击
 */
export function validatePluginPath(
  pluginDir: string,
  allowedBaseDirs: string[]
): { valid: boolean; resolvedPath?: string; error?: string } {
  try {
    const resolved = path.resolve(pluginDir)

    // 检查是否在允许的目录范围内
    const isAllowed = allowedBaseDirs.some(base => {
      const resolvedBase = path.resolve(base)
      return resolved === resolvedBase || resolved.startsWith(resolvedBase + path.sep)
    })

    if (!isAllowed) {
      return { valid: false, error: '插件路径超出允许的范围' }
    }

    // 检查路径中是否有可疑组件
    const parts = resolved.split(path.sep)
    for (const part of parts) {
      if (part === '..') {
        return { valid: false, error: '路径包含非法的 ".." 组件' }
      }
    }

    return { valid: true, resolvedPath: resolved }
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message: '路径解析失败' }
  }
}

// ─── 内容净化 ───

/**
 * 净化插件命令/代理的 markdown 内容
 * 移除潜在的危险内容
 */
export function sanitizeContent(
  content: string,
  config: SandboxConfig = DEFAULT_SANDBOX_CONFIG
): SanitizationResult {
  const issues: string[] = []
  let modified = false
  let sanitized = content

  // 检查并阻止危险模式
  for (const pattern of config.blockedPatterns) {
    if (pattern.test(sanitized)) {
      issues.push(`检测到危险模式: ${pattern.source}`)
      modified = true
      // 替换危险内容为占位符
      sanitized = sanitized.replace(pattern, match => `[已移除:${match.slice(0, 10)}]`)
    }
  }

  // 检查文件大小
  if (Buffer.byteLength(sanitized, 'utf-8') > config.maxCommandFileSize) {
    issues.push('内容超出大小限制，已截断')
    modified = true
    sanitized = sanitized.slice(0, config.maxCommandFileSize)
  }

  return { content: sanitized, modified, issues }
}

// ─── 文件安全扫描 ───

/**
 * 扫描插件目录的安全性
 * 检查文件类型、大小、嵌套深度
 */
export function scanPluginSecurity(
  pluginDir: string,
  config: SandboxConfig = DEFAULT_SANDBOX_CONFIG
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  function scan(currentDir: string, depth: number): void {
    if (depth > config.maxNestingDepth) {
      errors.push(`目录嵌套超过最大深度 (${config.maxNestingDepth})`)
      return
    }

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      errors.push(`无法读取目录: ${currentDir}`)
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        scan(fullPath, depth + 1)
      } else if (entry.isFile()) {
        // 检查扩展名
        const ext = path.extname(entry.name).toLowerCase()
        if (!config.allowedExtensions.includes(ext)) {
          errors.push(`不允许的文件类型: ${entry.name}`)
          continue
        }

        // 检查文件大小
        try {
          const stat = fs.statSync(fullPath)
          if (stat.size > config.maxCommandFileSize) {
            errors.push(`文件过大 (${stat.size} bytes): ${entry.name}`)
          }
        } catch {
          warnings.push(`无法获取文件大小: ${entry.name}`)
        }

        // 检查文件名
        if (entry.name.includes('..') || entry.name.includes('\0')) {
          errors.push(`可疑文件名: ${entry.name}`)
        }
      } else if (entry.isSymbolicLink()) {
        // 拒绝符号链接（可能逃逸沙箱）
        errors.push(`符号链接不被允许: ${entry.name}`)
      }
    }
  }

  scan(pluginDir, 0)

  return { valid: errors.length === 0, errors, warnings }
}

// ─── 安装来源验证 ───

/**
 * 验证插件安装来源是否可信
 */
export function validateSource(
  source: string,
  config: SandboxConfig = DEFAULT_SANDBOX_CONFIG
): { trusted: boolean; warning?: string } {
  // 本地目录安装 — 始终允许（用户主动选择）
  if (source.startsWith('local:') || source.startsWith('/')) {
    return { trusted: true }
  }

  // 如果没有配置信任列表，允许所有但给出警告
  if (config.trustedSources.length === 0) {
    return { trusted: true, warning: '未配置信任来源列表，请确认来源可靠' }
  }

  // 检查是否在信任列表中
  const isTrusted = config.trustedSources.some(trusted => {
    if (trusted === '*') return true
    if (trusted.endsWith('/*')) {
      const prefix = trusted.slice(0, -2)
      return source.startsWith(prefix)
    }
    return source === trusted
  })

  if (!isTrusted) {
    return { trusted: false, warning: `来源 "${source}" 不在信任列表中` }
  }

  return { trusted: true }
}

// ─── 安全读取插件命令 ───

/**
 * 安全读取插件命令内容（带净化）
 */
export function safeReadCommand(
  pluginDir: string,
  commandName: string,
  config: SandboxConfig = DEFAULT_SANDBOX_CONFIG
): { content?: string; error?: string; warnings: string[] } {
  const warnings: string[] = []

  // 验证命令名（防止路径遍历）
  if (commandName.includes('/') || commandName.includes('\\') || commandName.includes('..')) {
    return { error: '命令名包含非法字符', warnings }
  }

  if (!/^[a-zA-Z0-9_\-\.]+$/.test(commandName)) {
    return { error: '命令名只能包含字母、数字、下划线、连字符和点', warnings }
  }

  const filePath = path.join(pluginDir, 'commands', `${commandName}.md`)

  // 路径安全检查
  const resolved = path.resolve(filePath)
  const baseResolved = path.resolve(pluginDir, 'commands')
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) {
    return { error: '路径超出允许的范围', warnings }
  }

  if (!fs.existsSync(filePath)) {
    return { error: '命令文件不存在', warnings }
  }

  try {
    const stat = fs.statSync(filePath)
    if (stat.size > config.maxCommandFileSize) {
      return { error: '命令文件过大', warnings }
    }

    const raw = fs.readFileSync(filePath, 'utf-8')

    // 内容净化
    const sanitized = sanitizeContent(raw, config)
    if (sanitized.issues.length > 0) {
      warnings.push(...sanitized.issues)
    }

    return { content: sanitized.content, warnings }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '读取失败', warnings }
  }
}
