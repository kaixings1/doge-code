import * as fs from 'fs'
import * as path from 'path'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

const DEFAULT_DIR = 'src'
const PROGRESS_FILE = '.batch-progress.json'
const LOG_FILE = '.batch-han-log.txt'
const PID_FILE = '.batch-han-pid.txt'
const MAX_BATCH_TOKENS = 80000
const CONCURRENCY = 2
const RETRY_LIMIT = 2
const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.md']
const DICT_FILE = 'batch-han-dict.json'
const IGNORE_FILE = '.batch-han-ignore'

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

interface FileInfo {
  path: string
  content: string
  mtime: number
  tokenCount: number
  extension: string
}

interface ExternalDict {
  ui?: Record<string, string>
  md?: Record<string, string>
  patterns?: Array<{ find: string; replace: string; flags?: string; type?: string }>
}

function loadExternalDict(targetDir: string): ExternalDict {
  const dictPath = path.join(targetDir, DICT_FILE)
  try {
    if (fs.existsSync(dictPath)) {
      const raw = fs.readFileSync(dictPath, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {
    // ignore invalid dict file
  }
  return {}
}

function loadIgnorePatterns(targetDir: string): string[] {
  const ignorePath = path.join(targetDir, IGNORE_FILE)
  try {
    if (fs.existsSync(ignorePath)) {
      return fs.readFileSync(ignorePath, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
    }
  } catch {
    // ignore
  }
  return []
}

function getAllFilesWithInfo(
  dir: string,
  extensions: string[] = DEFAULT_EXTENSIONS,
  excludePatterns: string[] = [],
): FileInfo[] {
  const results: FileInfo[] = []
  const absDir = path.resolve(dir)
  if (!fs.existsSync(absDir)) return results

  function shouldExclude(filePath: string): boolean {
    const relPath = path.relative(absDir, filePath)
    return excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
        return regex.test(relPath) || regex.test(path.basename(filePath))
      }
      return relPath.includes(pattern) || path.basename(filePath).includes(pattern)
    })
  }

  function walk(currentDir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(currentDir, entry.name)
      try {
        if (entry.isDirectory()) {
          const base = path.basename(full)
          if (base === 'node_modules' || base === '.git' || base === 'dist' || base === 'build' || base === '.doge') continue
          walk(full)
        } else if (entry.isFile()) {
          if (shouldExclude(full)) continue
          const ext = path.extname(entry.name).toLowerCase()
          if (extensions.includes(ext)) {
            const stat = fs.statSync(full)
            let content = fs.readFileSync(full, 'utf-8')
            if (content.length > 0 && content.charCodeAt(0) === 0xFEFF) {
              content = content.slice(1)
            }
            results.push({
              path: full,
              content,
              mtime: stat.mtimeMs,
              tokenCount: estimateTokens(content),
              extension: ext
            })
          }
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  walk(absDir)
  return results
}

function loadHistory(progressFile: string): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(progressFile, 'utf-8'))
  } catch {
    return {}
  }
}

function saveHistory(history: Record<string, number>, progressFile: string): void {
  fs.writeFileSync(progressFile, JSON.stringify(history, null, 2))
}

function appendLog(logFile: string, message: string): void {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`)
}

// 专门针对 UI 字符串的翻译（仅在引号中的字符串替换）
const UI_TRANSLATIONS: Record<string, string> = {
  '排除的命令': '排除的命令',
  '文件系统': '文件系统',
  '网络': '网络',
  'Unix 套接字': 'Unix 套接字',
  'seatbelt 内置': 'seatbelt 内置',
  '您的 bash 命令将在沙箱中执行': '您的 bash 命令将在沙箱中执行',
  '了解更多': '了解更多',
  '也已请求': '也已请求',
  '受策略限制的钩子': '受策略限制的钩子',
  '二进制文件': '二进制文件',
  '大文件差异': '大文件差异',
  '外部导入': '外部导入',
}

// 针对 Markdown 文档的常见英文词汇翻译
const MD_TRANSLATIONS: Record<string, string> = {
  // 标题和常见术语
  'Overview': '概述',
  'Introduction': '简介',
  'Prerequisites': '前置条件',
  'Quick Start': '快速开始',
  'Getting Started': '入门指南',
  'Installation': '安装',
  'Configuration': '配置',
  'Usage': '用法',
  'Examples': '示例',
  'API Reference': 'API 参考',
  'Documentation': '文档',
  'Tutorial': '教程',
  'Guide': '指南',
  'Manual': '手册',
  'Reference': '参考',
  'Specification': '规范',
  'Requirements': '需求',
  'Dependencies': '依赖项',
  'Setup': '设置',
  'Deployment': '部署',
  'Migration': '迁移',
  'Performance': '性能',
  'Security': '安全性',
  'Limitations': '限制',
  'Known Issues': '已知问题',
  'FAQ': '常见问题',
  'Troubleshooting': '故障排除',
  'Debugging': '调试',
  'Testing': '测试',
  'Contributing': '贡献指南',
  'License': '许可证',
  'Changelog': '更新日志',
  'Release Notes': '发布说明',
  'Roadmap': '路线图',

  // 技能文件特定
  'Skill': '技能',
  'Description': '描述',
  'When to Use': '使用场景',
  'Best Practices': '最佳实践',
  'Tool Discovery': '工具发现',
  'Core Workflow Pattern': '核心工作流模式',
  'Environment Variables': '环境变量',
  'How It Works': '工作原理',
  'Purpose': '目的',
  'Authentication': '认证',
  'Error Handling': '错误处理',
  'Output Format': '输出格式',
  'Workflow': '工作流',
  'Resources': '资源',
  'Related Skills': '相关技能',
  'Core Workflows': '核心工作流',
  'Capabilities': '能力',
  'Common Pitfalls': '常见陷阱',
  'Reference Links': '参考链接',
  'Anti-Patterns': '反模式',
  'Safety': '安全',

  // 常见短语
  'Use this skill when': '使用此技能当',
  'This skill performs': '此技能执行',
  'This skill provides': '此技能提供',
  'This skill helps': '此技能帮助',
  'You are an expert': '你是专家',
  'Follow these steps': '按以下步骤操作',
  'Do NOT': '不要',
  'Always': '始终',
  'Never': '绝不',
  'Prefer': '优先',
  'Consider': '考虑',
  'Requires': '需要',
  'Required': '必需',
  'Optional': '可选',
  'Default': '默认',
  'See Also': '另请参阅',
  'Learn More': '了解更多',
  'Key Features': '主要功能',
  'Core Concepts': '核心概念',
  'Architecture': '架构',
  'Integration': '集成',
  'Scope': '范围',
  'Context': '上下文',
  'Constraints': '约束条件',
  'Status': '状态',
}

// 反向词典（中文到英文），用于 --reverse 模式
const REVERSE_UI: Record<string, string> = {}
const REVERSE_MD: Record<string, string> = {}
for (const [en, zh] of Object.entries(UI_TRANSLATIONS)) { if (en !== zh) REVERSE_UI[zh] = en }
for (const [en, zh] of Object.entries(MD_TRANSLATIONS)) { if (en !== zh) REVERSE_MD[zh] = en }

function localizeStrings(
  content: string,
  extension: string,
  externalDict?: ExternalDict,
  reverse?: boolean,
): string {
  let result = content

  // TypeScript/JavaScript 文件：只处理引号内的字符串
  if (extension === '.ts' || extension === '.tsx') {
    const dict = reverse ? REVERSE_UI : UI_TRANSLATIONS
    const mergedDict = externalDict?.ui ? { ...dict, ...externalDict.ui } : dict

    for (const [english, chinese] of Object.entries(mergedDict)) {
      const escapedEn = english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result.replace(new RegExp(`"${escapedEn}"`, 'g'), `"${chinese}"`)
      result = result.replace(new RegExp(`'${escapedEn}'`, 'g'), `'${chinese}'`)
      result = result.replace(new RegExp('`' + escapedEn + '`', 'g'), '`' + chinese + '`')
    }

    if (externalDict?.patterns) {
      for (const rule of externalDict.patterns) {
        if (!rule.type || rule.type === 'ts' || rule.type === 'tsx') {
          try { result = result.replace(new RegExp(rule.find, rule.flags || 'g'), rule.replace) } catch { /* skip */ }
        }
      }
    }
  }
  // Markdown 文件：处理标题、段落和列表
  else if (extension === '.md') {
    const dict = reverse ? REVERSE_MD : MD_TRANSLATIONS
    const mergedDict = externalDict?.md ? { ...dict, ...externalDict.md } : dict

    for (const [english, chinese] of Object.entries(mergedDict)) {
      const escapedEn = english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      result = result.replace(new RegExp(`^(#+)\\s*${escapedEn}\\s*$`, 'gm'), `$1 ${chinese}`)
      result = result.replace(new RegExp(`^(#+)\\s*${escapedEn}:\\s*$`, 'gm'), `$1 ${chinese}：`)
      result = result.replace(new RegExp(`\\b${escapedEn}\\b`, 'gi'), chinese)
    }

    if (!reverse) {
      const patterns: Array<[RegExp, string]> = [
        [/\b(The|This|An?)\s+([A-Z][a-z]+)/g, '$2'],
        [/\bis used to\b/gi, '用于'],
        [/\bis designed to\b/gi, '设计用于'],
        [/\ballows you to\b/gi, '允许你'],
        [/\bprovides a way to\b/gi, '提供一种方式'],
        [/\bfor example\b/gi, '例如'],
        [/\bin addition\b/gi, '此外'],
        [/\bhowever\b/gi, '然而'],
        [/\btherefore\b/gi, '因此'],
        [/\bin conclusion\b/gi, '总之'],
      ]
      for (const [pattern, replacement] of patterns) result = result.replace(pattern, replacement)
    }

    if (externalDict?.patterns) {
      for (const rule of externalDict.patterns) {
        if (!rule.type || rule.type === 'md') {
          try { result = result.replace(new RegExp(rule.find, rule.flags || 'g'), rule.replace) } catch { /* skip */ }
        }
      }
    }
  }
  // JSON 文件：替换字符串值中的英文内容
  else if (extension === '.json') {
    try {
      const obj = JSON.parse(result)
      const dict = reverse ? { ...REVERSE_UI, ...REVERSE_MD } : { ...UI_TRANSLATIONS, ...MD_TRANSLATIONS }
      const mergedDict = (externalDict?.ui || externalDict?.md) ? { ...dict, ...externalDict.ui, ...externalDict.md } : dict

      function walkJson(node: unknown): [unknown, boolean] {
        if (typeof node === 'string') {
          let s = node as string; let mod = false
          for (const [en, zh] of Object.entries(mergedDict)) {
            const re = new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
            if (re.test(s)) { s = s.replace(re, zh); mod = true }
          }
          return [s, mod]
        }
        if (Array.isArray(node)) {
          let mod = false; const arr = node.map(v => { const [nv, nm] = walkJson(v); if (nm) mod = true; return nv })
          return [arr, mod]
        }
        if (node !== null && typeof node === 'object') {
          let mod = false; const obj: Record<string, unknown> = {}
          for (const key of Object.keys(node as Record<string, unknown>)) {
            const [nv, nm] = walkJson((node as Record<string, unknown>)[key])
            if (nm) mod = true; obj[key] = nv
          }
          return [obj, mod]
        }
        return [node, false]
      }

      const [newObj, modified] = walkJson(obj)
      if (modified) { result = JSON.stringify(newObj, null, 2) }
    } catch { /* not valid JSON */ }
  }

  return result
}

