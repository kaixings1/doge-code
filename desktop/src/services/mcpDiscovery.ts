/**
 * MCP Server 发现与推荐服务
 *
 * 功能：
 * - 分析项目类型（TS/Python/Rust/Go 等）
 * - 推荐合适的 MCP servers
 * - 提供自动配置建议
 */

import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'

// ============================================================================
// Types
// ============================================================================

export interface McpServerRecommendation {
  name: string
  description: string
  install: string
  match: number
  category: 'language' | 'tool' | 'search' | 'database' | 'cloud'
  projectTypes: string[]
}

export interface DiscoveryResult {
  projectType: string | undefined
  recommendations: McpServerRecommendation[]
  detectedFiles: string[]
}

// ============================================================================
// MCP Server Registry
// ============================================================================

const SERVER_REGISTRY: McpServerRecommendation[] = [
  // Language Servers
  {
    name: 'TypeScript Language Server',
    description: 'TypeScript/JavaScript 类型检查、自动补全、重构',
    install: 'npx @typescript/language-server --stdio',
    match: 100,
    category: 'language',
    projectTypes: ['typescript', 'javascript'],
  },
  {
    name: 'Pyright',
    description: 'Python 类型检查和语言服务器',
    install: 'npx pyright-langserver --stdio',
    match: 100,
    category: 'language',
    projectTypes: ['python'],
  },
  {
    name: 'rust-analyzer',
    description: 'Rust 语言服务器，完整的 IDE 支持',
    install: 'rustup component add rust-analyzer',
    match: 100,
    category: 'language',
    projectTypes: ['rust'],
  },
  {
    name: 'gopls',
    description: 'Go 语言官方语言服务器',
    install: 'go install golang.org/x/tools/gopls@latest',
    match: 100,
    category: 'language',
    projectTypes: ['go'],
  },
  {
    name: 'Java Language Server',
    description: 'Java 语言服务器（Eclipse JDT）',
    install: 'npx @modelcontextprotocol/server-java',
    match: 90,
    category: 'language',
    projectTypes: ['java'],
  },
  // Tools
  {
    name: 'Filesystem MCP',
    description: '安全的文件系统操作（读/写/搜索）',
    install: 'npx @modelcontextprotocol/server-filesystem /path/to/allowed',
    match: 80,
    category: 'tool',
    projectTypes: ['*'],
  },
  {
    name: 'Git MCP',
    description: 'Git 仓库操作和代码审查',
    install: 'npx @modelcontextprotocol/server-git',
    match: 75,
    category: 'tool',
    projectTypes: ['*'],
  },
  {
    name: 'Puppeteer MCP',
    description: '浏览器自动化（网页测试、截图）',
    install: 'npx @modelcontextprotocol/server-puppeteer',
    match: 65,
    category: 'tool',
    projectTypes: ['*'],
  },
  // Search
  {
    name: 'Brave Search',
    description: '网络搜索能力（需要 Brave API key）',
    install: 'npx @modelcontextprotocol/server-brave-search',
    match: 70,
    category: 'search',
    projectTypes: ['*'],
  },
  {
    name: 'Sequential Thinking',
    description: '增强推理能力，支持多步骤思考',
    install: 'npx @modelcontextprotocol/server-sequential-thinking',
    match: 85,
    category: 'tool',
    projectTypes: ['*'],
  },
  // Database
  {
    name: 'SQLite MCP',
    description: 'SQLite 数据库查询和 Schema 可视化',
    install: 'npx @modelcontextprotocol/server-sqlite',
    match: 70,
    category: 'database',
    projectTypes: ['*'],
  },
  {
    name: 'PostgreSQL MCP',
    description: 'PostgreSQL 数据库连接和查询',
    install: 'npx @modelcontextprotocol/server-postgres',
    match: 70,
    category: 'database',
    projectTypes: ['*'],
  },
]

// ============================================================================
// Project Detection
// ============================================================================

interface ProjectIndicator {
  file: string
  type: string
  priority: number
}

const PROJECT_INDICATORS: ProjectIndicator[] = [
  { file: 'tsconfig.json', type: 'typescript', priority: 100 },
  { file: 'package.json', type: 'typescript', priority: 90 },
  { file: 'tsconfig.app.json', type: 'typescript', priority: 95 },
  { file: 'angular.json', type: 'typescript', priority: 100 },
  { file: 'next.config.js', type: 'typescript', priority: 100 },
  { file: 'pyproject.toml', type: 'python', priority: 100 },
  { file: 'requirements.txt', type: 'python', priority: 100 },
  { file: 'setup.py', type: 'python', priority: 95 },
  { file: 'Pipfile', type: 'python', priority: 95 },
  { file: 'Cargo.toml', type: 'rust', priority: 100 },
  { file: 'go.mod', type: 'go', priority: 100 },
  { file: 'pom.xml', type: 'java', priority: 100 },
  { file: 'build.gradle', type: 'java', priority: 100 },
  { file: 'Gemfile', type: 'ruby', priority: 100 },
  { file: 'composer.json', type: 'php', priority: 100 },
  { file: 'go.sum', type: 'go', priority: 90 },
  { file: 'Cargo.lock', type: 'rust', priority: 90 },
]

