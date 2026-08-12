import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'

// ============================================================================
// Types
// ============================================================================

interface PluginEntry {
  id: string
  name: string
  description: string
  author: string
  version: string
  tags: string[]
  downloads: number
  rating: number
  repository?: string
  installed: boolean
}

interface PluginMarketIndex {
  plugins: PluginEntry[]
  lastUpdated: number
  source: 'remote' | 'local' | 'bundled'
}

// ============================================================================
// Plugin Registry (simulated remote index)
// ============================================================================

const KNOWN_PLUGINS: PluginEntry[] = [
  {
    id: 'typescript-helper',
    name: 'TypeScript Helper',
    description: '增强 TypeScript 开发体验：类型检查、重构辅助、文档生成',
    author: 'doge-community',
    version: '1.2.0',
    tags: ['typescript', 'refactoring', 'documentation'],
    downloads: 15420,
    rating: 4.7,
    repository: 'https://github.com/doge-community/typescript-helper',
    installed: false,
  },
  {
    id: 'docker-workflow',
    name: 'Docker Workflow',
    description: 'Docker 开发工作流增强：容器管理、镜像优化、多阶段构建模板',
    author: 'doge-community',
    version: '0.9.1',
    tags: ['docker', 'devops', 'container'],
    downloads: 8930,
    rating: 4.5,
    repository: 'https://github.com/doge-community/docker-workflow',
    installed: false,
  },
  {
    id: 'git-flow-enhanced',
    name: 'Git Flow Enhanced',
    description: '增强 Git 工作流：分支策略自动化、PR 模板、变更日志生成',
    author: 'doge-community',
    version: '2.0.3',
    tags: ['git', 'workflow', 'ci-cd'],
    downloads: 22100,
    rating: 4.8,
    repository: 'https://github.com/doge-community/git-flow-enhanced',
    installed: false,
  },
  {
    id: 'api-tester',
    name: 'API Tester Pro',
    description: '高级 API 测试：自动化测试套件、性能基准、契约验证',
    author: 'doge-community',
    version: '1.5.0',
    tags: ['api', 'testing', 'http'],
    downloads: 6780,
    rating: 4.3,
    installed: false,
  },
  {
    id: 'code-formatter',
    name: 'Universal Code Formatter',
    description: '统一代码格式化：支持 30+ 语言、团队规范配置、CI 集成',
    author: 'doge-community',
    version: '3.1.2',
    tags: ['formatting', 'linting', 'style'],
    downloads: 31200,
    rating: 4.9,
    installed: false,
  },
]

// ============================================================================
// Installed Plugins Cache
// ============================================================================

const INSTALLED_PLUGINS_FILE = path.join(homedir(), '.doge', 'plugins', 'installed.json')

function loadInstalledPlugins(): Set<string> {
  try {
    if (fs.existsSync(INSTALLED_PLUGINS_FILE)) {
      const raw = fs.readFileSync(INSTALLED_PLUGINS_FILE, 'utf-8')
      const data = JSON.parse(raw)
      return new Set(data.installed || [])
    }
  } catch {
    // ignore
  }
  return new Set()
}

function saveInstalledPlugins(installed: Set<string>): void {
  try {
    const dir = path.dirname(INSTALLED_PLUGINS_FILE)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      INSTALLED_PLUGINS_FILE,
      JSON.stringify({ installed: Array.from(installed), lastUpdated: Date.now() }, null, 2),
      'utf-8',
    )
  } catch {
    // ignore
  }
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (!s || s.includes('--help')) {
    return {
      type: 'text',
      value: [
        '🔌 插件市场 / 技能发现',
        '',
        '用法:',
        '  /plugin-market list [--tags tag1,tag2]   浏览可用插件',
        '  /plugin-market search <关键词>            搜索插件',
        '  /plugin-market info <插件ID>              查看插件详情',
        '  /plugin-market install <插件ID>           安装插件',
        '  /plugin-market uninstall <插件ID>         卸载插件',
        '  /plugin-market installed                  查看已安装插件',
        '  /plugin-market rate <插件ID> <1-5>        ⭐ 评分插件',
        '',
        '示例:',
        '  /plugin-market list --tags typescript,docker',
        '  /plugin-market search api testing',
        '  /plugin-market install typescript-helper',
        '  /plugin-market rate code-formatter 5',
        '',
        '提示: 插件安装到 ~/.doge/plugins/ 目录',
      ].join('\n'),
    }
  }

  const parts = s.split(/\s+/)
  const action = parts[0] || 'list'
  const target = parts[1]

  const installed = loadInstalledPlugins()

  switch (action) {
    case 'list':
      return handleList(target, installed)
    case 'search':
      return handleSearch(parts.slice(1).join(' '), installed)
    case 'info':
      return handleInfo(target, installed)
    case 'install':
      return handleInstall(target, installed)
    case 'uninstall':
      return handleUninstall(target, installed)
    case 'installed':
      return handleInstalled(installed)
    case 'rate':
      return handleRate(parts[1], parts[2], installed)
    default:
      return {
        type: 'text',
        value: `❌ 未知操作: ${action}\n\n使用 /plugin-market --help 查看可用命令`,
      }
  }
}

