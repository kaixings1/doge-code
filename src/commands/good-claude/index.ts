// Good Claude - send positive feedback to improve the AI
import type { Command, LocalCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

const FEEDBACK_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge', 'feedbacks')
const FEEDBACK_FILE = path.join(FEEDBACK_DIR, 'positive-feedbacks.json')

interface FeedbackEntry {
 id: string
 content: string
 timestamp: string
 category: string
}

const call: LocalCommandCall = async (args: string) => {
 const action = (args || '').trim().toLowerCase()
 if (action === 'help' || action === '') {
 return { type: 'text' as const, value: [
 '👍 正面反馈工具', '',
 '用法:',
 ' /good-claude <内容> — 发送正面反馈',
 ' /good-claude list — 查看历史反馈',
 ' /good-claude stats — 查看统计',
 ' /good-claude categories — 查看分类',
 ' /good-claude clear — 清空记录',
 ].join(\n) }
 }
 if (action === 'list') return listFeedbacks()
 if (action === 'stats') return showStats()
 if (action === 'clear') return clearFeedbacks()
 if (action === 'categories') return showCategories()
 return submitFeedback(action)
}

function ensureFeedbackDir(): void {
 try { if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR, { recursive: true }) } catch {}
}

function loadFeedbacks(): FeedbackEntry[] {
 try {
 if (!fs.existsSync(FEEDBACK_FILE)) return []
 const raw = fs.readFileSync(FEEDBACK_FILE, 'utf-8')
 return JSON.parse(raw) as FeedbackEntry[]
 } catch { return [] }
}

function saveFeedbacks(entries: FeedbackEntry[]): void {
 try { ensureFeedbackDir(); fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(entries, null, 2), 'utf-8') } catch {}
}

function categorizeFeedback(text: string): string {
 const lower = text.toLowerCase()
 if (lower.includes('代码') || lower.includes('coding') || lower.includes('code')) return '代码生成'
 if (lower.includes('解释') || lower.includes('理解') || lower.includes('explain')) return '解释说明'
 if (lower.includes('帮助') || lower.includes('help') || lower.includes('解决问题')) return '问题解决'
 if (lower.includes('速度') || lower.includes('快') || lower.includes('fast') || lower.includes('quick')) return '响应速度'
 if (lower.includes('态度') || lower.includes('友好') || lower.includes('nice') || lower.includes('polite')) return '服务态度'
 if (lower.includes('创意') || lower.includes('创新') || lower.includes('creative')) return '创造力'
 return '综合'
}

function submitFeedback(text: string): ReturnType<typeof call> {
 if (!text || text.length === 0) {
 return { type: 'text' as const, value: '请输入反馈内容。//n用法: /good-claude <反馈内容>' }
 }
 const entries = loadFeedbacks()
 const category = categorizeFeedback(text)
 entries.push({
 id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
 content: text.substring(0, 500),
 timestamp: new Date().toISOString(),
 category
 })
 saveFeedbacks(entries)
 return { type: 'text' as const, value: [
 '✅ 感谢你的正面反馈！', '',
 `${ 反馈内容: '${text.substring(0, 100)}`,
 `${ 分类: '${category}`,
 `${ 时间: '${new Date().toLocaleString('zh-CN')}`,
 '',
 '你的反馈已被记录，将帮助我们改进 Claude 的能力。',
 '每一次正面的评价都是我们进步的动力！🚀',
 ].join(\n) }
}
function listFeedbacks(): ReturnType<typeof call> {
 const entries = loadFeedbacks()
 if (entries.length === 0) return { type: 'text' as const, value: '📭 暂无反馈记录。使用 /good-claude <内容> 发送第一条反馈。' }
 const lines: string[] = [`${👍 历史反馈 ('${entries.length} 条)}`, '']
 for (const e of entries.slice(-20).reverse()) {
 lines.push(` ['${e.timestamp.substring(0, 10)}] '${e.category}: '${e.content.substring(0, 60)}`)
 }
 return { type: 'text' as const, value: lines.join(\n) }
}

function showStats(): ReturnType<typeof call> {
 const entries = loadFeedbacks()
 if (entries.length === 0) return { type: 'text' as const, value: '📊 暂无反馈统计。' }
 const cats: Record<string, number> = {}
 for (const e of entries) { cats[e.category] = (cats[e.category] || 0) + 1 }
 const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1])
 const lines: string[] = [`${📊 反馈统计 ('${entries.length} 条)}`, '',
 `${ 总反馈数: '${entries.length}`,
 '',
 ' 按分类统计:',
 ...sorted.map(([cat, count]) => ` '${cat}: '${count}`),
 ]
 return { type: 'text' as const, value: lines.join(\n) }
}

function showCategories(): ReturnType<typeof call> {
 return { type: 'text' as const, value: [
 '📂 反馈分类', '',
 ' 代码生成 - 关于代码质量和效率的反馈',
 ' 解释说明 - 关于理解和表达的反馈',
 ' 问题解决 - 关于帮助解决问题的反馈',
 ' 响应速度 - 关于速度和效率的反馈',
 ' 服务态度 - 关于友好和专业的反馈',
 ' 创造力 - 关于创新和创意的反馈',
 ' 综合 - 其他类型的正面反馈',
 ].join(\n) }
}

function clearFeedbacks(): ReturnType<typeof call> {
 try {
 if (fs.existsSync(FEEDBACK_FILE)) fs.unlinkSync(FEEDBACK_FILE)
 return { type: 'text' as const, value: '🧹 反馈记录已清空。' }
 } catch {
 return { type: 'text' as const, value: '清空反馈记录失败。' }
 }
}

const goodClaude = {
 type: 'local', name: 'good-claude',
 description: '给 Claude 发送正面反馈，帮助改进 AI 能力',
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default goodClaude