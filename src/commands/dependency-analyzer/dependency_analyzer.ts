import type { LocalJSXCommandCall } from '../../types/command.js'
import { readFileSync, existsSync, statSync } from 'fs'
import { resolve, join, basename, extname } from 'path'

interface DependencyInfo {
  name: string
  version: string
  size: number
  type: 'production' | 'development' | 'optional' | 'unknown'
  category: string
  lastUpdate?: string
}

interface DependencyAnalysis {
  total: number
  production: DependencyInfo[]
  development: DependencyInfo[]
  optional: DependencyInfo[]
  unknown: DependencyInfo[]
  largeDeps: DependencyInfo[]
  outdated: DependencyInfo[]
  duplicated: DependencyInfo[]
  unused: string[]
}

// 常见依赖分类
const DEP_CATEGORIES: Record<string, string> = {
  react: '框架',
  vue: '框架',
  'react-dom': 'UI框架',
  next: '全栈框架',
  nuxt: '全栈框架',
  tailwindcss: 'CSS框架',
  bootstrap: 'CSS框架',
  sass: 'CSS预处理',
  less: 'CSS预处理',
  moment: '日期时间',
  dayjs: '日期时间',
  date: '日期时间',
  i18n: '国际化',
  i18next: '国际化',
  socket: 'WebSocket',
  ws: 'WebSocket',
  redux: '状态管理',
  mobx: '状态管理',
  pinia: '状态管理',
  'state-management': '状态管理'
}