// ============================================================================
// Handlers
// ============================================================================

function handleList(tagsArg: string | undefined, installed: Set<string>): { type: string; value: string } {
  let plugins = [...KNOWN_PLUGINS]

  // 标记安装状态
  plugins = plugins.map(p => ({ ...p, installed: installed.has(p.id) }))

  // 标签过滤
  if (tagsArg) {
    const filterTags = tagsArg.split(',').map(t => t.trim().toLowerCase())
    plugins = plugins.filter(p => filterTags.some(tag => p.tags.some(t => t.toLowerCase().includes(tag))))
  }

  // 按下载量排序
  plugins.sort((a, b) => b.downloads - a.downloads)

  const lines: string[] = [
    '🔌 可用插件市场',
    `共 ${plugins.length} 个插件`,
    '',
    ...plugins.map(p => {
      const status = p.installed ? '✅' : '  '
      return `${status} ${p.name} v${p.version}\n      ${p.description}\n      ⬇ ${formatNumber(p.downloads)} | ⭐ ${p.rating} | 🏷 ${p.tags.slice(0, 3).join(', ')}`
    }),
    '',
    '使用 /plugin-market info <ID> 查看详情',
    '使用 /plugin-market install <ID> 安装',
  ]

  return { type: 'text', value: lines.join('\n') }
}

function handleSearch(keyword: string, installed: Set<string>): { type: string; value: string } {
  if (!keyword) {
    return {
      type: 'text',
      value: '⭐ 请提供搜索关键词\n\n用法: /plugin-market search <关键词>',
    }
  }

  const lowerKeyword = keyword.toLowerCase()
  let results = KNOWN_PLUGINS.filter(p =>
    p.name.toLowerCase().includes(lowerKeyword) ||
    p.description.toLowerCase().includes(lowerKeyword) ||
    p.tags.some(t => t.toLowerCase().includes(lowerKeyword)),
  )

  results = results.map(p => ({ ...p, installed: installed.has(p.id) }))
  results.sort((a, b) => b.rating - a.rating)

  const lines: string[] = [
    `🔍 搜索结果: "${keyword}"`,
    `找到 ${results.length} 个插件`,
    '',
    ...results.map(p => {
      const status = p.installed ? '✅' : '  '
      return `${status} ${p.name} v${p.version}\n      ${p.description}\n      ⭐ ${p.rating} | 🏷 ${p.tags.slice(0, 3).join(', ')}`
    }),
  ]

  return { type: 'text', value: lines.join('\n') }
}

function handleInfo(pluginId: string | undefined, installed: Set<string>): { type: string; value: string } {
  if (!pluginId) {
    return {
      type: 'text',
      value: '❌ 请提供插件 ID\n\n用法: /plugin-market info <插件ID>',
    }
  }

  const plugin = KNOWN_PLUGINS.find(p => p.id === pluginId || p.name.toLowerCase() === pluginId.toLowerCase())

  if (!plugin) {
    return {
      type: 'text',
      value: `❌ 未找到插件: ${pluginId}\n\n使用 /plugin-market list 查看所有可用插件`,
    }
  }

  const isInstalled = installed.has(plugin.id)

  const lines: string[] = [
    `📦 ${plugin.name} v${plugin.version}`,
    '',
    `作者: ${plugin.author}`,
    `下载量: ${formatNumber(plugin.downloads)}`,
    `评分: ⭐ ${plugin.rating}/5`,
    `状态: ${isInstalled ? '✅ 已安装' : '⬜ 未安装'}`,
    '',
    '📝 描述:',
    plugin.description,
    '',
    '🏷 标签:',
    plugin.tags.map(t => `  - ${t}`).join('\n'),
  ]

  if (plugin.repository) {
    lines.push('', `🔗 仓库: ${plugin.repository}`)
  }

  lines.push('', '💡 安装命令: /plugin-market install ' + plugin.id)

  return { type: 'text', value: lines.join('\n') }
}

