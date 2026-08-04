import { existsSync, mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ServerLogger {
  info: (...args: any[]) => void
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
  debug: (...args: any[]) => void
  /** 写入原始行（不带前缀） */
  raw: (line: string) => void
}

interface LoggerConfig {
  /** 输出级别阈值（低于该级别不输出） */
  level?: LogLevel
  /** 是否输出到 stdout */
  console?: boolean
  /** 日志文件路径（可选，提供后追加写入） */
  file?: string
  /** 是否使用 ANSI 颜色（默认自动检测） */
  color?: boolean
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '\x1b[90m', // gray
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
}

function defaultLogFile(): string {
  return join(homedir(), '.doge', 'server.log')
}

function formatArgs(args: any[]): string {
  return args
    .map(a => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return a.stack || a.message
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

/**
 * 创建服务器日志器。
 * 支持时间戳前缀、级别过滤、ANSI 颜色、可选文件追加。
 */
export function createServerLogger(config?: LoggerConfig | any): ServerLogger {
  const cfg: LoggerConfig = {
    level: config?.level || 'info',
    console: config?.console !== false,
    file: config?.file || defaultLogFile(),
    color: config?.color,
  }
  const threshold = LEVEL_ORDER[cfg.level || 'info']
  const useColor = cfg.color !== undefined
    ? cfg.color
    : Boolean(process.stdout.isTTY && process.env.NO_COLOR === undefined)

  // 确保日志文件目录存在
  if (cfg.file) {
    try {
      const dir = cfg.file.substring(0, cfg.file.lastIndexOf('\\'))
      if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true })
    } catch { /* ignore */ }
  }

  const write = (level: LogLevel, args: any[]) => {
    if (LEVEL_ORDER[level] < threshold) return
    const ts = new Date().toISOString()
    const msg = formatArgs(args)
    const colorCode = useColor ? LEVEL_COLOR[level] : ''
    const reset = useColor ? '\x1b[0m' : ''
    const line = `${ts} [${level.toUpperCase()}] ${msg}`
    if (cfg.console) {
      if (level === 'error') {
        process.stderr.write(`${colorCode}${line}${reset}\n`)
      } else {
        process.stdout.write(`${colorCode}${line}${reset}\n`)
      }
    }
    if (cfg.file) {
      try { appendFileSync(cfg.file, `${line}\n`, 'utf-8') } catch { /* ignore */ }
    }
  }

  return {
    info: (...args: any[]) => write('info', args),
    error: (...args: any[]) => write('error', args),
    warn: (...args: any[]) => write('warn', args),
    debug: (...args: any[]) => write('debug', args),
    raw: (line: string) => {
      if (cfg.console) process.stdout.write(line + '\n')
      if (cfg.file) {
        try { appendFileSync(cfg.file, `${line}\n`, 'utf-8') } catch { /* ignore */ }
      }
    },
  }
}
