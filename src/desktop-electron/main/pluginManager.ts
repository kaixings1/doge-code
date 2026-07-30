/**
 * pluginManager.ts — 桌面端插件管理
 *
 * 精简版插件系统，不依赖 CLI 的市场/推送/缓存基础设施。
 * 核心功能：
 * - 扫描本地插件目录
 * - 读取 plugin.json 清单
 * - 启用/禁用插件
 * - 从目录安装插件
 * - 卸载插件
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── 类型 ───

export interface PluginManifest {
  name: string
  description?: string
  version?: string
  author?: string
  commands?: string[]
  agents?: string[]
  hooks?: string[]
  mcpServers?: string[]
}

export interface PluginInfo {
  name: string
  path: string
  manifest: PluginManifest
  enabled: boolean
  commands: PluginCommand[]
  agents: PluginAgent[]
}

export interface PluginCommand {
  name: string
  description?: string
  path: string
}

export interface PluginAgent {
  name: string
  description?: string
  path: string
}

// ─── 路径 ───

/**
 * 获取插件搜索目录列表
 */
function getPluginDirs(projectRoot: string): string[] {
  const dirs = [
    path.join(projectRoot, '.doge', 'plugins'),
    path.join(projectRoot, 'plugins'),
    path.join(projectRoot, '.claude', 'plugins'),
  ]
  return dirs.filter(d => fs.existsSync(d))
}

/**
 * 获取插件设置文件路径
 */
function getPluginSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, '.doge', 'settings.json')
}

// ─── 设置读写 ───

interface PluginSettings {
  enabledPlugins?: Record<string, boolean>
}

function loadPluginSettings(projectRoot: string): PluginSettings {
  try {
    const filePath = getPluginSettingsPath(projectRoot)
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function savePluginSettings(projectRoot: string, settings: PluginSettings): void {
  try {
    const filePath = getPluginSettingsPath(projectRoot)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

// ─── 清单读取 ───

function loadPluginManifest(pluginDir: string): PluginManifest | null {
  // 尝试 plugin.json
  const manifestPath = path.join(pluginDir, 'plugin.json')
  if (fs.existsSync(manifestPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      return {
        name: raw.name || path.basename(pluginDir),
        description: raw.description || '',
        version: raw.version || '0.0.0',
        author: raw.author || '',
        commands: raw.commands || [],
        agents: raw.agents || [],
        hooks: raw.hooks || [],
        mcpServers: raw.mcpServers || [],
      }
    } catch { /* ignore */ }
  }

  // 没有 plugin.json 时，从目录名推断
  return {
    name: path.basename(pluginDir),
    description: '',
    version: '0.0.0',
    author: '',
  }
}

// ─── 子资源扫描 ───

function scanPluginCommands(pluginDir: string): PluginCommand[] {
  const commandsDir = path.join(pluginDir, 'commands')
  if (!fs.existsSync(commandsDir)) return []

  const commands: PluginCommand[] = []
  try {
    const entries = fs.readdirSync(commandsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = path.join(commandsDir, entry.name)
        let description = ''
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          // 取第一非空行作为描述
          const firstLine = content.split('\n').find(l => l.trim().startsWith('#'))
          if (firstLine) description = firstLine.replace(/^#+\s*/, '').trim()
        } catch { /* ignore */ }
        commands.push({
          name: entry.name.replace('.md', ''),
          description,
          path: filePath,
        })
      }
    }
  } catch { /* ignore */ }
  return commands
}

function scanPluginAgents(pluginDir: string): PluginAgent[] {
  const agentsDir = path.join(pluginDir, 'agents')
  if (!fs.existsSync(agentsDir)) return []

  const agents: PluginAgent[] = []
  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const filePath = path.join(agentsDir, entry.name)
        let description = ''
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          const firstLine = content.split('\n').find(l => l.trim().startsWith('#'))
          if (firstLine) description = firstLine.replace(/^#+\s*/, '').trim()
        } catch { /* ignore */ }
        agents.push({
          name: entry.name.replace('.md', ''),
          description,
          path: filePath,
        })
      }
    }
  } catch { /* ignore */ }
  return agents
}

// ─── 公共 API ───

/**
 * 扫描所有已安装的插件
 */
export function scanPlugins(projectRoot: string): PluginInfo[] {
  const settings = loadPluginSettings(projectRoot)
  const enabledMap = settings.enabledPlugins || {}
  const plugins: PluginInfo[] = []
  const pluginDirs = getPluginDirs(projectRoot)

  for (const dir of pluginDirs) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const pluginDir = path.join(dir, entry.name)
        const manifest = loadPluginManifest(pluginDir)
        if (!manifest) continue

        const name = manifest.name
        const isEnabled = enabledMap[name] !== false // 默认启用

        plugins.push({
          name,
          path: pluginDir,
          manifest,
          enabled: isEnabled,
          commands: scanPluginCommands(pluginDir),
          agents: scanPluginAgents(pluginDir),
        })
      }
    } catch { /* ignore */ }
  }

  return plugins
}

/**
 * 启用/禁用插件
 */
export function setPluginEnabled(projectRoot: string, pluginName: string, enabled: boolean): void {
  const settings = loadPluginSettings(projectRoot)
  if (!settings.enabledPlugins) settings.enabledPlugins = {}
  settings.enabledPlugins[pluginName] = enabled
  savePluginSettings(projectRoot, settings)
}

/**
 * 安装插件（从源目录复制到目标插件目录）
 */
export function installPlugin(projectRoot: string, sourceDir: string, pluginName: string): { success: boolean; error?: string } {
  try {
    const destDir = path.join(projectRoot, '.doge', 'plugins', pluginName)
    if (fs.existsSync(destDir)) {
      return { success: false, error: `插件 "${pluginName}" 已存在` }
    }

    // 递归复制目录
    copyDirRecursive(sourceDir, destDir)
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '安装失败' }
  }
}

/**
 * 卸载插件（删除插件目录）
 */
export function uninstallPlugin(projectRoot: string, pluginName: string): { success: boolean; error?: string } {
  try {
    // 在所有插件目录中查找
    const pluginDirs = getPluginDirs(projectRoot)
    for (const dir of pluginDirs) {
      const pluginDir = path.join(dir, pluginName)
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true, force: true })
        // 从设置中移除
        const settings = loadPluginSettings(projectRoot)
        if (settings.enabledPlugins?.[pluginName]) {
          delete settings.enabledPlugins[pluginName]
          savePluginSettings(projectRoot, settings)
        }
        return { success: true }
      }
    }
    return { success: false, error: `插件 "${pluginName}" 不存在` }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '卸载失败' }
  }
}

/**
 * 读取插件命令内容
 */
export function getPluginCommandContent(projectRoot: string, pluginName: string, commandName: string): string | null {
  try {
    const pluginDirs = getPluginDirs(projectRoot)
    for (const dir of pluginDirs) {
      const cmdPath = path.join(dir, pluginName, 'commands', `${commandName}.md`)
      if (fs.existsSync(cmdPath)) {
        return fs.readFileSync(cmdPath, 'utf-8')
      }
    }
  } catch { /* ignore */ }
  return null
}

// ─── 工具函数 ───

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
