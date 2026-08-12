/**
 * install-feishu-app.tsx — 飞书应用安装向导
 *
 * 引导用户完成飞书自建应用的创建和配置。
 * 使用 readline 实现 CLI 交互。
 */

import type { LocalCommandResult } from '../../commands.js'

export interface FeishuConfig {
  appId: string
  appSecret: string
  webhookUrl: string
  webhookPort: number
}

export async function call(): Promise<LocalCommandResult> {
  const readline = await import('node:readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const ask = (prompt: string): Promise<string> =>
    new Promise(resolve => rl.question(prompt, resolve))

  try {
    console.log('')
    console.log('🚀 飞书远程控制安装向导')
    console.log('')
    console.log('此向导将帮助你配置飞书应用，以便通过手机飞书 App 远程控制 Claude Code。')
    console.log('')
    console.log('你需要：')
    console.log('  1. 飞书企业管理员权限（或可创建自建应用）')
    console.log('  2. 一个公网可访问的地址（用于 Webhook 回调）')
    console.log('')
    await ask('按 Enter 继续...')

    console.log('')
    console.log('📱 步骤 1/3: 输入飞书 App ID')
    console.log('')
    console.log('请在飞书开放平台找到你的应用，输入 App ID（cli_ 开头）：')
    console.log('👉 飞书开放平台: https://open.feishu.cn/app')
    console.log('')
    const appId = await ask('App ID: ')
    if (!appId.trim()) {
      return { type: 'text', value: '❌ App ID 不能为空，安装已取消' }
    }

    console.log('')
    console.log('🔑 步骤 2/3: 输入飞书 App Secret')
    const appSecret = await ask('App Secret: ')
    if (!appSecret.trim()) {
      return { type: 'text', value: '❌ App Secret 不能为空，安装已取消' }
    }

    console.log('')
    console.log('🌐 步骤 3/3: Webhook 配置')
    console.log('')
    console.log('Webhook 监听端口（默认 9901）：')
    console.log('')
    console.log('注意：你需要将 Webhook URL 配置到飞书开放平台的事件订阅中。')
    console.log('如果本机没有公网 IP，可以使用 ngrok 等内网穿透工具。')
    console.log('')
    const portInput = await ask('端口 [9901]: ')
    const webhookPort = parseInt(portInput) || 9901

    console.log('')
    console.log('✅ 配置完成！')
    console.log('')
    console.log(`  App ID: ${appId.slice(0, 8)}...`)
    console.log(`  Webhook: http://localhost:${webhookPort}/feishu/webhook`)
    console.log('')
    console.log('下一步：')
    console.log('  1. 在飞书开放平台配置事件订阅 URL')
    console.log('  2. 发布应用版本')
    console.log('  3. 在飞书 App 中搜索你的机器人并发消息')
    console.log('')
    console.log('💡 启动方式：')
    console.log(`  FEISHU_BRIDGE=1 FEISHU_APP_ID="${appId.trim()}" FEISHU_APP_SECRET="${appSecret.trim()}" claude`)
    console.log('')

    return {
      type: 'text',
      value: `✅ 飞书应用配置完成。设置环境变量后重启 Claude Code 即可启用。`,
    }
  } finally {
    rl.close()
  }
}
