import type { LocalCommandCall } from '../../types/command.js'
import { getFeishuLongConnection } from '../../bridge/feishuBridge.js'
import { readBindings, removeBinding } from '../../services/feishu/pairing.js'

function formatBindings(): string {
  const bindings = readBindings().bindings
  if (bindings.length === 0) {
    return '  （尚未绑定任何飞书会话）'
  }
  return bindings
    .map(
      b =>
        `  · ${b.chatType === 'group' ? '群聊' : '私聊'} ${b.chatId}` +
        `（绑定于 ${b.boundAt.slice(0, 19).replace('T', ' ')}）`,
    )
    .join('\n')
}

export const call: LocalCommandCall = async (args, _context) => {
  const sub = args.trim().toLowerCase()

  // /feishu unbind <chatId>：解除绑定
  if (sub.startsWith('unbind')) {
    const chatId = args.trim().split(/\s+/)[1]
    if (!chatId) {
      return { type: 'text', value: '用法: /feishu unbind <chatId>\n\n当前绑定：\n' + formatBindings() }
    }
    const left = removeBinding(chatId)
    return {
      type: 'text',
      value: `已解除绑定 ${chatId}，剩余 ${left.length} 个。`,
    }
  }

  const conn = getFeishuLongConnection()
  if (!conn) {
    return {
      type: 'text',
      value: [
        '飞书长连接未启用。',
        '',
        '启用方式（二者都需要）：',
        '  1. 设置 FEISHU_BRIDGE=1、FEISHU_APP_ID、FEISHU_APP_SECRET',
        '  2. 设置 FEISHU_LONG_CONNECTION=1（走长连接，无需公网回调）',
        '',
        '配置写在 .claude/settings.local.json 的 env 里，模板见 tools/feishu/。',
      ].join('\n'),
    }
  }

  const code = conn.getPairingCode()
  const botOpenId = conn.getBotOpenId()
  return {
    type: 'text',
    value: [
      '📱 飞书配对',
      '',
      `配对码：${code}`,
      '在飞书里私聊机器人，发送：',
      `  /pair ${code}`,
      '',
      '配对码 15 分钟内有效，成功一次后自动失效。',
      '',
      '已绑定会话：',
      formatBindings(),
      '',
      botOpenId ? `机器人 open_id：${botOpenId}` : '机器人 open_id：尚未获知（收到首条 @ 消息后自动记录）',
      '',
      '解除绑定：/feishu unbind <chatId>',
    ].join('\n'),
  }
}
