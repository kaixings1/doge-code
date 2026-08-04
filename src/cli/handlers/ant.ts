import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'

interface AntTask {
  id: string
  subject: string
  status: 'open' | 'in_progress' | 'done' | 'closed'
  createdAt: string
  updatedAt: string
  priority?: string
  labels?: string[]
}

function tasksDir(): string {
  return join(homedir(), '.doge', 'ant-tasks')
}

function taskPath(id: string): string {
  return join(tasksDir(), `${id}.json`)
}

function ensureTasksDir(): void {
  try { mkdirSync(tasksDir(), { recursive: true }) } catch { /* ignore */ }
}

function loadTask(id: string): AntTask | null {
  const p = taskPath(id)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as AntTask
  } catch {
    return null
  }
}

function saveTask(task: AntTask): void {
  ensureTasksDir()
  writeFileSync(taskPath(task.id), JSON.stringify(task, null, 2), 'utf-8')
}

function listTasks(): AntTask[] {
  ensureTasksDir()
  const tasks: AntTask[] = []
  try {
    for (const f of readdirSync(tasksDir())) {
      if (!f.endsWith('.json')) continue
      const t = loadTask(f.replace(/\.json$/, ''))
      if (t) tasks.push(t)
    }
  } catch { /* ignore */ }
  return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** 递归搜索项目会话日志（.jsonl） */
function findLogs(): Array<{ path: string; name: string }> {
  const projectsDir = join(homedir(), '.claude', 'projects')
  const logs: Array<{ path: string; name: string }> = []
  if (!existsSync(projectsDir)) return logs
  const scan = (dir: string, depth: number) => {
    if (depth > 5) return
    try {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, item.name)
        if (item.isDirectory()) scan(p, depth + 1)
        else if (item.isFile() && item.name.endsWith('.jsonl')) {
          logs.push({ path: p, name: item.name.replace(/\.jsonl$/, '') })
        }
      }
    } catch { /* ignore */ }
  }
  scan(projectsDir, 0)
  return logs.sort((a, b) => {
    try { return statSync(b.path).mtimeMs - statSync(a.path).mtimeMs } catch { return 0 }
  })
}

/** 查看会话日志 */
export async function logHandler(logId?: string | number): Promise<void> {
  const logs = findLogs()
  if (logs.length === 0) {
    console.log('没有会话日志')
    return
  }
  // 匹配：数字（最近第 N 个）或部分 ID
  const matched = typeof logId === 'number'
    ? logs[logId - 1]
    : logs.find(l => l.name === logId || l.name.startsWith(String(logId) || ''))
  const target = matched || logs[0]
  if (!target) {
    console.log(`未找到日志: ${logId}`)
    return
  }
  console.log(`=== ${target.name} ===`)
  const content = readFileSync(target.path, 'utf-8')
  // 提取每条消息的文本内容（简化：按行显示）
  const lines = content.split('\n').filter(l => l.trim())
  console.log(`（共 ${lines.length} 条记录，最近 20 条）`)
  for (const line of lines.slice(-20)) {
    try {
      const rec = JSON.parse(line)
      const text = rec.message?.content
      if (text) {
        const str = typeof text === 'string' ? text : JSON.stringify(text).slice(0, 200)
        console.log(`- ${str}`)
      }
    } catch { /* 跳过非 JSON 行 */ }
  }
}

/** 显示错误信息 */
export async function errorHandler(number?: number): Promise<void> {
  const n = number || 1
  console.log(`错误 #${n}：`)
  console.log('（错误详情已记录到日志。使用 `claude ant log` 查看最近的会话日志。）')
}

/** 导出会话为 JSON */
export async function exportHandler(source: string, outputFile: string): Promise<void> {
  const logs = findLogs()
  const target = logs.find(l => l.name === source || l.name.startsWith(source)) || logs[0]
  if (!target) {
    console.error('没有可导出的会话日志')
    process.exitCode = 1
    return
  }
  const content = readFileSync(target.path, 'utf-8')
  const records = content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
  const outFile = outputFile || `${target.name}.json`
  writeFileSync(outFile, JSON.stringify(records, null, 2), 'utf-8')
  console.log(`已导出 ${records.length} 条记录到 ${outFile}`)
}

/** 创建任务 */
export async function taskCreateHandler(subject: string, opts: any): Promise<void> {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()
  const task: AntTask = {
    id,
    subject: subject || '(无主题)',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    priority: opts?.priority,
    labels: opts?.label ? (Array.isArray(opts.label) ? opts.label : [opts.label]) : undefined,
  }
  saveTask(task)
  console.log(`已创建任务 ${id}: ${task.subject}`)
}

/** 列出任务 */
export async function taskListHandler(opts: any): Promise<void> {
  const tasks = listTasks()
  const status = opts?.status
  const filtered = status ? tasks.filter(t => t.status === status) : tasks
  if (filtered.length === 0) {
    console.log(status ? `没有 ${status} 状态的任务` : '没有任务')
    return
  }
  console.log(`任务列表（${filtered.length}）：`)
  for (const t of filtered) {
    console.log(`  [${t.id}] ${t.status.padEnd(11)} ${t.subject}`)
  }
}

/** 获取任务详情 */
export async function taskGetHandler(id: string, opts: any): Promise<void> {
  const task = loadTask(id)
  if (!task) {
    console.error(`未找到任务: ${id}`)
    process.exitCode = 1
    return
  }
  console.log(`任务 ${task.id}:`)
  console.log(`  主题: ${task.subject}`)
  console.log(`  状态: ${task.status}`)
  console.log(`  创建: ${task.createdAt}`)
  console.log(`  更新: ${task.updatedAt}`)
  if (task.priority) console.log(`  优先级: ${task.priority}`)
  if (task.labels?.length) console.log(`  标签: ${task.labels.join(', ')}`)
}

/** 更新任务 */
export async function taskUpdateHandler(id: string, opts: any): Promise<void> {
  const task = loadTask(id)
  if (!task) {
    console.error(`未找到任务: ${id}`)
    process.exitCode = 1
    return
  }
  if (opts?.status) {
    if (!['open', 'in_progress', 'done', 'closed'].includes(opts.status)) {
      console.error(`无效状态: ${opts.status}（可选 open/in_progress/done/closed）`)
      process.exitCode = 1
      return
    }
    task.status = opts.status
  }
  if (opts?.subject) task.subject = opts.subject
  task.updatedAt = new Date().toISOString()
  saveTask(task)
  console.log(`已更新任务 ${id} → ${task.status}`)
}

/** 打开任务目录 */
export async function taskDirHandler(opts: any): Promise<void> {
  ensureTasksDir()
  console.log(tasksDir())
}

/** Shell 补全脚本 */
export async function completionHandler(shell: string, opts: any, program: any): Promise<void> {
  const commands: string[] = []
  if (program?.commands) {
    for (const cmd of program.commands) {
      commands.push(cmd.name())
    }
  }
  if (shell === 'bash') {
    console.log(`_claude_completions() {
  local cur
  cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "${commands.join(' ')}" -- "$cur") )
}
complete -F _claude_completions claude`)
  } else if (shell === 'zsh') {
    console.log(`#compdef claude
_arguments '1:command:(${commands.join(' ')})'`)
  } else {
    console.log(`支持的 shell: bash, zsh（当前: ${shell}）`)
  }
}