function processFile(
  filePath: string,
  logFile: string,
  externalDict?: ExternalDict,
  reverse?: boolean,
): boolean {
  try {
    let content = fs.readFileSync(filePath, 'utf-8')
    if (content.length > 0 && content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1)
    }
    const ext = path.extname(filePath).toLowerCase()
    const newContent = localizeStrings(content, ext, externalDict, reverse)
    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent)
      appendLog(logFile, '✓ 已翻译: ' + path.basename(filePath))
      return true
    }
    return false
  } catch (err) {
    appendLog(logFile, '✗ 失败: ' + path.basename(filePath) + ' - ' + (err instanceof Error ? err.message : String(err)))
    return false
  }
}

function dryRunProcessFile(
  filePath: string,
  externalDict?: ExternalDict,
  reverse?: boolean,
): { changed: boolean; diff: string } {
  try {
    let content = fs.readFileSync(filePath, 'utf-8')
    if (content.length > 0 && content.charCodeAt(0) === 0xFEFF) { content = content.slice(1) }
    const ext = path.extname(filePath).toLowerCase()
    const newContent = localizeStrings(content, ext, externalDict, reverse)
    if (newContent !== content) {
      const oldLines = content.split('\n')
      const newLines = newContent.split('\n')
      const diffParts: string[] = []
      const maxLines = 20
      let lineCount = 0
      for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
        if (lineCount >= maxLines) { diffParts.push('  ...（更多差异已省略）'); break }
        const oldLine = oldLines[i] ?? ''
        const newLine = newLines[i] ?? ''
        if (oldLine !== newLine) { diffParts.push('- ' + oldLine); diffParts.push('+ ' + newLine); lineCount += 2 }
      }
      return { changed: true, diff: diffParts.join('\n') }
    }
    return { changed: false, diff: '' }
  } catch { return { changed: false, diff: '' } }
}

