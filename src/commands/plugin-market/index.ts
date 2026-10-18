import type { Command } from '../../commands.js'
import type {
  LocalCommandCall,
  LocalCommandResult,
} from '../../types/command.js'
import * as fs from 'fs'
import path from 'node:path'
import { homedir } from 'node:os'

// ============================================================================
// 说明
//
// 本命令是「社区插件市场」的轻量浏览/引导入口。真实的市场安装后端由
// src/utils/plugins/marketplaceManager.ts + src/commands/plugin/ 提供
// （支持 github/url/local 源：克隆、缓存、安装、卸载）。
//
// 历史问题：此处曾硬编码一份 KNOWN_PLUGINS 虚构清单（指向并不存在的
// github.com/doge-community/* 仓库），且 install 只本地写一个 plugin.json，
// 与真实链路脱节、还与 /plugin 别名冲突（/plugins）。
//
// 现修正：
//  - 保留 list/search/info/installed 这类**只读浏览**能力（无害的展示界面）。
//  - 明确标注清单为「内置示例」，非真实仓库，避免误导。
//  - install/uninstall/rate 这类会假装操作不存在仓库的动作，
//    统一引导到真实 /plugin 系统，不再伪造安装。
//  - 别名去掉与 /plugin 冲突的 /plugins，保留 /plugin-market、/pm。
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
}

// 内置示例清单（明确标注为示例，非真实可安装仓库）。
// 真实插件请通过 /plugin add-marketplace <git 源> 添加后由 /plugin 安装。
const SAMPLE_PLUGINS: PluginEntry[] = [
  {
    id: 'typescript-helper',
    name: 'TypeScript 助手',
    description: '增强 TypeScript 开发体验：类型检查、重构辅助、文档生成',
    author: 'doge-community',
    version: '1.2.0',
    tags: ['typescript', 'refactoring', 'documentation'],
    downloads: 15420,
    rating: 4.7,
    repository: 'https://github.com/doge-community/typescript-helper',
  },
  {
    id: 'docker-workflow',
    name: 'Docker 工作流',
    description: 'Docker 开发工作流增强：容器管理、镜像优化、多阶段构建模板',
    author: 'doge-community',
    version: '0.9.1',
    tags: ['docker', 'devops', 'container'],
    downloads: 8930,
    rating: 4.5,
    repository: 'https://github.com/doge-community/docker-workflow',
  },
  {
    id: 'git-flow-enhanced',
    name: 'Git 流程增强',
    description: '增强 Git 工作流：分支策略自动化、PR 模板、变更日志生成',
    author: 'doge-community',
    version: '2.0.3',
    tags: ['git', 'workflow', 'ci-cd'],
    downloads: 22100,
    rating: 4.8,
    repository: 'https://github.com/doge-community/git-flow-enhanced',
  },
  {
    id: 'api-tester',
    name: 'API 测试专业版',
    description: '高级 API 测试：自动化测试套件、性能基准、契约验证',
    author: 'doge-community',
    version: '1.5.0',
    tags: ['api', 'testing', 'http'],
    downloads: 6780,
    rating: 4.3,
  },
  {
    id: 'code-formatter',
    name: '通用代码格式化器',
    description: '统一代码格式化：支持 30+ 语言、团队规范配置、CI 集成',
    author: 'doge-community',
    version: '3.1.2',
    tags: ['formatting', 'linting', 'style'],
    downloads: 31200,
    rating: 4.9,
  },
]

// 已安装插件缓存（仅本地标记，用于浏览界面显示安装状态）
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

// 统一文本结果构造（保持 type 字面量 'text'，满足 LocalCommandResult）
function textResult(value: string): LocalCommandResult {
  return { type: 'text', value }
}

// ============================================================================
// 命令处理
// ============================================================================

export const call: LocalCommandCall = async (args, _context): Promise<LocalCommandResult> => {
  const s = (args ?? '').trim()

  if (!s || s.includes('--help')) {
    return textResult([
      '📦 插件市场（社区源浏览 / 引导）',
      '',
      '⚠️ 下方清单为「内置示例」，非真实可安装仓库。',
      '   真实插件来自已添加的市场源，请使用 /plugin 系统：',
      '  /plugin                          浏览/安装/卸载真实插件',
      '  /plugin add-marketplace <源>      添加源（github/url/local）',
      '',
      '📖 本命令兼容语法（只读浏览，安装请走 /plugin）：',
      '  /plugin-market list [--tags t1,t2]   浏览示例清单',
      '  /plugin-market search <关键词>      搜索示例',
      '  /plugin-market info <ID>            查看示例详情',
      '  /plugin-market installed            查看本地已安装标记',
      '  /plugin-market install <ID>         引导到 /plugin（不再伪造安装）',
      '',
      '💡 插件安装到 ~/.doge/plugins/ 目录',
    ].join('\n'))
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
    case 'installed':
      return handleInstalled(installed)
    case 'install':
    case 'uninstall':
    case 'rate':
      // 这些动作会假装操作不存在的仓库，统一引导到真实 /plugin 系统。
      return textResult([
        `ℹ️ "${action}" 已交由真实的 /plugin 系统处理（示例清单中的仓库并不存在）。`,
        '',
        '请改用：',
        '  /plugin add-marketplace <git 源>   添加真实市场源',
        '  /plugin                              浏览并安装真实插件',
      ].join('\n'))
    default:
      return textResult(`❌ 未知操作: ${action}\n\n使用 /plugin-market --help 查看可用命令`)
  }
}

