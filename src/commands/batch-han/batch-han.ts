import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

const DEFAULT_DIR = 'src'
const PROGRESS_FILE = '.batch-progress.json'
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

function runDogeAsync(prompt: string, targetDir: string): Promise<void> {
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
      stderr += data.toString()
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
      console.warn('Warning: file too large (' + info.tokenCount + ' tokens): ' + path.basename(info.path) + ', processing solo')
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

export const call: LocalCommandCall = async (args: string): Promise<LocalCommandResult> => {
  const parts = args.trim().split(/\s+/).filter(Boolean)
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

  if (!fs.existsSync(absTargetDir)) {
    return { type: 'text', value: 'Error: directory not found: ' + absTargetDir }
  }

  const outputLines: string[] = []
  outputLines.push('Scanning directory: ' + absTargetDir)

  const allFiles = getAllTsFilesWithInfo(absTargetDir)
  if (allFiles.length === 0) {
    return { type: 'text', value: 'No .ts/.tsx files found in ' + absTargetDir }
  }
  outputLines.push('Found ' + allFiles.length + ' files total')

  const history = loadHistory(progressFile)
  const pending = allFiles.filter(f => !history[f.path] || history[f.path] !== f.mtime)
  if (pending.length === 0) {
    return { type: 'text', value: 'All files are up to date. Total: ' + allFiles.length }
  }
  outputLines.push('Pending: ' + pending.length + ' new/modified files')

  const batches = createBatches(pending)
  outputLines.push('Split into ' + batches.length + ' batches (concurrency: ' + concurrency + ')')

  const errors: number[] = []
  const queue = [...batches.entries()]

  async function processBatch(
    batch: typeof pending,
    index: number,
  ): Promise<boolean> {
    const totalTokens = batch.reduce((sum, f) => sum + f.tokenCount, 0)
    outputLines.push('Batch ' + (index + 1) + ' (' + batch.length + ' files, ~' + totalTokens + ' tokens)')

    const filePaths = batch.map(f => f.path).join('\n')
    const dogePrompt = 'Please strictly follow the task below to modify the following TypeScript files. No feedback needed, directly modify and overwrite.\n\nTasks:\n1. Localize: convert all English comments and UI strings to Simplified Chinese\n2. Syntax upgrade: use ES2024 features (?., ??, const/let etc.)\n3. Type hardening: replace implicit any with concrete types, ban any\n4. Keep logic unchanged\n\nFiles to modify:\n' + filePaths

    for (let attempt = 1; attempt <= RETRY_LIMIT + 1; attempt++) {
      try {
        await runDogeAsync(dogePrompt, absTargetDir)
        for (const file of batch) {
          try {
            const stat = fs.statSync(file.path)
            history[file.path] = stat.mtimeMs
          } catch {
            // file might have been deleted
          }
        }
        saveHistory(history, progressFile)
        outputLines.push('Batch ' + (index + 1) + ' done')
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        outputLines.push('  Attempt ' + attempt + ' failed: ' + msg)
        if (attempt <= RETRY_LIMIT) {
          outputLines.push('  Waiting 5s before retry...')
          await new Promise(r => setTimeout(r, 5000))
        } else {
          outputLines.push('  Batch ' + (index + 1) + ' failed permanently')
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
    outputLines.push('Warning: ' + errors.length + ' batches failed: ' + errors.join(', '))
  } else {
    outputLines.push('All done!')
  }

  return { type: 'text', value: outputLines.join('\n') }
}