function generateReport(
  absTargetDir: string,
  allFiles: FileInfo[],
  history: Record<string, number>,
  logFile: string,
): string {
  const extCount: Record<string, number> = {}
  let totalSize = 0
  for (const f of allFiles) { extCount[f.extension] = (extCount[f.extension] || 0) + 1; totalSize += f.content.length }
  const pending = allFiles.filter(f => !history[f.path] || history[f.path] !== f.mtime)
  const processedCount = allFiles.length - pending.length
  return [
    '📊 batch-han 统计报告',
    '目标目录: ' + absTargetDir,
    '文件总数: ' + allFiles.length,
    '已处理: ' + processedCount,
    '待处理: ' + pending.length,
    '总字符数: ' + totalSize,
    '文件类型分布:',
    ...Object.entries(extCount).sort((a, b) => b[1] - a[1]).map(([ext, count]) => '  ' + ext + ': ' + count + ' 个文件'),
    '日志文件: ' + logFile,
  ].join('\n')
}

function createBatches(
  fileInfos: FileInfo[],
  logFile: string,
): FileInfo[][] {
  const batches: FileInfo[][] = []
  let currentBatch: FileInfo[] = []
  let currentTokens = 0

  for (const info of fileInfos) {
    if (info.tokenCount > MAX_BATCH_TOKENS - 5000) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch)
        currentBatch = []
        currentTokens = 0
      }
      appendLog(logFile, '⚠️ 文件过大（' + info.tokenCount + ' tokens）: ' + path.basename(info.path) + '，单独处理')
      batches.push([info])
      continue
    }
    if (currentTokens + info.tokenCount > MAX_BATCH_TOKENS && currentBatch.length > 0) {
      batches.push(currentBatch)
      currentBatch = []
      currentTokens = 0
    }
    currentBatch.push(info)
    currentTokens += info.tokenCount
  }
  if (currentBatch.length > 0) batches.push(currentBatch)
  return batches
}

