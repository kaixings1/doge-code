// Summary - summarize the current session with AI assistance
import type { Command, LocalCommandCall } from '../../types/command.js'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'

const call: LocalCommandCall = async (_args: string, context: any) => {
 const { messages } = context || {}
 if (!messages || messages.length === 0) {
 return { type: 'text' as const, value: '当前会话为空，没有内容可总结。' }
 }
 const userMsgs = messages.filter((m: any) => m.role === 'user')
 const assistantMsgs = messages.filter((m: any) => m.role === 'assistant')
 const toolCalls = messages.reduce((acc: number, m: any) => {
 if (m.tool_calls) return acc + m.tool_calls.length
 return acc
 }, 0)
 // Extract key topics
 const topics: string[] = []
 const topicKeywords = ['代码', '函数', '类', 'API', '数据库', '部署', '测试', '重构', '优化', '架构']
 for (const msg of userMsgs.slice(0, 10)) {
 const text = typeof msg.content === 'string' ? msg.content : (typeof msg.content === 'object' && msg.content !== null ? JSON.stringify(msg.content) : '')
 for (const keyword of topicKeywords) {
 if (text.includes(keyword) && !topics.includes(keyword)) {
 topics.push(keyword)
 }
 }
 }
 // Calculate token estimate
 const totalChars = messages.reduce((acc: number, m: any) => {
 const text = typeof m.content === 'string' ? m.content : ''
 return acc + text.length
 }, 0)
 const estTokens = Math.ceil(totalChars / 4)
 // Find longest exchange
 let maxUserLen = 0
 let maxAssistantLen = 0
 for (const m of messages) {
 const len = typeof m.content === 'string' ? m.content.length : 0
 if (m.role === 'user' && len > maxUserLen) maxUserLen = len
 if (m.role === 'assistant' && len > maxAssistantLen) maxAssistantLen = len
 }
 return {
 type: 'text' as const,
 value: [
 '会话摘要',
 '-'.repeat(20),
 '',
 `${ 消息总数: '${messages.length}`,
 `${ 用户消息: '${userMsgs.length}`,
 `${ 助手回复: '${assistantMsgs.length}`,
 `${ 工具调用: '${toolCalls}`,
 `${ 估算 token: '${estTokens.toLocaleString()}`,
 `${ 最长用户消息: '${maxUserLen} 字符`,
 `${ 最长助手回复: '${maxAssistantLen} 字符`,
 '',
 `${ 涉及主题: '${topics.length > 0 ? topics.join(', ') : '无}`,
 '',
 '💡 提示：使用 AI 生成更详细的会话摘要，',
 '可以运行: /compact 来压缩上下文。',
 ].join(\n),
 }
}

const summary = {
 type: 'local', name: 'summary',
 description: '总结当前会话内容和关键决策',
 isEnabled: () => !getIsNonInteractiveSession(),
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default summary