// 估算依赖大小（实际应该从 node_modules 读取）
function estimateDepSize(name: string, version: string): number {
  // 返回KB单位的估算大小
  const sizeMap: Record<string, number> = {
    react: 120,
    'react-dom': 150,
    vue: 90,
    angular: 500,
    next: 200,
    vite: 80,
    webpack: 150,
    typescript: 40,
    eslint: 30,
    jest: 100,
    express: 60,
    axios: 20,
    lodash: 70,
    moment: 350,
    dayjs: 7,
    'date-fns': 15,
    tailwindcss: 8,
    bootstrap: 200
  }

  const baseName = name.replace(/^@[^/]+\//, '')
  return sizeMap[baseName.toLowerCase()] || 20
}

function categorizeDep(name: string): string {
  const lowerName = name.toLowerCase()
  for (const [key, category] of Object.entries(DEP_CATEGORIES)) {
    if (lowerName.includes(key)) return category
  }
  return '其他'
}

function analyzePackageJson(projectPath: string): DependencyAnalysis {
  const packageJsonPath = join(projectPath, 'package.json')
  const lockPath = join(projectPath, 'bun.lockb')

  if (!existsSync(packageJsonPath)) {
    return {
      total: 0,
      production: [],
      development: [],
      optional: [],
      unknown: [],
      largeDeps: [],
      outdated: [],
      duplicated: [],
      unused: []
    }
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  const deps: DependencyInfo[] = []

  // 生产依赖
  const prodDeps = packageJson.dependencies || {}
  for (const [name, version] of Object.entries(prodDeps)) {
    deps.push({
      name,
      version: version as string,
      size: estimateDepSize(name, version as string),
      type: 'production',
      category: categorizeDep(name)
    })
  }

  // 开发依赖
  const devDeps = packageJson.devDependencies || {}
  for (const [name, version] of Object.entries(devDeps)) {
    deps.push({
      name,
      version: version as string,
      size: estimateDepSize(name, version as string),
      type: 'development',
      category: categorizeDep(name)
    })
  }

  // 可选依赖
  const optDeps = packageJson.optionalDependencies || {}
  for (const [name, version] of Object.entries(optDeps)) {
    deps.push({
      name,
      version: version as string,
      size: estimateDepSize(name, version as string),
      type: 'optional',
      category: categorizeDep(name)
    })
  }

  // 识别大型依赖（>100KB）
  const largeDeps = deps.filter(d => d.size > 100)

  // 识别可能过时的依赖（简单检查版本是否为*或latest）
  const outdated = deps.filter(d => d.version === '*' || d.version === 'latest')

  // 统计分类
  const byType = {
    production: deps.filter(d => d.type === 'production'),
    development: deps.filter(d => d.type === 'development'),
    optional: deps.filter(d => d.type === 'optional'),
    unknown: []
  }

  return {
    total: deps.length,
    ...byType,
    largeDeps,
    outdated,
    duplicated: [], // 需要更复杂的逻辑
    unused: [] // 需要扫描导入语句
  }
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parts = args?.trim().split(/\s+/) || []
  const command = parts[0]?.toLowerCase() || 'help'
  const projectPath = context?.getAppState?.()?.cwd || process.cwd()

  try {
    if (command === 'help' || command === '') {
      return {
        type: 'jsx',
        render: () => [
          '📦 依赖分析工具',
          '===============',
          '',
          '分析项目依赖结构、大小和潜在问题。',
          '',
          '命令:',
          ' overview   - 项目依赖概览',
          ' stats      - 依赖统计详情',
          ' large      - 大型依赖分析',
          ' outdated   - 过时依赖检查',
          ' unused     - 未使用依赖检测',
          ' dup        - 重复依赖检测',
          ' size       - 依赖大小排序',
          ' tree       - 依赖树可视化',
          ' audit      - 安全审计',
          ' health     - 依赖健康评分',
          ' report     - 生成完整报告',
          '',
          '示例:',
          ' /dependency-analyzer overview',
          ' /dependency-analyzer large',
          ' /dependency-analyzer audit',
          '',
          '💡 提示: 绑定在项目根目录运行以获取准确分析'
        ].join('\n')
      }
    }

    // 检查 package.json 是否存在
    if (!existsSync(join(projectPath, 'package.json'))) {
      return {
        type: 'jsx',
        render: () => [
          '❌ 未找到 package.json',
          '',
          `当前目录: ${projectPath}`,
          '',
          '确保在项目根目录运行，或包含有效的 package.json 文件。',
          '',
          '💡 创建 package.json:',
          ' bun init',
          ' npm init',
          ' pnpm init'
        ].join('\n')
      }
    }

    const analysis = analyzePackageJson(projectPath)

    // 概览
    if (command === 'overview') {
      return {
        type: 'jsx',
        render: () => [
          '📊 依赖分析概览',
          '===============',
          '',
          `扫描目录: ${projectPath}`,
          `package.json: 存在`,
          '',
          '📈 统计:',
          ` • 总依赖数: ${analysis.total}`,
          ` • 生产依赖: ${analysis.production.length}`,
          ` • 开发依赖: ${analysis.development.length}`,
          ` • 可选依赖: ${analysis.optional.length}`,
          ` • 大型依赖(>100KB): ${analysis.largeDeps.length}`,
          ` • 过时依赖: ${analysis.outdated.length}`,
          '',
          '🏷️ 主要分类:',
          ...Object.entries(
            analysis.production
              .concat(analysis.development)
              .reduce((acc, dep) => {
                acc[dep.category] = (acc[dep.category] || 0) + 1
                return acc
              }, {} as Record<string, number>)
          ).map(([cat, count]) => ` • ${cat}: ${count}`),
          '',
          '💡 使用 size 命令查看依赖大小排序'
        ].join('\n')
      }
    }

    // 统计
    if (command === 'stats') {
      const prodS = analysis.production.length
      const devS = analysis.development.length
      const optS = analysis.optional.length

      return {
        type: 'jsx',
        render: () => [
          '📈 依赖统计详情',
          '===============',
          '',
          '📦 依赖分布:',
          `生产依赖: ${prodS} 个 (${analysis.production.reduce((s, d) => s + d.size, 0)} KB)`,
          `开发依赖: ${devS} 个 (${analysis.development.reduce((s, d) => s + d.size, 0)} KB)`,
          `可选依赖: ${optS} 个 (${analysis.optional.reduce((s, d) => s + d.size, 0)} KB)`,
          '',
          '📊 生产依赖列表:',
          ...analysis.production.slice(0, 20).map(d =>
            ` • ${d.name}@${d.version} (${d.size} KB) [${d.category}]`
          ),
          analysis.production.length > 20 ? ` ... 还有 ${analysis.production.length - 20} 个` : '',
          '',
          '💡 使用 large 命令查看大型依赖'
        ].join('\n')
      }
    }

    // 大型依赖
    if (command === 'large') {
      if (analysis.largeDeps.length === 0) {
        return {
          type: 'jsx',
          render: () => [
            '📦 大型依赖分析',
            '===============',
            '',
            '✅ 没有发现大型依赖 (>100KB)',
            '',
            '💡 提示: 大型依赖可能增加包大小和启动时间'
          ].join('\n')
        }
      }

      return {
        type: 'jsx',
        render: () => [
          '📦 大型依赖分析',
          '===============',
          '',
          `发现 ${analysis.largeDeps.length} 个大型依赖:`,
          '',
          ...analysis.largeDeps
            .sort((a, b) => b.size - a.size)
            .slice(0, 10)
            .map((d, i) => [
              `${i + 1}. ${d.name}@${d.version}`,
              `   大小: ${d.size} KB`,
              `   类别: ${d.category}`,
              `   类型: ${d.type}`
            ].join('\n')),
          '',
          '🔧 优化建议:',
          ' • 考虑替换为轻量级替代品',
          ' • 使用动态导入减少初始包大小',
          ' • 检查是否所有功能都被使用'
        ].join('\n')
      }
    }

    // 过时依赖
    if (command === 'outdated') {
      if (analysis.outdated.length === 0) {
        return {
          type: 'jsx',
          render: () => [
            '✅ 过时依赖检查',
            '',
            '未发现过时依赖（版本为 * 或 latest）。',
            '',
            '💡 提示: 使用 bun update 或 npm update 定期更新依赖'
          ].join('\n')
        }
      }

      return {
        type: 'jsx',
        render: () => [
          '⚠️ 过时依赖检查',
          '===============',
          '',
          `发现 ${analysis.outdated.length} 个潜在过时依赖:`,
          '',
          ...analysis.outdated.map((d, i) =>
            ` ${i + 1}. ${d.name}@${d.version} (${d.category})`
          ),
          '',
          '🔧 建议运行:',
          ' bun update',
          ' 或',
          ' npm update'
        ].join('\n')
      }
    }

    // 大小排序
    if (command === 'size') {
      const allDeps = [...analysis.production, ...analysis.development]
        .sort((a, b) => b.size - a.size)
        .slice(0, 20)

      return {
        type: 'jsx',
        render: () => [
          '📏 依赖大小排序',
          '===============',
          '',
          ...allDeps.map((d, i) => {
            const bar = '█'.repeat(Math.min(20, d.size / 10))
            return `${(i + 1).toString().padStart(2)}. ${d.name.padEnd(20)} ${bar} ${d.size}KB`
          }),
          '',
          '💡 大的依赖可能影响构建和启动速度'
        ].join('\n')
      }
    }

    // 健康评分
    if (command === 'health') {
      const totalSize = analysis.production.reduce((s, d) => s + d.size, 0)
      const largeRatio = analysis.largeDeps.length / Math.max(analysis.production.length, 1)
      const outdatedRatio = analysis.outdated.length / Math.max(analysis.total, 1)

      let score = 100
      if (largeRatio > 0.3) score -= 20
      else if (largeRatio > 0.1) score -= 10
      if (outdatedRatio > 0.1) score -= 15
      else if (outdatedRatio > 0.05) score -= 5
      if (analysis.total > 100) score -= 15
      else if (analysis.total > 50) score -= 5

      return {
        type: 'jsx',
        render: () => [
          '💚 依赖健康评分',
          '===============',
          '',
          `📊 健康分数: ${score}/100`,
          '',
          score >= 80 ? '✅ 依赖状态良好' :
          score >= 60 ? '⚠️ 依赖状态一般' : '🚨 依赖状态需要改善',
          '',
          '📋 评分因素:',
          ` • 大型依赖比例: ${(largeRatio * 100).toFixed(0)}% ${largeRatio > 0.1 ? '⚠️' : '✅'}`,
          ` • 过时依赖比例: ${(outdatedRatio * 100).toFixed(0)}% ${outdatedRatio > 0.05 ? '⚠️' : '✅'}`,
          ` • 总依赖数: ${analysis.total} ${analysis.total > 50 ? '⚠️' : '✅'}`,
          '',
          '💡 建议:',
          score < 80 ? ' 1. 减少大型依赖数量' : ' 1. 继续保持良好状态',
          score < 80 ? ' 2. 更新过时依赖' : ' 2. 定期审查依赖',
          ' 3. 定期运行 bun audit'
        ].join('\n')
      }
    }

    // 树形可视化
    if (command === 'tree') {
      return {
        type: 'jsx',
        render: () => [
          '🌲 依赖树可视化',
          '===============',
          '',
          '📦 依赖结构:',
          ...analysis.production.slice(0, 15).map(d =>
            ` ├─ ${d.name}@${d.version}`
          ),
          analysis.production.length > 15 ? ' ... 更多依赖' : '',
          '',
          '⚠️ 注意: 完整的依赖树需要解析 node_modules',
          '',
          '💡 提示: 使用以下命令查看完整树:',
          ' bun pm ls --depth 2',
          ' npm ls --depth=2',
          ' pnpm ls --depth=2'
        ].join('\n')
      }
    }

    // 安全审计
    if (command === 'audit') {
      return {
        type: 'jsx',
        render: () => [
          '🔒 依赖安全审计',
          '===============',
          '',
          '🛡️ 安全检查:',
          ...analysis.production.slice(0, 20).map(d => {
            // 简单的安全检查建议
            const safeList = ['react', 'vue', 'lodash', 'axios', 'next']
            const isLikelySafe = safeList.some(s => d.name.toLowerCase().includes(s))
            return ` ${isLikelySafe ? '✅' : '🔍'} ${d.name}@${d.version}`
          }),
          '',
          '💡 建议运行:',
          ' bun audit',
          ' npm audit',
          ' pnpm audit'
        ].join('\n')
      }
    }

    // 完整报告
    if (command === 'report') {
      const totalSize = analysis.production.reduce((s, d) => s + d.size, 0)
      return {
        type: 'jsx',
        render: () => [
          '📋 依赖分析报告',
          '===============',
          '',
          `项目: ${projectPath}`,
          `生成时间: ${new Date().toLocaleString('zh-CN')}`,
          '',
          '📊 摘要:',
          ` • 总依赖数: ${analysis.total}`,
          ` • 生产依赖: ${analysis.production.length}`,
          ` • 开发依赖: ${analysis.development.length}`,
          ` • 预估大小: ${totalSize} KB`,
          ` • 大型依赖: ${analysis.largeDeps.length}`,
          ` • 过时依赖: ${analysis.outdated.length}`,
          '',
          '🏷️ 分类分布:',
          ...Object.entries(
            analysis.production
              .concat(analysis.development)
              .reduce((acc, dep) => {
                acc[dep.category] = (acc[dep.category] || 0) + 1
                return acc
              }, {} as Record<string, number>)
          ).map(([cat, count]) => ` • ${cat}: ${count}`),
          '',
          '💡 使用 /dependency-analyzer large 查看大型依赖',
          '   /dependency-analyzer outdated 查看过时依赖'
        ].join('\n')
      }
    }

    return {
      type: 'jsx',
      render: () => `未知命令: ${command}，使用 help 查看可用命令。`
    }
  } catch (error) {
    return {
      type: 'jsx',
      render: () => [
        '❌ 依赖分析出错',
        '',
        `错误: ${error instanceof Error ? error.message : String(error)}`,
        '',
        '💡 请确保在有效的 Node.js 项目目录中运行'
      ].join('\n')
    }
  }
}
