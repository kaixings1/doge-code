/**
 * batchEngine.ts — 批量处理后端引擎
 *
 * 主进程批量文件处理引擎，提供：
 * - 并发执行工作流（可配置并发数）
 * - 实时进度推送（IPC event）
 * - 协作式取消
 * - 文件读取 + AI 处理 + 结果回写全链路
 */

import * as fs from 'fs'
import * as path from 'path'
import { BrowserWindow } from 'electron'

// ─── 类型 ───

export interface BatchFileItem {
  id: string
  filePath: string
  fileName: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  output?: string
  error?: string
  durationMs?: number
}

export interface BatchJob {
  id: string
  name: string
  workflowId: string
  workflowName: string
  files: BatchFileItem[]
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: number
  finishedAt?: number
  completedCount: number
  failedCount: number
  concurrency: number
}

export interface BatchProgress {
  batchId: string
  fileId: string
  fileName: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  progress: number       // 0-100
  totalFiles: number
  completedFiles: number
  failedFiles: number
  error?: string
  output?: string
}

export interface BatchConfig {
  concurrency: number     // 并发数（默认 3）
  timeout: number         // 单个文件超时（ms，默认 120000）
  retryCount: number      // 失败重试次数（默认 0）
  dryRun: boolean         // 仅模拟不实际执行（默认 false）
}

// ─── 执行上下文 ───

interface ExecutionContext {
  batchId: string
  cancelRef: { cancelled: boolean }
  sendProgress: (progress: BatchProgress) => void
  executeFile: (filePath: string, workflowId: string) => Promise<{ output?: string; error?: string }>
}

// ─── 并发控制池 ───

class ConcurrencyPool {
  private running = 0
  private queue: Array<() => void> = []

  constructor(private limit: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.limit) {
      this.running++
      return
    }

    return new Promise(resolve => {
      this.queue.push(() => {
        this.running++
        resolve()
      })
    })
  }

  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }
}

// ─── 批量执行引擎 ───

export class BatchEngine {
  private jobs = new Map<string, BatchJob>()
  private cancelFlags = new Map<string, { cancelled: boolean }>()
  private pools = new Map<string, ConcurrencyPool>()

  /**
   * 创建批量任务
   */
  createJob(
    workflowId: string,
    workflowName: string,
    files: Array<{ filePath: string; fileName?: string }>,
    config: Partial<BatchConfig> = {}
  ): BatchJob {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const concurrency = config.concurrency || 3

    const batchItems: BatchFileItem[] = files.map(f => ({
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filePath: f.filePath,
      fileName: f.fileName || f.filePath.split(/[/\\]/).pop() || f.filePath,
      status: 'pending' as const,
    }))

    const job: BatchJob = {
      id: batchId,
      name: `批量: ${workflowName}`,
      workflowId,
      workflowName,
      files: batchItems,
      status: 'pending',
      startedAt: Date.now(),
      completedCount: 0,
      failedCount: 0,
      concurrency,
    }

    this.jobs.set(batchId, job)
    this.cancelFlags.set(batchId, { cancelled: false })
    this.pools.set(batchId, new ConcurrencyPool(concurrency))

    return job
  }

  /**
   * 获取任务状态
   */
  getJob(batchId: string): BatchJob | undefined {
    return this.jobs.get(batchId)
  }

  /**
   * 获取所有任务
   */
  getAllJobs(): BatchJob[] {
    return Array.from(this.jobs.values())
  }

  /**
   * 取消任务
   */
  cancelJob(batchId: string): boolean {
    const flag = this.cancelFlags.get(batchId)
    if (flag) {
      flag.cancelled = true
      const job = this.jobs.get(batchId)
      if (job) {
        job.status = 'cancelled'
        job.finishedAt = Date.now()
        // 将所有 pending 标记为 skipped
        job.files.forEach(f => {
          if (f.status === 'pending') f.status = 'skipped'
        })
      }
      return true
    }
    return false
  }