/**
 * 检测项目类型
 */
export function detectProjectType(cwd: string = process.cwd()): string | undefined {
  const detected: { type: string; priority: number }[] = []

  for (const indicator of PROJECT_INDICATORS) {
    try {
      const filePath = path.join(cwd, indicator.file)
      if (fs.existsSync(filePath)) {
        detected.push({ type: indicator.type, priority: indicator.priority })
      }
    } catch {
      // ignore
    }
  }

  if (detected.length === 0) return undefined

  // 按优先级排序，返回最高优先级的类型
  detected.sort((a, b) => b.priority - a.priority)
  return detected[0].type
}

/**
 * 获取检测到的项目文件
 */
export function getDetectedFiles(cwd: string = process.cwd()): string[] {
  const detected: string[] = []

  for (const indicator of PROJECT_INDICATORS) {
    try {
      const filePath = path.join(cwd, indicator.file)
      if (fs.existsSync(filePath)) {
        detected.push(indicator.file)
      }
    } catch {
      // ignore
    }
  }

  return detected
}

// ============================================================================
// Discovery Engine
// ============================================================================

/**
 * 发现适合当前项目的 MCP servers
 */
export function discoverMcpServers(projectTypeHint?: string, cwd: string = process.cwd()): DiscoveryResult {
  const projectType = projectTypeHint || detectProjectType(cwd) || 'general'
  const detectedFiles = getDetectedFiles(cwd)

  const recommendations = SERVER_REGISTRY
    .filter(server => {
      // 通用服务器（*）始终推荐
      if (server.projectTypes.includes('*')) return true
      // 项目特定服务器
      return server.projectTypes.some(type => type === projectType)
    })
    .map(server => ({
      ...server,
      // 调整匹配度
      match: server.projectTypes.includes('*') ? Math.min(server.match, 75) : server.match,
    }))
    .sort((a, b) => b.match - a.match)

  return {
    projectType,
    recommendations,
    detectedFiles,
  }
}

/**
 * 生成 MCP 配置建议
 */
export function generateMcpConfig(recommendations: McpServerRecommendation[]): string {
  const lines: string[] = [
    '{',
    '  "mcpServers": {',
  ]

  recommendations.slice(0, 5).forEach((rec, i) => {
    const isLast = i === recommendations.length - 1
    const comma = isLast ? '' : ','

    // 生成配置
    const config = generateServerConfig(rec)
    lines.push(`    "${rec.name}"：${config}${comma}`)
  })

  lines.push('  }')
  lines.push('}')

  return lines.join('\n')
}

/**
 * 生成单个 server 的配置
 */
function generateServerConfig(rec: McpServerRecommendation): string {
  // 简单的配置生成（实际应根据 server 类型生成正确的配置）
  if (rec.category === 'language') {
    return JSON.stringify({
      command: 'npx',
      args: ['-y', rec.install.replace('npx ', '')],
    })
  }

  return JSON.stringify({
    command: 'npx',
    args: ['-y', rec.install.replace('npx ', '')],
  })
}

/**
 * 生成推荐报告
 */
export function generateDiscoveryReport(result: DiscoveryResult): string {
  const lines: string[] = [
    ' MCP Server 发现与推荐',
    '',
    `项目类型: ${result.projectType || '通用'}`,
    `检测到的文件: ${result.detectedFiles.length > 0 ? result.detectedFiles.join(', ') : '无'}`,
    `推荐数量: ${result.recommendations.length}`,
    '',
    '## 推荐列表',
    '',
  ]

  result.recommendations.forEach((rec, i) => {
    const matchIcon = rec.match >= 90 ? '🎯' : rec.match >= 70 ? '✨' : '💡'
    lines.push(`${i + 1}. ${matchIcon} ${rec.name} (${rec.match}% 匹配)`)
    lines.push(`   类别: ${rec.category}`)
    lines.push(`   ${rec.description}`)
    lines.push(`   安装: ${rec.install}`)
    lines.push('')
  })

  lines.push('## 配置示例')
  lines.push('')
  lines.push(generateMcpConfig(result.recommendations))

  lines.push('')
  lines.push('💡 使用提示:')
  lines.push('  - 将上述配置添加到 Claude Code 的 MCP 配置文件中')
  lines.push('  - 使用 /mcp enable <server-name> 启用 server')
  lines.push('  - 使用 /mcp 查看当前状态')

  return lines.join('\n')
}