function isRunning(pidFile: string): boolean {
  try {
    const pid = fs.readFileSync(pidFile, 'utf-8').trim()
    if (!pid) return false
    try {
      process.kill(parseInt(pid, 10), 0)
      return true
    } catch {
      return false
    }
  } catch {
    return false
  }
}

function showHelp(): string {
  return `📖 batch-han 使用说明

用法:
  /batch-han                   扫描 <src> 目录下的 .ts/.tsx/.md 文件进行汉化
  /batch-han <目录路径>         扫描指定目录进行汉化
  /batch-han --status          查看当前执行状态
  /batch-han -c <并发数>       设置并发数

示例:
  /batch-han d:/doge-code/.claude/skills   汉化 skills 目录
  /batch-han .                              汉化当前目录
  /batch-han --status                       查看进度
  /batch-han --types=.ts                   仅汉化 .ts 文件
  /batch-han --types=.md                   仅汉化 .md 文件
  /batch-han --types=.ts,.tsx,.md          汉化多种文件

说明:
  - 日志文件 (` + LOG_FILE + `) 和进度文件 (` + PROGRESS_FILE + `)
    会存放在目标目录下
  - 跳过 node_modules、.git、dist、build、.doge 目录
  - 支持断点续传：处理过的文件不会重复处理
  - 支持文件类型: .ts (UI 字符串) / .tsx (UI 字符串) / .md (文档词汇) / .json (JSON 值)
  - 可通过 --types 参数指定要处理的文件扩展名（逗号分隔）
  - .ts/.tsx: 仅替换引号中的 UI 字符串
  - .md: 替换标题、段落中的英文词汇和常见短语

扩展功能:
  /batch-han . --dry-run                   预览模式（不实际修改文件）
  /batch-han . --reverse                   逆向翻译（中文→英文）
  /batch-han . --exclude=test,mock         排除包含 test/mock 的文件/目录
  /batch-han . --only=Permission,Config    仅处理文件名含指定关键词的文件
  /batch-han . --rollback                  回滚最近的备份
  /batch-han . --report                    输出汉化统计报告
  /batch-han . --types=.json               汉化 JSON 文件（替换字符串值）
  /batch-han . --dict=D:/path/to/dict.json  使用外部词典文件
  - 外部词典: 在目标目录放 ` + DICT_FILE + ` 文件可自定义翻译映射
  - 忽略规则: 在目标目录放 ` + IGNORE_FILE + ` 文件（每行一个模式，支持 * 通配符）
  - 备份: 每次修改前自动创建 .bak 文件，支持 --rollback 回滚`
}