// ============================================================================
// 只读浏览处理函数（保留原展示能力，仅标注为示例）
// ============================================================================

function handleList(tagsArg: string | undefined, installed: Set<string>): LocalCommandResult {
  let plugins = [...SAMPLE_PLUGINS].map(p => ({ ...p, installed: installed.has(p.id) }))

  if (tagsArg) {
    const filterTags = tagsArg.split(',').map(t => t.trim().toLowerCase())
    plugins = plugins.filter(p => filterTags.some(tag => p.tags.some(t => t.toLowerCase().includes(tag))))
  }

  plugins.sort((a, b) => b.downloads - a.downloads)

  const lines: string[] = [
    '🔌 内置示例插件（非真实仓库，仅供浏览）',
    `共 ${plugins.length} 个示例`,
    '',
    ...plugins.map(p => {
      const status = p.installed ? '✅' : '  '
      return `${status} ${p.name} v${p.version}\n      ${p.description}\n      ⬇ ${formatNumber(p.downloads)} | ⭐ ${p.rating} | 🏷 ${p.tags.slice(0, 3).join(', ')}`
    }),
    '',
    '⚠️ 以上为示例数据。安装真实插件请用 /plugin add-marketplace <git 源>',
  ]

  return textResult(lines.join('\n'))
}

function handleSearch(keyword: string, installed: Set<string>): LocalCommandResult {
  if (!keyword) {
    return textResult('📖 用法: /plugin-market search <关键词>')
  }

  const lowerKeyword = keyword.toLowerCase()
  const results = SAMPLE_PLUGINS
    .filter(p =>
      p.name.toLowerCase().includes(lowerKeyword) ||
      p.description.toLowerCase().includes(lowerKeyword) ||
      p.tags.some(t => t.toLowerCase().includes(lowerKeyword)),
    )
    .map(p => ({ ...p, installed: installed.has(p.id) }))
    .sort((a, b) => b.rating - a.rating)

  const lines: string[] = [
    `🔍 示例搜索结果: "${keyword}"`,
    `找到 ${results.length} 个示例`,
    '',
    ...results.map(p => {
      const status = p.installed ? '✅' : '  '
      return `${status} ${p.name} v${p.version}\n      ${p.description}\n      ⭐ ${p.rating} | 🏷 ${p.tags.slice(0, 3).join(', ')}`
    }),
    '',
    '⚠️ 示例数据，真实插件请用 /plugin',
  ]

  return textResult(lines.join('\n'))
}

function handleInfo(pluginId: string | undefined, installed: Set<string>): LocalCommandResult {
  if (!pluginId) {
    return textResult('❌ 请提供插件 ID\n\n用法: /plugin-market info <插件ID>')
  }

  const plugin = SAMPLE_PLUGINS.find(p => p.id === pluginId || p.name.toLowerCase() === pluginId.toLowerCase())
  if (!plugin) {
    return textResult(`❌ 未找到示例插件: ${pluginId}\n\n请使用 /plugin-market list 查看`)
  }

  const isInstalled = installed.has(plugin.id)
  const lines: string[] = [
    `📦 ${plugin.name} v${plugin.version}（示例）`,
    '',
    `作者: ${plugin.author}`,
    `下载量: ${formatNumber(plugin.downloads)}`,
    `评分: ⭐ ${plugin.rating}/5`,
    `状态: ${isInstalled ? '✅ 已安装(本地标记)' : '⬜ 未安装'}`,
    '',
    '📝 描述:',
    plugin.description,
    '',
    '🏷 标签:',
    plugin.tags.map(t => `  - ${t}`).join('\n'),
    '',
    '⚠️ 此为示例数据，仓库可能不存在。安装真实插件请用 /plugin add-marketplace <git 源>',
  ]

  if (plugin.repository) {
    lines.push('', `🔗 标注仓库: ${plugin.repository}`)
  }

  return textResult(lines.join('\n'))
}

function handleInstalled(installed: Set<string>): LocalCommandResult {
  const installedPlugins = SAMPLE_PLUGINS.filter(p => installed.has(p.id))
  if (installedPlugins.length === 0) {
    return textResult('📭 暂无本地安装标记\n\n（示例清单中的插件并未真实安装。真实插件请见 /plugin）')
  }
  const lines: string[] = [
    '✅ 本地安装标记（示例）',
    `共 ${installedPlugins.length} 个`,
    '',
    ...installedPlugins.map(p =>
      `  • ${p.name} v${p.version}\n    ${p.description}\n    🏷 ${p.tags.slice(0, 3).join(', ')}`,
    ),
  ]
  return textResult(lines.join('\n'))
}

// ============================================================================
// 命令定义
// ============================================================================

const pluginMarket = {
  type: 'local' as const,
  name: 'plugin-market',
  description: '插件市场浏览/引导 — 示例清单 + 指向真实 /plugin 社区市场（github/url/local 源）',
  aliases: ['/plugin-market', '/pm'],
  arguments: [
    { name: 'action', description: 'list / search / info / installed / install(引导)', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default pluginMarket

// ============================================================================
// 工具函数
// ============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}
