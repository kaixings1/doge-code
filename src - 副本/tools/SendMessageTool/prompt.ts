import { feature } from 'bun:bundle'

export const DESCRIPTION = '向另一个代理发送消息'

export function getPrompt(): string {
  const udsRow = feature('UDS_INBOX')
    ? `\n| \`"uds:/path/to.sock"\` | 本地 Claude 会话的 socket（同一机器；使用 \`ListPeers\`） |
| \`"bridge:session_..."\` | Remote Control 对等会话（跨机器；使用 \`ListPeers\`） |`
    : ''
  const udsSection = feature('UDS_INBOX')
    ? `\n\n## 跨会话

使用 \`ListPeers\` 发现目标，然后：

\`\`\`json
{"to": "uds:/tmp/cc-socks/1234.sock", "message": "检查那边的测试是否通过"}
{"to": "bridge:session_01AbCd...", "message": "你在哪个分支上？"}
\`\`\`

列出的对等节点是活跃的，将处理你的消息——没有"忙碌"状态；消息在接收方的下一轮工具处理时排队并排出。你的消息将作为 \`<cross-session-message from="...">\` 包装到达。**要回复来自队友的消息，请将其 \`from\` 属性复制为你的 \`to\`。**`
    : ''
  return `
# SendMessage

向另一个代理发送消息。

\`\`\`json
{"to": "researcher", "summary": "分配任务 1", "message": "开始任务 #1"}
\`\`\`

| \`to\` | |
|---|---|
| \`"researcher"\` | 按名称查找队友 |
| \`"*"\` | 向所有队友广播——开销大（与团队规模成线性），仅在确实需要时使用 |${udsRow}

你的纯文本输出对其他代理不可见——要通信，你必须调用此工具。来自队友的消息会自动交付；你不需要检查收件箱。按名称引用队友，不要使用 UUID。转发时，不要引用原始内容——它已经呈现给用户了。${udsSection}

## 协议响应（遗留）

如果你收到带有 \`type: "shutdown_request"\` 或 \`type: "plan_approval_request"\` 的 JSON 消息，请使用匹配的 \`_response\` 类型响应——回显 \`request_id\`，设置 \`approve\` 为 true/false：

\`\`\`json
{"to": "team-lead", "message": {"type": "shutdown_response", "request_id": "...", "approve": true}}
{"to": "researcher", "message": {"type": "plan_approval_response", "request_id": "...", "approve": false, "feedback": "添加错误处理"}}
\`\`\`

批准关闭会终止你的进程。拒绝计划会让队友回去修改。除非被要求，否则不要发起 \`shutdown_request\`。不要发送结构化 JSON 状态消息——使用 TaskUpdate。
`.trim()
}