export const call: LocalCommandCall = async (args: string): Promise<LocalCommandResult> => {
  const parts = args.trim().split(/\s+/).filter(Boolean)

  // ❗ 空参数 → 显示帮助
  if (parts.length === 0) {
    return { type: 'text', value: showHelp() }
  }

  // 状态查询模式
  if (parts.length === 1 && (parts[0] === '--status' || parts[0] === '-s')) {
    const absTargetDir = path.resolve(DEFAULT_DIR)
    const logFile = path.join(absTargetDir, LOG_FILE)
    const pidFile = path.join(absTargetDir, PID_FILE)
    const running = isRunning(pidFile)
    let log: string
    try {
      log = fs.readFileSync(logFile, 'utf-8')
      const lines = log.trim().split('\n')
      const tail = lines.slice(-20).join('\n')
      return {
        type: 'text',
        value: (running ? '🟢 正在运行中\n' : '🔴 未在运行\n')
          + '--- 最近日志（末 20 行） ---\n'
          + tail
          + '\n---\n查看完整日志: type ' + logFile + '\n清空日志: del ' + logFile,
      }
    } catch {
      return { type: 'text', value: (running ? '🟢 正在运行中' : '🔴 未在运行') + '（无日志）' }
    }
  }

  // ❗ 帮助模式
  if (parts[0] === '--help' || parts[0] === '-h') {
    return { type: 'text', value: showHelp() }
  }

  let targetDir = DEFAULT_DIR
  let concurrency = CONCURRENCY
  let extensions: string[] | null = null
  let dryRun = false
  let reverse = false
  let excludePatterns: string[] = []
  let onlyPatterns: string[] = []
  let rollback = false
  let reportMode = false
  let dictPath: string | null = null

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '--concurrency' || parts[i] === '-c') {
      concurrency = parseInt(parts[i + 1], 10)
      if (isNaN(concurrency) || concurrency < 1) concurrency = CONCURRENCY
      i++
    } else if (parts[i] === '--types') {
      if (parts[i + 1] && !parts[i + 1].startsWith('-')) {
        extensions = parts[i + 1].split(',').map(t => t.startsWith('.') ? t.toLowerCase() : '.' + t.toLowerCase())
        i++
      }
    } else if (parts[i] === '--dry-run') {
      dryRun = true
    } else if (parts[i] === '--reverse') {
      reverse = true
    } else if (parts[i] === '--exclude') {
      if (parts[i + 1] && !parts[i + 1].startsWith('-')) {
        excludePatterns = parts[i + 1].split(',').map(s => s.trim()).filter(Boolean)
        i++
      }
    } else if (parts[i] === '--only') {
      if (parts[i + 1] && !parts[i + 1].startsWith('-')) {
        onlyPatterns = parts[i + 1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        i++
      }
    } else if (parts[i] === '--rollback') {
      rollback = true
    } else if (parts[i] === '--report') {
      reportMode = true
    } else if (parts[i] === '--dict') {
      if (parts[i + 1] && !parts[i + 1].startsWith('-')) {
        dictPath = path.resolve(parts[i + 1])
        i++
      }
    } else if (!parts[i].startsWith('-')) {
      // ❗ 兼容中文"汉化"前缀：去掉开头的中文"汉化"文字
      let cleaned = parts[i]
      cleaned = cleaned.replace(/^[一-龥]+/, '')
      targetDir = cleaned
    }
  }

  const absTargetDir = path.resolve(targetDir)
  const progressFile = path.join(absTargetDir, PROGRESS_FILE)
  const logFile = path.join(absTargetDir, LOG_FILE)
  const pidFile = path.join(absTargetDir, PID_FILE)

  if (!fs.existsSync(absTargetDir)) {
    return { type: 'text', value: '错误：未找到目录：' + absTargetDir + '\n' + showHelp() }
  }

  // 回滚模式
  if (rollback) {
    return handleRollback(absTargetDir)
  }

  // 检查是否已有实例在运行（仅在非预览/报告模式时检查）
  if (!dryRun && !reportMode && isRunning(pidFile)) {
    return { type: 'text', value: '⚠️ 已有 batch-han 实例在运行（PID: ' + fs.readFileSync(pidFile, 'utf-8').trim() + '）\n使用 /batch-han --status 查看进度\n等待完成后重试，或手动删除 ' + pidFile }
  }

  // 写入 PID（非预览/报告模式）
  if (!dryRun && !reportMode) {
    fs.writeFileSync(pidFile, String(process.pid))
  }
  // 初始化日志文件
  if (!reportMode) {
    fs.writeFileSync(logFile, '')
  }

  const modeDesc = reverse ? ' 🔄 逆向' : dryRun ? ' 🔍 预览' : reportMode ? ' 📊 报告' : ''
  if (!reportMode) {
    appendLog(logFile, '🚀 batch-han 启动，PID=' + process.pid + '，目标目录=' + absTargetDir + '，并发数=' + concurrency + modeDesc)
  }

  // 同步执行（异步在 bun compiled exe 中不稳定）
  try {
    const result = await executeBatchHan(
      absTargetDir, progressFile, logFile, pidFile, concurrency, extensions,
      dryRun, reverse, excludePatterns, onlyPatterns, reportMode, dictPath,
    )
    return { type: 'text', value: result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!reportMode) {
      appendLog(logFile, '❌ 执行失败: ' + msg)
    }
    return { type: 'text', value: '❌ batch-han 失败: ' + msg + '\n查看日志: type ' + logFile }
  }
}

