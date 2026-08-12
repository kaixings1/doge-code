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
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    const tasks = loadTasks()
    if (tasks.length === 0) return { type: 'text', value: 'No background tasks. Use /bg run <command> to start one.' }
    const lines = ['Background Tasks:', '==================', '']
    tasks.forEach(t => {
      const statusIcon = t.status === 'running' ? '[RUN]' : t.status === 'completed' ? '[OK]' : '[ERR]'
      lines.push(statusIcon + ' ' + t.id + ' - ' + t.command.slice(0, 50))
      lines.push('  ' + t.startTime)
      if (t.output) lines.push('  Output: ' + t.output.slice(0, 100))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'run') {
    const command = parts.slice(1).join(' ')
    if (!command) return { type: 'text', value: 'Usage: /bg run <command>' }

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

    return { type: 'text', value: '[OK] Started: ' + taskId + ' (PID: ' + child.pid + ')\nCommand: ' + command + '\nUse /bg list to check status' }
  }

  if (cmd === 'status') {
    const taskId = parts[1]
    if (!taskId) return { type: 'text', value: 'Usage: /bg status <task-id>' }
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { type: 'text', value: 'Task not found: ' + taskId }
    const lines = [
      'Task: ' + task.id,
      'Command: ' + task.command,
      'Status: ' + task.status,
      'Start: ' + task.startTime,
    ]
    if (task.endTime) lines.push('End: ' + task.endTime)
    if (task.output) lines.push('Output:\n' + task.output.slice(0, 2000))
    if (task.error) lines.push('Error:\n' + task.error.slice(0, 1000))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'kill') {
    const taskId = parts[1]
    if (!taskId) return { type: 'text', value: 'Usage: /bg kill <task-id>' }
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { type: 'text', value: 'Task not found: ' + taskId }
    task.status = 'failed'
    task.endTime = new Date().toISOString()
    task.error = 'Killed by user'
    saveTask(task)
    return { type: 'text', value: '[OK] Killed task: ' + taskId }
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
      return { type: 'text', value: '[OK] Cleared completed tasks' }
    } catch {
      return { type: 'text', value: '[ERROR] Failed to clear' }
    }
  }

  if (cmd === 'tail') {
    const taskId = parts[1]
    if (!taskId) return { type: 'text', value: 'Usage: /bg tail <task-id>' }
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { type: 'text', value: 'Task not found: ' + taskId }
    return { type: 'text', value: task.output ? task.output.slice(-2000) : 'No output yet' }
  }

  if (cmd === 'watch') {
    const taskId = parts[1]
    if (!taskId) return { type: 'text', value: 'Usage: /bg watch <task-id>' }
    const tasks = loadTasks()
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { type: 'text', value: 'Task not found: ' + taskId }
    const lines = ['Watching ' + taskId + ' (status: ' + task.status + '):', '========================', '']
    if (task.output) lines.push(task.output.slice(-1500))
    else lines.push('No output yet...')
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'logs') {
    const tasks = loadTasks()
    const lines = ['All Task Logs:', '================', '']
    tasks.filter(t => t.output).forEach(t => {
      lines.push('--- ' + t.id + ' (' + t.status + ') ---')
      lines.push(t.output!.slice(-500))
      lines.push('')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  return { type: 'text', value: [
    'Background Tasks', '', '📖 📖 Usage: ',
    '  /bg list              List all tasks', '  /bg run <command>     Run command in background',
    '  /bg status <task-id>  Show task details', '  /bg tail <task-id>    Show recent output',
    '  /bg watch <task-id>   Watch task output', '  /bg logs              Show all task logs',
    '  /bg kill <task-id>    Kill a running task', '  /bg clear             Clear completed tasks',
  ].join('\n') }
}

const background: Command = {
  type: 'local',
  name: 'background',
  description: 'Run commands in background with task management',
  aliases: ['/bg', '/background'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default background