function handleInstall(pluginId: string | undefined, installed: Set<string>): { type: string; value: string } {
  if (!pluginId) {
    return {
      type: 'text',
      value: '❌ 请提供插件 ID\n\n用法: /plugin-market install <插件ID>',
    }
  }

  const plugin = KNOWN_PLUGINS.find(p => p.id === pluginId || p.name.toLowerCase() === pluginId.toLowerCase())

  if (!plugin) {
    return {
      type: 'text',
      value: `❌ 未找到插件: ${pluginId}\n\n使用 /plugin-market list 查看所有可用插件`,
    }
  }

  if (installed.has(plugin.id)) {
    return {
      type: 'text',
      value: `⚠️ 插件已安装: ${plugin.name} v${plugin.version}\n\n使用 /plugin-market uninstall ${plugin.id} 卸载`,
    }
  }

  // 模拟安装
  installed.add(plugin.id)
  saveInstalledPlugins(installed)

  // 创建插件目录
  const pluginDir = path.join(homedir(), '.doge', 'plugins', plugin.id)
  try {
    fs.mkdirSync(pluginDir, { recursive: true })
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(
        {
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          description: plugin.description,
          author: plugin.author,
          installedAt: Date.now(),
        },
        null,
        2,
      ),
      'utf-8',
    )
  } catch {
    // ignore
  }

  return {
    type: 'text',
    value: [
      `✅ 插件安装成功: ${plugin.name} v${plugin.version}`,
      '',
      '📁 安装路径:',
      `  ${pluginDir}`,
      '',
      '💡 使用提示:',
      `  /plugin-market info ${plugin.id}    查看详情`,
      `  /plugin-market uninstall ${plugin.id}  卸载`,
    ].join('\n'),
  }
}

function handleUninstall(pluginId: string | undefined, installed: Set<string>): { type: string; value: string } {
  if (!pluginId) {
    return {
      type: 'text',
      value: '❌ 请提供插件 ID\n\n用法: /plugin-market uninstall <插件ID>',
    }
  }

  if (!installed.has(pluginId)) {
    return {
      type: 'text',
      value: `⚠️ 插件未安装: ${pluginId}\n\n使用 /plugin-market installed 查看已安装插件`,
    }
  }

  // 移除插件
  installed.delete(pluginId)
  saveInstalledPlugins(installed)

  // 删除插件目录
  const pluginDir = path.join(homedir(), '.doge', 'plugins', pluginId)
  try {
    fs.rmSync(pluginDir, { recursive: true, force: true })
  } catch {
    // ignore
  }

  return {
    type: 'text',
    value: `✅ 插件已卸载: ${pluginId}`,
  }
}

function handleInstalled(installed: Set<string>): { type: string; value: string } {
  const installedPlugins = KNOWN_PLUGINS.filter(p => installed.has(p.id))

  if (installedPlugins.length === 0) {
    return {
      type: 'text',
      value: '📭 暂无已安装的插件\n\n使用 /plugin-market list 浏览可用插件',
    }
  }

  const lines: string[] = [
    '✅ 已安装插件',
    `共 ${installedPlugins.length} 个`,
    '',
    ...installedPlugins.map(p =>
      `  • ${p.name} v${p.version}\n    ${p.description}\n    🏷 ${p.tags.slice(0, 3).join(', ')}`,
    ),
    '',
    '使用 /plugin-market uninstall <ID> 卸载',
  ]

  return { type: 'text', value: lines.join('\n') }
}

function handleRate(pluginId: string | undefined, ratingStr: string | undefined, _installed: Set<string>): { type: string; value: string } {
  if (!pluginId || !ratingStr) {
    return {
      type: 'text',
      value: '❌ 请提供插件 ID 和评分\n\n用法: /plugin-market rate <插件ID> <1-5>',
    }
  }

  const rating = parseInt(ratingStr)
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return {
      type: 'text',
      value: '❌ 评分必须是 1-5 的整数\n\n用法: /plugin-market rate <插件ID> <1-5>',
    }
  }

  const plugin = KNOWN_PLUGINS.find(p => p.id === pluginId || p.name.toLowerCase() === pluginId.toLowerCase())
  if (!plugin) {
    return {
      type: 'text',
      value: `❌ 未找到插件: ${pluginId}`,
    }
  }

  return {
    type: 'text',
    value: `⭐ 已评分: ${plugin.name}\n\n评分: ${rating}/5\n感谢你的反馈！`,
  }
}

// ============================================================================
// Command Definition
// ============================================================================

const pluginMarket = {
  type: 'local' as const,
  name: 'plugin-market',
  description: '插件市场 / 技能发现 - 浏览、安装、评分社区插件包',
  aliases: ['/plugin-market', '/pm', '/plugins'],
  arguments: [
    {
      name: 'action',
      description: '操作: list / search / info / install / uninstall / installed / rate',
      required: true,
    },
    {
      name: 'target',
      description: '目标插件 ID 或搜索关键词',
      required: false,
    },
    {
      name: '--tags',
      description: '按标签过滤（逗号分隔）',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default pluginMarket

// ============================================================================
// Utility
// ============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}
