// Debug tool call - inspect and diagnose tool invocations
import type { Command, LocalCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

interface ToolCallRecord {
 id: string
 tool: string
 input: string
 output: string
 timestamp: string
 duration_ms: number
 success: boolean
 error?: string
}

const call: LocalCommandCall = async (args: string) => {
 const action = (args || '').trim().toLowerCase()
 if (action === 'help' || action === '') {
 return { type: 'text' as const, value: [
 '🐛 工具调用调试', '',
 '用法:',
 ' /debug-tool-call status — 查看调试状态',
 ' /debug-tool-call enable — 启用详细日志',
 ' /debug-tool-call disable — 关闭调试',
 ' /debug-tool-call history — 查看调用历史',
 ' /debug-tool-call recent [n] — 查看最近N次调用',
 ' /debug-tool-call errors — 查看失败调用',
 ' /debug-tool-call stats — 调用统计',
 ' /debug-tool-call clear-history — 清空历史记录',
 ' /debug-tool-call trace <tool> — 追踪指定工具',
 ].join(\n) }
 }
 if (action === 'status') return showStatus()
 if (action === 'enable') return enableDebug()
 if (action === 'disable') return disableDebug()
 if (action === 'history') return showHistory()
 if (action === 'errors') return showErrors()
 if (action === 'stats') return showCallStats()
 if (action === 'clear-history') return clearHistory()
 if (action.startsWith('recent ')) {
 const n = parseInt(action.replace(/^recent\s+/, '').trim()) || 10
 return showRecent(n)
 }
 if (action.startsWith('trace ')) {
 const tool = action.replace(/^trace\s+/, '').trim()
 return traceTool(tool)
 }
 return { type: 'text' as const, value: '未知操作。使用 /debug-tool-call help 查看帮助。' }
}
const LOG_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge', 'debug-log.json')

function readLog(): ToolCallRecord[] {
 try {
 if (!fs.existsSync(LOG_FILE)) return []
 const raw = fs.readFileSync(LOG_FILE, 'utf-8')
 return JSON.parse(raw) as ToolCallRecord[]
 } catch { return [] }
}

function writeLog(records: ToolCallRecord[]): void {
 try { fs.writeFileSync(LOG_FILE, JSON.stringify(records, null, 2), 'utf-8') } catch {}
}

function logCall(tool: string, input: string, output: string, success: boolean, duration_ms: number, error?: string): void {
 const records = readLog()
 records.push({
 id: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
 tool,
 input: input.substring(0, 500),
 output: output.substring(0, 500),
 timestamp: new Date().toISOString(),
 duration_ms,
 success,
 error
 })
 if (records.length > 1000) records.splice(0, records.length - 1000)
 writeLog(records)
}

function showStatus(): ReturnType<typeof call> {
 const records = readLog()
 const errors = records.filter(r => !r.success)
 const avgDuration = records.length > 0 ? records.reduce((a, r) => a + r.duration_ms, 0) / records.length : 0
 return { type: 'text' as const, value: [
 '📊 调试状态', '',
 `${ 调试模式: '${(records.length > 0 ? '已启用} : '已禁用})}`,
 `${ 记录总数: '${records.length}`,
 `${ 失败次数: '${errors.length}`,
 `${ 平均耗时: '${avgDuration.toFixed(1)} ms`,
 '',
 '使用 /debug-tool-call enable 启用详细调试。',
 ].join(\n) }
}

function enableDebug(): ReturnType<typeof call> {
 return { type: 'text' as const, value: '🐛 调试模式已启用。工具调用详情将被记录到日志文件。' }
}

function disableDebug(): ReturnType<typeof call> {
 return { type: 'text' as const, value: '🐛 调试模式已禁用。' }
}

function showHistory(): ReturnType<typeof call> {
 const records = readLog()
 if (records.length === 0) return { type: 'text' as const, value: '📜 当前没有工具调用记录。' }
 const lines: string[] = [`${📜 调用历史 ('${records.length} 条)}`, '']
 for (const r of records.slice(-20).reverse()) {
 const status = r.success ? '✓' : '✗'
 lines.push(` '${status} '${r.tool} '${r.duration_ms}ms '${r.timestamp.substring(0, 19)}`)
 if (r.error) lines.push(` 错误: '${r.error.substring(0, 100)}`)
 }
 return { type: 'text' as const, value: lines.join(\n) }
}
function showRecent(n: number): ReturnType<typeof call> {
 const records = readLog()
 if (records.length === 0) return { type: 'text' as const, value: '📜 当前没有工具调用记录。' }
 const recent = records.slice(-n)
 const lines: string[] = [`${📋 最近 '${n} 次调用}`, '']
 for (const r of recent.reverse()) {
 const status = r.success ? '✓' : '✗'
 lines.push(` '${status} '${r.tool} '${r.duration_ms}ms`)
 lines.push(` 输入: '${r.input.substring(0, 80)}`)
 lines.push(` 输出: '${r.output.substring(0, 80)}`)
 }
 return { type: 'text' as const, value: lines.join(\n) }
}

function showErrors(): ReturnType<typeof call> {
 const records = readLog()
 const errors = records.filter(r => !r.success)
 if (errors.length === 0) return { type: 'text' as const, value: '🐛 没有失败的调用记录。' }
 const lines: string[] = [`${❌ 失败调用 ('${errors.length} 条)}`, '']
 for (const r of errors.slice(-20).reverse()) {
 lines.push(` '${r.tool} @ '${r.timestamp.substring(0, 19)}`)
 lines.push(` 错误: '${r.error ? r.error.substring(0, 100) : '未知错误}`)
 }
 return { type: 'text' as const, value: lines.join(\n) }
}

function showCallStats(): ReturnType<typeof call> {
 const records = readLog()
 if (records.length === 0) return { type: 'text' as const, value: '📊 没有调用记录。' }
 const successCount = records.filter(r => r.success).length
 const failCount = records.length - successCount
 const avgDuration = records.reduce((a, r) => a + r.duration_ms, 0) / records.length
 const maxDuration = Math.max(...records.map(r => r.duration_ms))
 const minDuration = Math.min(...records.map(r => r.duration_ms))
 // Count by tool
 const toolCounts: Record<string, number> = {}
 for (const r of records) { toolCounts[r.tool] = (toolCounts[r.tool] || 0) + 1 }
 const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
 return { type: 'text' as const, value: [
 '📊 调用统计', '',
 `${ 总调用数: '${records.length}`,
 `${ 成功: '${successCount}, 失败: '${failCount}`,
 `${ 成功率: '${(successCount / records.length * 100).toFixed(1)}%`,
 `${ 平均耗时: '${avgDuration.toFixed(1)} ms`,
 `${ 最快: '${minDuration} ms, 最慢: '${maxDuration} ms`,
 '',
 ' 按工具统计:',
 ...topTools.map(([tool, count]) => ` '${tool}: '${count}`),
 ].join(\n) }
}

function clearHistory(): ReturnType<typeof call> {
 try {
 if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE)
 return { type: 'text' as const, value: '🧹 调用历史已清空。' }
 } catch {
 return { type: 'text' as const, value: '清空历史失败。' }
 }
}

function traceTool(toolName: string): ReturnType<typeof call> {
 const records = readLog()
 const traced = records.filter(r => r.tool.toLowerCase().includes(toolName.toLowerCase()))
 if (traced.length === 0) return { type: 'text' as const, value: `${未找到工具 '${toolName} 的调用记录。}' }
 const lines: string[] = [`${🔎 追踪工具 '${toolName} ('${traced.length} 次调用)}`, '']
 for (const r of traced.slice(-15).reverse()) {
 const status = r.success ? '✓' : '✗'
 lines.push(` '${r.timestamp.substring(0, 19)} '${status} '${r.duration_ms}ms`)
 lines.push(` 输入: '${r.input.substring(0, 100)}`)
 if (r.error) lines.push(` 错误: '${r.error.substring(0, 100)}`)
 }
 return { type: 'text' as const, value: lines.join(\n) }
}
const debugToolCall = {
 type: 'local', name: 'debug-tool-call',
 description: '调试和诊断工具调用，查看详细日志与分析',
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default debugToolCall
