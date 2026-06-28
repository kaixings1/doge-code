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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function getAllTsFilesWithInfo(dir: string): Array<{
  path: string
  content: string
  mtime: number
  tokenCount: number
}> {
  const results: Array<{
    path: string
    content: string
    mtime: number
    tokenCount: number
  }> = []
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
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const stat = fs.statSync(full)
          let content = fs.readFileSync(full, 'utf-8')
          if (content.length > 0 && content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1)
          }
          results.push({ path: full, content, mtime: stat.mtimeMs, tokenCount: estimateTokens(content) })
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
  'Excluded Commands': '排除的命令',
  'Filesystem': '文件系统',
  'Network': '网络',
  'Unix Sockets': 'Unix 套接字',
  'seatbelt built-in': 'seatbelt 内置',
  'Your bash commands will be sandboxed': '您的 bash 命令将在沙箱中执行',
  'Learn more': '了解更多',
  'Also requested': '也已请求',
  'Hooks Restricted by Policy': '受策略限制的钩子',
  'Binary file': '二进制文件',
  'Large file diff': '大文件差异',
  'External imports': '外部导入',
}

function localizeStrings(content: string): string {
  let result = content
  for (const [english, chinese] of Object.entries(UI_TRANSLATIONS)) {
    // 更精确的替换：只在引号中的字符串替换
    const escapedEn = english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // 双引号中的字符串
    result = result.replace(new RegExp(`"${escapedEn}"`, 'g'), `"${chinese}"`)
    // 单引号中的字符串
    result = result.replace(new RegExp(`'${escapedEn}'`, 'g'), `'${chinese}'`)
    // 模板字符串中的
    result = result.replace(new RegExp('`' + escapedEn + '`', 'g'), '`' + chinese + '`')
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

export const call: LocalCommandCall = async (args: string): Promise<LocalCommandResult> => {
  const parts = args.trim().split(/\s+/).filter(Boolean)

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

  let targetDir = DEFAULT_DIR
  let concurrency = CONCURRENCY

  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '--concurrency' || parts[i] === '-c') {
      concurrency = parseInt(parts[i + 1], 10)
      if (isNaN(concurrency) || concurrency < 1) concurrency = CONCURRENCY
      i++
    } else if (!parts[i].startsWith('-')) {
      targetDir = parts[i]
    }
  }

  const absTargetDir = path.resolve(targetDir)
  const progressFile = path.join(absTargetDir, PROGRESS_FILE)
  const logFile = path.join(absTargetDir, LOG_FILE)
  const pidFile = path.join(absTargetDir, PID_FILE)

  if (!fs.existsSync(absTargetDir)) {
    return { type: 'text', value: '错误：未找到目录：' + absTargetDir }
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
