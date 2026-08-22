import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface BackgroundTask {
  id: string
  command: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  startTime: string
  endTime?: string
  output?: string
  error?: string
  pid?: number
  duration?: number
  exitCode?: number
}

const TASKS_DIR = join(homedir(), '.doge', 'background-tasks')

function loadTasks(): BackgroundTask[] {
  try {
    if (!existsSync(TASKS_DIR)) return []
    const files = require('fs').readdirSync(TASKS_DIR)
    return files
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => JSON.parse(readFileSync(join(TASKS_DIR, f), 'utf-8')))
      .sort((a: BackgroundTask, b: BackgroundTask) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, 20)
  } catch { return [] }
}

function saveTask(task: BackgroundTask) {
  try {
    if (!existsSync(TASKS_DIR)) mkdirSync(TASKS_DIR, { recursive: true })
    writeFileSync(join(TASKS_DIR, task.id + '.json'), JSON.stringify(task, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

export const call: LocalCommandCall = async (args) => {
  if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
    return { output: `background — 后台任务管理 - 运行/查看/终止/监控后台任务\n用法: /background`.trim(), truncated: false }
  }
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    const tasks = loadTasks()
    if (tasks.length === 0) return { type: 'text', value: 'ℹ️ 暂无后台任务。使用 /bg run <命令> 启动一个。' }
    const lines = ['📋 后台任务列表：', '═══════════════════', '']
    tasks.forEach(t => {
      const statusIcon = t.status === 'running' ? '🟢 运行中' : t.status === 'completed' ? '✅ 已完成' : '❌ 失败'
      lines.push(statusIcon + ' ' + t.id + ' - ' + t.command.slice(0, 50))
      lines.push('  ' + t.startTime)
      if (t.output) lines.push('  输出：' + t.output.slice(0, 100))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'run') {
    const command = parts.slice(1).join(' ')
    if (!command) return { type: 'text', value: '📖 用法：/bg run <命令>' }

    const taskId = 'task-' + Date.now()
    const task: BackgroundTask = {
      id: taskId,
      command,
      status: 'running',
      startTime: new Date().toISOString(),
    }
    saveTask(task)

    // Run command in background
    const child = spawn('sh', ['-c', command], {
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    let error = ''

    child.stdout?.on('data', (data) => { output += data.toString() })
    child.stderr?.on('data', (data) => { error += data.toString() })
    child.on('close', (code) => {
      task.status = code === 0 ? 'completed' : 'failed'
      task.endTime = new Date().toISOString()
      task.output = output.slice(0, 10000)
      task.error = error.slice(0, 5000)
      task.exitCode = code
      task.duration = Math.round((new Date(task.endTime).getTime() - new Date(task.startTime).getTime()) / 1000)
      saveTask(task)
    })

    child.unref()
    task.pid = child.pid
    saveTask(task)

    return { type: 'text', value: '✅ 已启动：' + taskId + ' (PID: ' + child.pid + ')\n命令：' + command + '\n使用 /bg list 查看状态' }
  }

  if (cmd === 'status') {
    const taskId = parts[1]
    if (!taskId) return { type: 'text', value: '📖 用法：/bg status <任务ID>' }
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { type: 'text', value: '❌ 任务未找到：' + taskId }
    const lines = [
      '任务：' + task.id,
      '命令：' + task.command,
      '状态：' + task.status,
      '开始：' + task.startTime,
    ]
    if (task.endTime) lines.push('结束：' + task.endTime)
    if (task.output) lines.push('输出：\n' + task.output.slice(0, 2000))
    if (task.error) lines.push('错误：\n' + task.error.slice(0, 1000))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'kill') {
    const taskId = parts[1]
    if (!taskId) return { type: 'text', value: '📖 用法：/bg kill <任务ID>' }
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { type: 'text', value: '❌ 任务未找到：' + taskId }
    task.status = 'failed'
    task.endTime = new Date().toISOString()
    task.error = 'Killed by user'
    saveTask(task)
    return { type: 'text', value: '✅ 已终止任务：' + taskId }
  }

  if (cmd === 'clear') {
    try {
      const fs = require('fs')
      if (existsSync(TASKS_DIR)) {
        const files = fs.readdirSync(TASKS_DIR)
        files.forEach((f: string) => {
          const task = JSON.parse(fs.readFileSync(join(TASKS_DIR, f), 'utf-8'))
          if (task.status !== 'running') fs.unlinkSync(join(TASKS_DIR, f))
        })
      }
      return { type: 'text', value: '✅ 已清除已完成任务' }
    } catch {
      return { type: 'text', value: '❌ 清除失败' }
    }
  }

  if (cmd === 'tail') {
    const taskId = parts[1]
    if (!taskId) return { type: 'text', value: '📖 用法：/bg tail <任务ID>' }
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { type: 'text', value: '❌ 任务未找到：' + taskId }
    return { type: 'text', value: task.output ? task.output.slice(-2000) : 'ℹ️ 暂无输出' }
  }

  if (cmd === 'watch') {
    const taskId = parts[1]
    if (!taskId) return { type: 'text', value: '📖 用法：/bg watch <任务ID>' }
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { type: 'text', value: '❌ 任务未找到：' + taskId }
    const lines = ['🔍 监控 ' + taskId + '（状态：' + task.status + '）：', '══════════════════════════════════', '']
    if (task.output) lines.push(task.output.slice(-1500))
    else lines.push('ℹ️ 暂无输出...')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'logs') {
    const tasks = loadTasks()
    const lines = ['📋 所有任务日志：', '══════════════', '']
    tasks.filter(t => t.output).forEach(t => {
      lines.push('--- ' + t.id + ' (' + t.status + ') ---')
      lines.push(t.output!.slice(-500))
      lines.push('')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: [
    '📋 后台任务', '', '📖 用法：',
    '  /bg list             列出所有任务', '  /bg run <命令>       后台运行命令',
    '  /bg status <任务ID>  查看任务详情', '  /bg tail <任务ID>    查看最近输出',
    '  /bg watch <任务ID>   监控任务输出', '  /bg logs             查看所有任务日志',
    '  /bg kill <任务ID>    终止运行中的任务', '  /bg clear            清除已完成任务',
  ].join('\n') }
}

const background: Command = {
  type: 'local',
  name: 'background',
  description: '后台任务管理 - 运行/查看/终止/监控后台任务',
  aliases: ['/bg', '/background'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default background
