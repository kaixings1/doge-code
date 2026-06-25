import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
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

function runDogeAsync(prompt: string, targetDir: string, logFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dogeCmd = process.platform === 'win32' ? 'doge.cmd' : 'doge'
    const args = [
      '--print',
      '--dangerously-skip-permissions',
      '--add-dir', targetDir,
      prompt,
    ]
    const proc = spawn(dogeCmd, args, {
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      stderr += text
      appendLog(logFile, '[doge:stderr] ' + text.trimEnd())
    })
    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString()
      if (text.trim()) {
        appendLog(logFile, '[doge:stdout] ' + text.trimEnd())
      }
    })
    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error('doge exit code ' + code + ', error: ' + stderr))
      }
    })
    proc.on('error', (err: Error) => reject(err))
  })
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

  // 立即返回提示信息，后台执行
  const summaryMessage = '✅ batch-han 已启动，正在后台处理 ' + absTargetDir + ' 目录...\n'
    + '  并发数：' + concurrency + '\n'
    + '  查看实时进度：/batch-han --status\n'
    + '  查看完整日志：type ' + logFile

  // 异步执行不阻塞返回
  executeBatchHan(absTargetDir, progressFile, logFile, pidFile, concurrency)
    .catch(err => appendLog(logFile, '❌ 执行失败: ' + (err instanceof Error ? err.message : String(err))))

  return { type: 'text', value: summaryMessage }
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

    const batches = createBatches(pending, logFile)
    appendLog(logFile, '分为 ' + batches.length + ' 批（并发数：' + concurrency + '）')

    const errors: number[] = []
    const queue = [...batches.entries()]

    async function processBatch(
      batch: typeof pending,
      index: number,
    ): Promise<boolean> {
      const totalTokens = batch.reduce((sum, f) => sum + f.tokenCount, 0)
      appendLog(logFile, '▶️ 第 ' + (index + 1) + ' 批开始（' + batch.length + ' 个文件，约 ' + totalTokens + ' tokens）')

      const filePaths = batch.map(f => f.path).join('\n')
      const dogePrompt = 'Please strictly follow the task below to modify the following TypeScript files. No feedback needed, directly modify and overwrite.\n\nTasks:\n1. Localize: convert all English comments and UI strings to Simplified Chinese\n2. Syntax upgrade: use ES2024 features (?., ??, const/let etc.)\n3. Type hardening: replace implicit any with concrete types, ban any\n4. Keep logic unchanged\n\nFiles to modify:\n' + filePaths

      for (let attempt = 1; attempt <= RETRY_LIMIT + 1; attempt++) {
        try {
          await runDogeAsync(dogePrompt, absTargetDir, logFile)
          for (const file of batch) {
            try {
              const stat = fs.statSync(file.path)
              history[file.path] = stat.mtimeMs
            } catch {
              // file might have been deleted
            }
          }
          saveHistory(history, progressFile)
          appendLog(logFile, '✅ 第 ' + (index + 1) + ' 批完成')
          return true
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          appendLog(logFile, '❌ 第 ' + attempt + ' 次尝试失败：' + msg)
          if (attempt <= RETRY_LIMIT) {
            appendLog(logFile, '⏳ 等待 5 秒后重试...')
            await new Promise(r => setTimeout(r, 5000))
          } else {
            appendLog(logFile, '💀 第 ' + (index + 1) + ' 批永久失败')
            return false
          }
        }
      }
      return false
    }

    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift()
        if (!item) break
        const [index, batch] = item
        const ok = await processBatch(batch, index)
        if (!ok) errors.push(index + 1)
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    const workers = Array(concurrency).fill(null).map(() => worker())
    await Promise.all(workers)

    if (errors.length > 0) {
      appendLog(logFile, '⚠️ 完成，但 ' + errors.length + ' 批失败：' + errors.join(', '))
    } else {
      appendLog(logFile, '🎉 全部完成！')
    }
  } finally {
    // 清理 PID 文件
    try {
      fs.unlinkSync(pidFile)
    } catch {
      // ignore
    }
  }
}
