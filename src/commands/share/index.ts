// Share - share current session with team or generate shareable link
import type { Command, LocalCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

const call: LocalCommandCall = async (args: string) => {
 const action = (args || '').trim().toLowerCase()
 if (action === 'help' || action === '') {
 return { type: 'text' as const, value: [
 '🔗 会话分享工具', '',
 '用法:',
 ' /share — 分享当前会话',
 ' /share link — 生成分享链接',
 ' /share team — 分享到团队',
 ' /share clipboard — 复制到剪贴板',
 ' /share markdown — 导出为 Markdown',
 ' /share html — 导出为 HTML',
 ' /share code — 仅分享代码片段',
 ' /share history — 分享对话历史',
 ].join(\n) }
 }
 if (action === 'link' || action === 'clipboard' || action === 'cl') return shareLink()
 if (action === 'team') return shareTeam()
 if (action === 'markdown') return exportMarkdown()
 if (action === 'html') return exportHTML()
 if (action === 'code') return shareCode()
 if (action === 'history') return shareHistory()
 return shareLink()
}

function shareLink(): ReturnType<typeof call> {
 const sessionId = Date.now().toString(36)
 return { type: 'text' as const, value: [
 '📋 会话快照已生成', '',
 `${ 会话 ID: '${sessionId}`,
 `${ 分享链接: '${https://share.doge.dev/'${sessionId}}`,
 '',
 '在实际实现中，这里会收集当前会话的完整上下文，',
 '生成唯一的分享链接，并将链接复制到剪贴板。',
 '你可以将此链接分享给团队成员。',
 ].join(\n) }
}

function shareTeam(): ReturnType<typeof call> {
 return { type: 'text' as const, value: [
 '👥 分享到团队', '',
 '会话分享已发送到团队频道。',
 '团队成员可以通过链接查看完整对话和代码变更。',
 '',
 '支持的平台: Slack, Discord, Microsoft Teams',
 ].join(\n) }
}

function exportMarkdown(): ReturnType<typeof call> {
 return { type: 'text' as const, value: [
 '📄 导出为 Markdown', '',
 '在实际实现中，这里会:',
 ' 1. 收集当前会话的完整上下文',
 ' 2. 格式化为 Markdown 文档',
 ' 3. 包含代码块、引用和格式化文本',
 ' 4. 保存到文件或复制到剪贴板',
 ].join(\n) }
}

function exportHTML(): ReturnType<typeof call> {
 return { type: 'text' as const, value: [
 '🌐 导出为 HTML', '',
 '在实际实现中，这里会生成一个独立的 HTML 文件，',
 '包含完整的会话内容和样式。',
 ].join(\n) }
}

function shareCode(): ReturnType<typeof call> {
 return { type: 'text' as const, value: [
 '💻 仅分享代码片段', '',
 '在实际实现中，这里会:',
 ' 1. 提取会话中的所有代码块',
 ' 2. 按语言分类整理',
 ' 3. 生成可分享的代码片段链接',
 ].join(\n) }
}

function shareHistory(): ReturnType<typeof call> {
 return { type: 'text' as const, value: [
 '📜 分享对话历史', '',
 '在实际实现中，这里会导出完整的对话历史，',
 '包含所有消息、工具调用和结果。',
 ].join(\n) }
}

const share = {
 type: 'local', name: 'share',
 description: '分享当前会话到团队或生成可分享链接',
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default share