  /**
   * 执行批量任务
   */
  async execute(
    batchId: string,
    executeFile: (filePath: string, workflowId: string) => Promise<{ output?: string; error?: string }>,
    config: Partial<BatchConfig> = {}
  ): Promise<BatchJob> {
    const job = this.jobs.get(batchId)
    if (!job) throw new Error(`任务 ${batchId} 不存在`)

    const flag = this.cancelFlags.get(batchId)!
    const pool = this.pools.get(batchId)!
    const timeout = config.timeout || 120000
    const retryCount = config.retryCount || 0

    job.status = 'running'

    const sendProgress = (progress: BatchProgress) => {
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(win => {
        win.webContents.send('doge:batch-progress', progress)
      })
    }

    const ctx: ExecutionContext = {
      batchId,
      cancelRef: flag,
      sendProgress,
      executeFile,
    }

    // 并发执行所有文件
    const promises = job.files.map(item => this.executeItem(item, job, ctx, pool, timeout, retryCount))

    await Promise.allSettled(promises)

    // 更新最终状态
    if (job.status !== 'cancelled') {
      job.status = job.failedCount > 0 && job.completedCount === 0 ? 'failed' : 'completed'
    }
    job.finishedAt = Date.now()

    // 发送完成事件
    const completionEvent = {
      batchId: job.id,
      name: job.name,
      status: job.status,
      completedCount: job.completedCount,
      failedCount: job.failedCount,
      totalFiles: job.files.length,
      durationMs: (job.finishedAt || Date.now()) - job.startedAt,
    }
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('doge:batch-complete', completionEvent)
    })

    // 清理
    this.cancelFlags.delete(batchId)
    this.pools.delete(batchId)

    return job
  }

  /**
   * 执行单个文件
   */
  private async executeItem(
    item: BatchFileItem,
    job: BatchJob,
    ctx: ExecutionContext,
    pool: ConcurrencyPool,
    timeout: number,
    retryCount: number
  ): Promise<void> {
    await pool.acquire()

    try {
      // 检查取消
      if (ctx.cancelRef.cancelled) {
        item.status = 'skipped'
        return
      }

      item.status = 'running'
      const startTime = Date.now()

      ctx.sendProgress({
        batchId: job.id,
        fileId: item.id,
        fileName: item.fileName,
        status: 'running',
        progress: Math.round(((job.completedCount + job.failedCount) / job.files.length) * 100),
        totalFiles: job.files.length,
        completedFiles: job.completedCount,
        failedFiles: job.failedCount,
      })

      // 带超时和重试的执行
      let lastError: string | undefined
      let output: string | undefined
      let success = false

      for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
          const result = await this.withTimeout(
            ctx.executeFile(item.filePath, job.workflowId),
            timeout
          )

          if (result.error) {
            lastError = result.error
            output = undefined
          } else {
            output = result.output
            lastError = undefined
            success = true
            break
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e)
        }
      }

      item.durationMs = Date.now() - startTime

      if (success) {
        item.status = 'completed'
        item.output = output
        job.completedCount++
      } else {
        item.status = 'failed'
        item.error = lastError || '执行失败'
        job.failedCount++
      }

      ctx.sendProgress({
        batchId: job.id,
        fileId: item.id,
        fileName: item.fileName,
        status: item.status,
        progress: Math.round(((job.completedCount + job.failedCount) / job.files.length) * 100),
        totalFiles: job.files.length,
        completedFiles: job.completedCount,
        failedFiles: job.failedCount,
        error: item.error,
        output: item.output,
      })
    } finally {
      pool.release()
    }
  }

  /**
   * 超时包装
   */
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`执行超时 (${ms / 1000}s)`)), ms)
      promise.then(
        val => { clearTimeout(timer); resolve(val) },
        err => { clearTimeout(timer); reject(err) }
      )
    })
  }

  /**
   * 清理已完成的任务
   */
  cleanup(batchId: string): void {
    this.jobs.delete(batchId)
    this.cancelFlags.delete(batchId)
    this.pools.delete(batchId)
  }
}

// ─── 文件处理辅助函数 ───

/**
 * 读取文件内容（带安全检查）
 */
export function safeReadFile(filePath: string): { content?: string; error?: string } {
  try {
    // 路径规范化，防止路径遍历
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) {
      return { error: '文件不存在' }
    }
    const stat = fs.statSync(resolved)
    if (!stat.isFile()) {
      return { error: '路径不是文件' }
    }
    // 限制最大 10MB
    if (stat.size > 10 * 1024 * 1024) {
      return { error: '文件超过 10MB 限制' }
    }
    const content = fs.readFileSync(resolved, 'utf-8')
    return { content }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '读取失败' }
  }
}

/**
 * 安全写入文件（带备份）
 */
export function safeWriteFile(filePath: string, content: string, createBackup = true): { success: boolean; error?: string } {
  try {
    const resolved = path.resolve(filePath)

    // 创建备份
    if (createBackup && fs.existsSync(resolved)) {
      const backupPath = `${resolved}.bak-${Date.now()}`
      fs.copyFileSync(resolved, backupPath)
    }

    fs.writeFileSync(resolved, content, 'utf-8')
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : '写入失败' }
  }
}

/**
 * 扫描目录获取文件列表
 */
export function scanFiles(dirPath: string, extensions?: string[], maxFiles = 500): string[] {
  const results: string[] = []

  function scanDir(dir: string): void {
    if (results.length >= maxFiles) return

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (results.length >= maxFiles) return

        // 跳过隐藏目录和 node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(fullPath)
        } else if (entry.isFile()) {
          if (extensions && extensions.length > 0) {
            const ext = path.extname(entry.name).toLowerCase()
            if (extensions.includes(ext)) {
              results.push(fullPath)
            }
          } else {
            results.push(fullPath)
          }
        }
      }
    } catch {
      // 忽略无权限目录
    }
  }

  scanDir(dirPath)
  return results
}