function handleRollback(absTargetDir: string): LocalCommandResult {
  let rollbackCount = 0
  let failCount = 0
  const bakFiles: string[] = []
  function walk(cur: string) {
    try {
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, e.name)
        if (e.isDirectory()) {
          const b = path.basename(full)
          if (b === 'node_modules' || b === '.git' || b === 'dist' || b === 'build' || b === '.doge') continue
          walk(full)
        } else if (e.isFile() && e.name.endsWith('.bak')) { bakFiles.push(full) }
      }
    } catch { }
  }
  try {
    walk(absTargetDir)
    for (const bak of bakFiles) {
      try { fs.writeFileSync(bak.slice(0, -4), fs.readFileSync(bak, 'utf-8')); fs.unlinkSync(bak); rollbackCount++ } catch { failCount++ }
    }
    return { type: 'text', value: '回滚完成: 已恢复 ' + rollbackCount + ' 个文件' + (failCount > 0 ? '，' + failCount + ' 个失败' : '') }
  } catch (err) {
    return { type: 'text', value: '回滚失败: ' + (err instanceof Error ? err.message : String(err)) }
  }
}

async function executeBatchHan(
  absTargetDir: string,
  progressFile: string,
  logFile: string,
  pidFile: string,
  concurrency: number,
  extensions?: string[],
  dryRun?: boolean,
  reverse?: boolean,
  excludePatterns?: string[],
  onlyPatterns?: string[],
  reportMode?: boolean,
  dictPath?: string,
): Promise<string> {
  const extList = extensions || DEFAULT_EXTENSIONS
  const extName = extList.join(', ')

  let externalDict: ExternalDict = {}
  if (dictPath) {
    try { externalDict = JSON.parse(fs.readFileSync(dictPath, 'utf-8')); if (!reportMode) appendLog(logFile, '已加载外部词典: ' + dictPath) }
    catch (err) { if (!reportMode) appendLog(logFile, '加载外部词典失败: ' + (err instanceof Error ? err.message : String(err))) }
  } else {
    externalDict = loadExternalDict(absTargetDir)
    if ((externalDict.ui || externalDict.md || externalDict.patterns) && !reportMode) appendLog(logFile, '已加载项目词典: ' + path.join(absTargetDir, DICT_FILE))
  }

  const ignorePatterns = loadIgnorePatterns(absTargetDir)
  const allExcludePatterns = [...(excludePatterns || []), ...ignorePatterns]

  if (!reportMode) {
    appendLog(logFile, '扫描目录: ' + absTargetDir + ' (' + extName + ')')
    if (allExcludePatterns.length > 0) appendLog(logFile, '排除: ' + allExcludePatterns.join(', '))
    if (dryRun) appendLog(logFile, '预览模式')
    if (reverse) appendLog(logFile, '逆向模式')
  }

  const allFiles = getAllFilesWithInfo(absTargetDir, extList, allExcludePatterns)
  let filteredFiles = allFiles
  if (onlyPatterns.length > 0) {
    filteredFiles = allFiles.filter(f => {
      const bn = path.basename(f.path).toLowerCase(); const rp = path.relative(absTargetDir, f.path).toLowerCase()
      return onlyPatterns.some(p => bn.includes(p) || rp.includes(p))
    })
    if (!reportMode) appendLog(logFile, '仅处理关键词: ' + onlyPatterns.join(',') + ' (匹配' + filteredFiles.length + ')')
  }

  if (filteredFiles.length === 0) { const m = '未找到文件 (' + extName + ')'; if (!reportMode) appendLog(logFile, m); return m }
  if (!reportMode) appendLog(logFile, '共 ' + filteredFiles.length + ' 个文件')

  if (reportMode) return generateReport(absTargetDir, filteredFiles, loadHistory(progressFile), logFile)

  const history = loadHistory(progressFile)
  let pending = filteredFiles.filter(f => !history[f.path] || history[f.path] !== f.mtime)
  if (dryRun) pending = filteredFiles
  if (pending.length === 0) { const m = '所有文件已是最新'; appendLog(logFile, m); return m }
  if (!dryRun) appendLog(logFile, '待处理: ' + pending.length + ' 个')

  let changedCount = 0
  const dryRunResults: Array<{ file: string; diff: string }> = []
  let processedCount = 0

  for (const file of pending) {
    if (dryRun) {
      const r = dryRunProcessFile(file.path, externalDict, reverse)
      if (r.changed) { changedCount++; dryRunResults.push({ file: file.path, diff: r.diff }) }
    } else {
      const changed = processFile(file.path, logFile, externalDict, reverse)
      if (changed) {
        changedCount++
        try { const bp = file.path + '.bak'; if (!fs.existsSync(bp)) fs.copyFileSync(file.path, bp) } catch { }
      }
      processedCount++
      try { history[file.path] = fs.statSync(file.path).mtimeMs } catch { }
      if (processedCount % 50 === 0) saveHistory(history, progressFile)
    }
  }

  if (!dryRun) {
    saveHistory(history, progressFile)
    try { fs.unlinkSync(pidFile) } catch { }
    const s = '完成! 处理 ' + changedCount + ' 个文件' + (processedCount > changedCount ? ' (扫描' + processedCount + ')' : '')
    appendLog(logFile, s); return s
  } else {
    let o = '预览: ' + changedCount + ' 个文件将被修改\n'
    if (changedCount > 0) o += '\n' + dryRunResults.slice(0, 20).map(r => '文件: ' + path.relative(absTargetDir, r.file) + '\n' + r.diff).join('\n---\n')
    if (dryRunResults.length > 20) o += '\n... (还有' + (dryRunResults.length - 20) + '个)'
    return o + '\n\n使用 /batch-han ' + absTargetDir + ' 执行实际汉化'
  }
}
