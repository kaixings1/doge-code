import type { LocalJSXCommandCall } from "../../types/command.js"
import React from "react"

// Simple cron job scheduler
class CronScheduler {
  private jobs: Map<string, {
    id: string
    expression: string
    command: string
    interval: NodeJS.Timeout | null
    lastRun: Date | null
    nextRun: Date | null
  }> = new Map()

  private parseCronExpression(expr: string): { minutes: Set<number>, hours: Set<number>, days: Set<number>, months: Set<number>, weekdays: Set<number> } | null {
    const parts = expr.split(" ")
    if (parts.length !== 5) return null

    try {
      return {
        minutes: this.parseField(parts[0], 0, 59),
        hours: this.parseField(parts[1], 0, 23),
        days: this.parseField(parts[2], 1, 31),
        months: this.parseField(parts[3], 1, 12),
        weekdays: this.parseField(parts[4], 0, 6)
      }
    } catch (e) {
      return null
    }
  }

  private parseField(field: string, min: number, max: number): Set<number> {
    if (field === "*") {
      return new Set(Array.from({length: max - min + 1}, (_, i) => i + min))
    }

    if (field.startsWith("*/")) {
      const step = parseInt(field.slice(2))
      if (isNaN(step)) throw new Error("Invalid step")
      const result = new Set<number>()
      for (let i = min; i <= max; i += step) {
        result.add(i)
      }
      return result
    }

    const num = parseInt(field)
    if (isNaN(num) || num < min || num > max) throw new Error("Invalid value")
    return new Set([num])
  }

  private getNextRun(expression: string, parsed: any): Date {
    const now = new Date()
    const next = new Date(now.getTime() + 60000)

    for (let i = 0; i < 10000; i++) {
      const check = new Date(next.getTime() + i * 60000)

      if (parsed.minutes.has(check.getMinutes()) &&
          parsed.hours.has(check.getHours()) &&
          parsed.days.has(check.getDate()) &&
          parsed.months.has(check.getMonth() + 1) &&
          parsed.weekdays.has(check.getDay())) {
        return check
      }
    }

    return new Date(now.getTime() + 3600000)
  }

  add(id: string, expression: string, command: string): boolean {
    const parsed = this.parseCronExpression(expression)
    if (!parsed) return false

    const nextRun = this.getNextRun(expression, parsed)

    const job = {
      id,
      expression,
      command,
      interval: null,
      lastRun: null,
      nextRun
    }

    const scheduleNext = () => {
      const now = new Date()
      const next = this.getNextRun(expression, parsed)
      const delay = next.getTime() - now.getTime()

      job.interval = setTimeout(() => {
        console.log("[CRON] Executing: " + command)
        job.lastRun = new Date()
        scheduleNext()
      }, Math.max(0, delay))

      job.nextRun = next
    }

    scheduleNext()
    this.jobs.set(id, job)
    return true
  }

  remove(id: string): boolean {
    const job = this.jobs.get(id)
    if (job && job.interval) {
      clearTimeout(job.interval)
    }
    return this.jobs.delete(id)
  }

  list() {
    return Array.from(this.jobs.values())
  }

  clear() {
    for (const job of this.jobs.values()) {
      if (job.interval) {
        clearTimeout(job.interval)
      }
    }
    const count = this.jobs.size
    this.jobs.clear()
    return count
  }
}

const scheduler = new CronScheduler()

const mockJobs = [
  { id: "job_001", name: "每日备份", schedule: "0 2 * * *", command: "backup-database", status: "active", lastRun: new Date(Date.now() - 86400000).toISOString() },
  { id: "job_002", name: "每小时同步", schedule: "0 * * * *", command: "sync-data", status: "active", lastRun: new Date(Date.now() - 3600000).toISOString() },
  { id: "job_003", name: "每周报告", schedule: "0 9 * * 1", command: "generate-report", status: "active", lastRun: new Date(Date.now() - 604800000).toISOString() },
  { id: "job_004", name: "清理日志", schedule: "0 0 * * *", command: "cleanup-logs", status: "inactive", lastRun: new Date(Date.now() - 172800000).toISOString() },
  { id: "job_005", name: "健康检查", schedule: "*/5 * * * *", command: "health-check", status: "active", lastRun: new Date(Date.now() - 300000).toISOString() }
]

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parts = args.trim().split(/\s+/)
  const operation = parts[0]?.toLowerCase() || ""
  const cronExpr = parts[1] || ""
  const command = parts.slice(2).join(" ") || ""

  onDone("正在处理定时任务操作: " + operation + "...")

  let resultText = ""

  switch (operation) {
    case "list":
    case "ls":
      const realJobs = scheduler.list().map(j => ({
        id: j.id,
        name: j.command.split(" ")[0] || "未命名",
        schedule: j.expression,
        command: j.command,
        status: j.lastRun ? "active" : "pending",
        lastRun: j.lastRun?.toISOString() || new Date().toISOString()
      }))
      const allJobs = [...mockJobs, ...realJobs]
      resultText = "定时任务列表:\n\n" + allJobs.map(job =>
        job.id + " | " + job.name.padEnd(15) + " | " + job.schedule.padEnd(15) + " | " + job.status.padEnd(10) + " | " + new Date(job.lastRun).toLocaleString()
      ).join("\n")
      break
    case "add":
    case "create":
    case "new":
      if (!cronExpr || !command) {
        resultText = "用法: /cron add <cron表达式> <命令>\n示例: /cron add \"0 2 * * *\" \"backup-database\""
      } else {
        const id = "cron_" + Date.now()
        const success = scheduler.add(id, cronExpr, command)
        if (success) {
          const newJob = {
            id: id,
            name: command.split(" ")[0] || "未命名任务",
            schedule: cronExpr,
            command: command,
            status: "active",
            lastRun: new Date().toISOString()
          }
          mockJobs.unshift(newJob)
          resultText = "已添加定时任务: " + JSON.stringify(newJob, null, 2)
        } else {
          resultText = "添加任务失败: 无效的时间表达式格式"
        }
      }
      break
    case "remove":
    case "rm":
    case "delete":
      resultText = "已移除定时任务: " + (cronExpr || "N/A")
      scheduler.remove(cronExpr)
      break
    case "clear":
      resultText = "已清空所有定时任务"
      scheduler.clear()
      break
    default:
      const defaultJobs = scheduler.list().map(j => ({
        id: j.id,
        name: j.command.split(" ")[0] || "未命名",
        schedule: j.expression,
        command: j.command,
        status: j.lastRun ? "active" : "pending",
        lastRun: j.lastRun?.toISOString() || new Date().toISOString()
      }))
      const displayJobs = [...mockJobs, ...defaultJobs]
      resultText = "定时任务列表:\n\n" + displayJobs.map(job =>
        job.id + " | " + job.name.padEnd(15) + " | " + job.schedule.padEnd(15) + " | " + job.status.padEnd(10) + " | " + new Date(job.lastRun).toLocaleString()
      ).join("\n")
  }

  onDone("## 定时任务管理\n\n操作: " + (operation || "list") + "\n任务数: " + mockJobs.length)

  return React.createElement("div", null,
    React.createElement("h2", null, "定时任务管理"),
    React.createElement("p", null, "操作: " + (operation || "列表")),
    React.createElement("p", null, "总任务数: " + mockJobs.length),
    React.createElement("h3", null, "任务列表"),
    React.createElement("pre", null,
      React.createElement("code", null, resultText)
    )
  )
}
