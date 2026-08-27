/**
 * traceExporter.ts — 追踪数据导出工具（吸收自 LangSmith / CrewAI trace export）
 *
 * 将 Orchestrator 和 SubAgentManager 的追踪记录导出为结构化 JSON，
 * 支持写入文件系统或通过回调传递到外部存储（数据库/APM 等）。
 */

import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { homedir } from "os"
import { join as pathJoin } from "path"

export interface OrchestratorTraceRecord {
  traceId: string
  name: string
  input: string
  output?: string
  error?: string
  metadata?: string[]
  startTime: number
  endTime: number
  duration: number
}

export interface SubAgentTraceRecord {
  traceId: string
  agentName: string
  input: string
  output?: string
  error?: string
  toolCalls: string[]
  startTime: number
  endTime: number
  duration: number
}

export interface TraceExportOptions {
  /** 导出目录（默认 ~/.doge/traces） */
  dir?: string
  /** 是否同时输出到 stdout */
  toStdout?: boolean
  /** 每批最多写入条数，避免大文件 */
  batchSize?: number
}

const DEFAULT_TRACE_DIR = join(homedir(), ".doge", "traces")

/** 将追踪记录追加写入 JSONL 文件（每行一条，吸收自 LangSmith trace export 格式） */
export function appendTraceToFile(record: OrchestratorTraceRecord | SubAgentTraceRecord, options: TraceExportOptions = {}): void {
  const dir = options.dir ?? DEFAULT_TRACE_DIR
  const date = new Date(record.startTime)
  const dateStr = date.toISOString().slice(0, 10)
  const filePath = pathJoin(dir, `traces-${dateStr}.jsonl`)

  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const line = JSON.stringify({ ...record, _exportedAt: Date.now() }) + "\n"
    writeFileSync(filePath, line, { flag: "a" })
  } catch {
    // 写入失败静默跳过
  }
}

/** 读取指定日期的追踪记录 */
export function readTracesByDate(dateStr: string, dir = DEFAULT_TRACE_DIR): Array<OrchestratorTraceRecord | SubAgentTraceRecord> {
  const filePath = pathJoin(dir, `traces-${dateStr}.jsonl`)
  if (!existsSync(filePath)) return []
  try {
    const raw = require("fs").readFileSync(filePath, "utf-8")
    return raw.split("\n").filter(l => l.trim()).map(l => JSON.parse(l))
  } catch {
    return []
  }
}

/** 列出所有可用的追踪日期 */
export function listTraceDates(dir = DEFAULT_TRACE_DIR): string[] {
  try {
    if (!existsSync(dir)) return []
    const files = readdirSync(dir)
    return files
      .filter(f => f.startsWith("traces-") && f.endsWith(".jsonl"))
      .map(f => f.slice(7, 17))
      .sort()
  } catch {
    return []
  }
}
