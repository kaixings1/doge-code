/** * taskManager.ts — 持久化任务存储 * * 对应 OpenClaw commitments/： * 从对话中提取并持久化 AI 承诺 → 可查询/完成/删除 * * 存储位置：.doge/tasks/<sessionId>.json */ import fs from 'fs/promises'
import os from 'os'
import path from 'path' // ---- 类型 ----
export type Task = { id: string title: string description: string status: 'pending' | 'in-progress' | 'done' | 'cancelled' priority: 'low' | 'medium' | 'high' | 'urgent' tags: string[] createdAt: string // ISO-8601 updatedAt: string // ISO-8601 dueAt?: string // ISO-8601 remindedAt?: string // 上次提醒时间
} export type CreateTaskInput = { title: string description?: string priority?: Task['priority'] dueAt?: string tags?: string[]
} // ---- 存储目录 ----
const TASKS_DIR = path.join(os.homedir(), '.doge', 'tasks') function taskFile(sessionId: string): string { return path.join(TASKS_DIR, `${sessionId}.json`)
} // ---- 持久化读写 ----
async function loadTasks(sessionId: string): Promise<Task[]> { const fp = taskFile(sessionId) try { const raw = await fs.readFile(fp, 'utf-8').catch(() => '[]') return JSON.parse(raw) } catch { return [] }
} async function saveTasks(sessionId: string, tasks: Task[]): Promise<void> { await fs.mkdir(TASKS_DIR, { recursive: true }) await fs.writeFile(taskFile(sessionId), JSON.stringify(tasks, null, 2), 'utf-8')
} // ---- 操作 ----
export async function createTask( sessionId: string, input: CreateTaskInput,
): Promise<Task> { const now = new Date().toISOString() const task: Task = { id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, title: input.title.trim(), description: (input.description ?? '').trim() || '无描述', status: 'pending', priority: input.priority ?? 'medium', tags: input.tags ?? ['auto-generated'], createdAt: now, updatedAt: now, dueAt: input.dueAt, } const tasks = await loadTasks(sessionId) tasks.push(task) await saveTasks(sessionId, tasks) return task
} export async function listTasks( sessionId: string, opts?: { status?: Task['status']; priority?: Task['priority'] },
): Promise<Task[]> { let tasks = await loadTasks(sessionId) // 最新的在前 tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) if (opts?.status) tasks = tasks.filter(t => t.status === opts.status) if (opts?.priority) tasks = tasks.filter(t => t.priority === opts.priority) return tasks
} export async function updateTaskStatus( sessionId: string, id: string, status: Task['status'],
): Promise<Task | null> { const tasks = await loadTasks(sessionId) const task = tasks.find(t => t.id === id) if (!task) return null task.status = status task.updatedAt = new Date().toISOString() if (status === 'done') task.remindedAt = task.updatedAt await saveTasks(sessionId, tasks) return task
} export async function deleteTask( sessionId: string, id: string,
): Promise<boolean> { let tasks = await loadTasks(sessionId) const before = tasks.length tasks = tasks.filter(t => t.id !== id) if (tasks.length === before) return false await saveTasks(sessionId, tasks) return true
} export async function clearDoneTasks( sessionId: string,
): Promise<number> { const tasks = await loadTasks(sessionId) const done = tasks.filter(t => t.status === 'done') const kept = tasks.filter(t => t.status !== 'done') await saveTasks(sessionId, kept) return done.length
} // ---- AI 提取：从对话记忆中生成任务 ----
type MessageContent = { type: string; text?: string } export async function extractCommitmentsFromMessages( sessionId: string, messages: Array<{ content?: MessageContent[] | string }>,
): Promise<Task[]> { const created: Task[] = [] const SESSION_ID = getSessionId_(sessionId) const sessionTasks = await loadTasks(SESSION_ID) // 轻量启发式：提取 assistant 消息中的代词 + 约定 for (const msg of messages) { const text = typeof msg.content === 'string' ? msg.content : msg.content?.find((b: MessageContent) => b.type === 'text')?.text if (!text) continue const patterns = [ /(?<=[，。/n])(我会|我来|我给你|我来帮你|下一步|待会儿)([^。！？!/n]{4,40})/g, /(稍后|回头|等[一]?[会下]|计划|安排)[：:]?/s*([^。！？!/n]{3,30})/g, /(TODO|待办|需要做|要去)[：:]?/s*([^。！？!/n]{3,30})/gi, ] for (const re of patterns) { const seen = new Set(sessionTasks.map(t => t.title)) let match: RegExpExecArray | null while ((match = re.exec(text))) { const title = match[2]?.trim() ?? match[0]?.trim() ?? '' if (title.length < 3 || seen.has(title)) continue seen.add(title) created.push(await createTask(SESSION_ID, { title, description: 'AI 从对话中提取的约定', priority: 'medium', tags: ['from-dialogue'], })) } } } return created
} import { getSessionId } from '../bootstrap/state.js'
function getSessionId_(force?: string): string { return force ?? getSessionId()
}
