// Share - export current session as a self-contained HTML page (Artifacts local
// stub, aligning with official W25 "real-time shareable page"). The official
// feature relies on the claude.ai cloud backend for live sharing; this local
// stub produces an offline, standalone HTML snapshot that can be opened in any
// browser and re-shared manually.
import type { Command } from '../../commands.js'
import type { Message } from '../../types/message.js'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'

// Extract a readable text line from a message's content payload.
function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (b && typeof b === 'object' && 'type' in b) {
          const blk = b as { type: string; text?: string; input?: unknown; content?: unknown }
          if (blk.type === 'text') return blk.text ?? ''
          if (blk.type === 'tool_use') return `[工具调用: ${(blk.input as object) ? JSON.stringify(blk.input) : ''}]`
          if (blk.type === 'tool_result') return `[工具结果: ${contentToText(blk.content)}]`
          if (blk.type === 'thinking') return blk.text ?? ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function roleLabel(type: string): string {
  switch (type) {
    case 'user':
      return '你'
    case 'assistant':
      return 'Claude'
    case 'system':
      return '系统'
    default:
      return type
  }
}

// Build a standalone HTML document from the session messages.
function buildHtml(messages: Message[]): string {
  const rows = messages
    .filter((m) => !m.isMeta && !m.isVirtual && (m.type === 'user' || m.type === 'assistant' || m.type === 'system'))
    .map((m) => {
      const text = contentToText((m as { message?: { content?: unknown } }).message?.content)
      if (!text.trim()) return ''
      const role = roleLabel(m.type ?? 'unknown')
      const safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return `      <div class="msg"><div class="role">${role}</div><div class="body">${safe.replace(/\n/g, '<br/>')}</div></div>`
    })
    .filter(Boolean)
    .join('\n')

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>doge-code 会话快照</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 1.25rem; }
  .msg { border: 1px solid #e3e3e3; border-radius: 8px; padding: .75rem 1rem; margin: .75rem 0; background: #fff; }
  .role { font-weight: 600; font-size: .8rem; color: #6b7280; margin-bottom: .35rem; }
  .body { white-space: pre-wrap; line-height: 1.5; }
</style>
</head>
<body>
  <h1>doge-code 会话快照</h1>
  <p style="color:#6b7280;font-size:.85rem">本地离线导出（Artifacts 本地桩）。在浏览器打开后可手动分享。生成时间：${new Date().toLocaleString()}</p>
${rows}
</body>
</html>
`
}

const call = async (args: string, context?: { setMessages: (updater: (prev: Message[]) => Message[]) => void }) => {
  const action = args.trim().toLowerCase()

  if (action === 'help') {
    return {
      type: 'text' as const,
      value: [
        '🔗 分享会话（Artifacts 本地桩，对齐官方 W25）',
        '',
        '📖 用法:',
        ' /share — 把当前会话导出为自包含 HTML 静态页（写入 ~/doge-share-<时间戳>.html）',
        ' /share help — 显示本帮助',
        ' /share link — 生成分享链接（需 claude.ai 云端，本地桩仅提示）',
        ' /share team — 分享到团队频道（需云端，本地桩仅提示）',
        ' /share clipboard — 复制到剪贴板（本地桩）',
        '',
        '说明：官方 Artifacts 实时分享页依赖 claude.ai 云端后端；本 fork 的本地桩',
        '把会话导出为独立 HTML 文件，可在任意浏览器打开并手动分享（离线等价物）。',
      ].join('\n'),
    }
  }

  if (action === 'link' || action === 'clipboard' || action === 'cl') {
    return {
      type: 'text' as const,
      value: [
        '📋 分享链接/剪贴板',
        '',
        '官方 Artifacts 实时分享页依赖 claude.ai 云端账号与后端，本地 fork 无法独立生成',
        '在线分享链接。本地等价方案：运行 /share 导出 HTML 文件后，自行通过任意文件',
        '分享服务或内部网盘分发。',
      ].join('\n'),
    }
  }

  if (action === 'team') {
    return {
      type: 'text' as const,
      value: [
        '👥 分享到团队',
        '',
        '团队频道分享依赖云端集成（Slack/Discord 等），本地 fork 未接入。',
        '请用 /share 导出 HTML 后通过团队频道手动发送。',
      ].join('\n'),
    }
  }

  // 默认动作：导出当前会话为自包含 HTML 文件。
  if (!context?.setMessages) {
    return { type: 'text' as const, value: '⚠ 当前上下文不支持读取会话消息，无法导出。' }
  }
  let captured: Message[] = []
  context.setMessages((prev) => {
    captured = prev
    return prev
  })
  if (captured.length === 0) {
    return { type: 'text' as const, value: '⚠ 当前会话没有可导出的消息。' }
  }
  const html = buildHtml(captured)
  const stamped = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = join(homedir(), `doge-share-${stamped}.html`)
  writeFileSync(outPath, html, 'utf8')
  return {
    type: 'text' as const,
    value: [
      `✅ 已导出 ${captured.length} 条消息到：`,
      `   ${outPath}`,
      '',
      '在浏览器打开即可查看（可手动分享/托管，作为官方 Artifacts 实时页的离线等价）。',
    ].join('\n'),
  }
}

const share = {
  type: 'local',
  name: 'share',
  description: '把当前会话导出为自包含 HTML 静态页（Artifacts 本地桩，对齐官方 W25 实时分享页的离线等价）',
  isEnabled: () => !getIsNonInteractiveSession(),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default share
