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

function getAllFilesWithInfo(dir: string, extensions: string[] = DEFAULT_EXTENSIONS): FileInfo[] {
  const results: FileInfo[] = []
  const absDir = path.resolve(dir)
  if (!fs.existsSync(absDir)) return results

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

function localizeStrings(content: string, extension: string): string {
  let result = content

  // TypeScript/JavaScript 文件：只处理引号内的字符串
  if (extension === '.ts' || extension === '.tsx') {
    for (const [english, chinese] of Object.entries(UI_TRANSLATIONS)) {
      const escapedEn = english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 双引号中的字符串
      result = result.replace(new RegExp(`"${escapedEn}"`, 'g'), `"${chinese}"`)
      // 单引号中的字符串
      result = result.replace(new RegExp(`'${escapedEn}'`, 'g'), `'${chinese}'`)
      // 模板字符串中的
      result = result.replace(new RegExp('`' + escapedEn + '`', 'g'), '`' + chinese + '`')
    }
  }
  // Markdown 文件：处理标题、段落和列表
  else if (extension === '.md') {
    // 1. 处理标题（# Title -> # 标题）
    for (const [english, chinese] of Object.entries(MD_TRANSLATIONS)) {
      const escapedEn = english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // 标题行：## Overview -> ## 概述
      result = result.replace(new RegExp(`^(#+)\\s*${escapedEn}\\s*$`, 'gm'), `$1 ${chinese}`)
      // 标题行：## Overview: -> ## 概述：
      result = result.replace(new RegExp(`^(#+)\\s*${escapedEn}:\\s*$`, 'gm'), `$1 ${chinese}：`)
      // 段落中的词汇
      result = result.replace(new RegExp(`\\b${escapedEn}\\b`, 'gi'), chinese)
    }

    // 2. 处理常见的英文段落模式
    const patterns = [
      // 英文句子开头：The ... -> ...
      [/\b(The|This|An?)\s+([A-Z][a-z]+)/g, '$2'],
      // 被动语态：is used to -> 用于
      [/\bis used to\b/gi, '用于'],
      [/\bis designed to\b/gi, '设计用于'],
      [/\ballows you to\b/gi, '允许你'],
      [/\bprovides a way to\b/gi, '提供一种方式'],
      // 常见连接词
      [/\bfor example\b/gi, '例如'],
      [/\bin addition\b/gi, '此外'],
      [/\bhowever\b/gi, '然而'],
      [/\btherefore\b/gi, '因此'],
      [/\bin conclusion\b/gi, '总之'],
    ]

    for (const [pattern, replacement] of patterns) {
      result = result.replace(pattern, replacement as string)
    }
  }

  return result
}

function processFile(filePath: string, logFile: string): boolean {
  try {
    let content = fs.readFileSync(filePath, 'utf-8')
    if (content.length > 0 && content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1)
    }
    const newContent = localizeStrings(content)
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

function createBatches(
  fileInfos: Array<{ path: string; content: string; mtime: number; tokenCount: number }>,
  logFile: string,
): Array<Array<{ path: string; content: string; mtime: number; tokenCount: number }>> {
  const batches: Array<Array<{ path: string; content: string; mtime: number; tokenCount: number }>> = []
  let currentBatch: typeof fileInfos = []
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
  /batch-han                   扫描 <src> 目录下的 .ts/.tsx 文件进行汉化
  /batch-han <目录路径>         扫描指定目录进行汉化
  /batch-han --status          查看当前执行状态
  /batch-han -c <并发数>       设置并发数

示例:
  /batch-han d:/doge-code/.claude/skills   汉化 skills 目录
  /batch-han .                              汉化当前目录
  /batch-han --status                       查看进度

说明:
  - 日志文件 (.batch-han-log.txt) 和进度文件 (.batch-progress.json)
    会存放在目标目录下
  - 跳过 node_modules、.git、dist、build、.doge 目录
  - 支持断点续传：处理过的文件不会重复处理`
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

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '--concurrency' || parts[i] === '-c') {
      concurrency = parseInt(parts[i + 1], 10)
      if (isNaN(concurrency) || concurrency < 1) concurrency = CONCURRENCY
      i++
    } else if (!parts[i].startsWith('-')) {
      // ❗ 兼容中文"汉化"前缀：去掉开头的中文"汉化"文字
      let cleaned = parts[i]
      // 去掉开头的中文字符前缀（如"汉化"）
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

  // 检查是否已有实例在运行
  if (isRunning(pidFile)) {
    return { type: 'text', value: '⚠️ 已有 batch-han 实例在运行（PID: ' + fs.readFileSync(pidFile, 'utf-8').trim() + '）\n使用 /batch-han --status 查看进度\n等待完成后重试，或手动删除 ' + pidFile }
  }

  // 写入 PID
  fs.writeFileSync(pidFile, String(process.pid))
  // 初始化日志文件
  fs.writeFileSync(logFile, '')

  appendLog(logFile, '🚀 batch-han 启动，PID=' + process.pid + '，目标目录=' + absTargetDir + '，并发数=' + concurrency)

  // 同步执行（异步在 bun compiled exe 中不稳定）
  try {
    await executeBatchHan(absTargetDir, progressFile, logFile, pidFile, concurrency)
    return { type: 'text', value: '✅ batch-han 完成！查看日志: type ' + logFile }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    appendLog(logFile, '❌ 执行失败: ' + msg)
    return { type: 'text', value: '❌ batch-han 失败: ' + msg + '\n查看日志: type ' + logFile }
  }
}

async function executeBatchHan(
  absTargetDir: string,
  progressFile: string,
  logFile: string,
  pidFile: string,
  concurrency: number,
): Promise<void> {
  try {
    appendLog(logFile, '正在扫描目录：' + absTargetDir)
    const allFiles = getAllTsFilesWithInfo(absTargetDir)
    if (allFiles.length === 0) {
      appendLog(logFile, '⚠️ 未找到 .ts/.tsx 文件')
      return
    }
    appendLog(logFile, '共找到 ' + allFiles.length + ' 个文件')

    const history = loadHistory(progressFile)
    const pending = allFiles.filter(f => !history[f.path] || history[f.path] !== f.mtime)
    if (pending.length === 0) {
      appendLog(logFile, '✅ 所有文件已是最新。共 ' + allFiles.length + ' 个文件')
      return
    }
    appendLog(logFile, '待处理：' + pending.length + ' 个新增/修改文件')

    // 顺序处理每个文件（更稳定）
    let processedCount = 0
    for (const file of pending) {
      processFile(file.path, logFile)
      processedCount++
      // 更新历史记录
      try {
        const stat = fs.statSync(file.path)
        history[file.path] = stat.mtimeMs
      } catch {
        // file might have been deleted
      }
      // 批量保存历史记录
      if (processedCount % 50 === 0) {
        saveHistory(history, progressFile)
      }
    }
    saveHistory(history, progressFile)

    appendLog(logFile, '🎉 全部完成！处理了 ' + processedCount + ' 个文件')
  } finally {
    // 清理 PID 文件
    try {
      fs.unlinkSync(pidFile)
    } catch {
      // ignore
    }
  }
}
