/**
 * desktop/desktopMain.tsx — 桌面模式主入口 (P0)
 *
 * 启动流程：
 * 1. 读取 api.json 配置
 * 2. 创建 QueryEngine 实例
 * 3. 渲染四栏桌面 UI
 *
 * 后续 P1 将替换为 Bridge 架构：本地 spawn session + WebSocket 通信
 */

import * as fs from 'fs'
import * as path from 'path'
import { createRoot } from 'react-dom/client'
import { QueryEngine } from '../engine/index.js'
import { DesktopFourPane } from './desktopUI.jsx'
import type { DesktopConfig } from './types.js'

// ─── 配置加载 ───
function loadDesktopConfig(): DesktopConfig {
  const apiJsonPath = process.env.DOGE_API_JSON
    ? path.resolve(process.env.DOGE_API_JSON)
    : path.join(process.cwd(), '.doge', 'api.json')

  let config: DesktopConfig = {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o',
    workingDir: process.cwd(),
  }

  if (fs.existsSync(apiJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(apiJsonPath, 'utf-8'))
      const presetName = data.activePreset
      const preset = presetName && data.presets?.[presetName]
        ? data.presets[presetName]
        : data.presets?.default || {}

      config.provider = preset.provider || config.provider
      config.apiKey = preset.apiKey || process.env.DOGE_API_KEY || ''
      config.model = preset.model || config.model
    } catch {
      // 忽略解析错误，使用默认配置
    }
  }

  // 环境变量覆盖
  if (process.env.ANTHROPIC_BASE_URL && !process.env.ANTHROPIC_BASE_URL.startsWith('http://0.0.0.0')) {
    config.provider = process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER || config.provider
  }
  if (process.env.ANTHROPIC_MODEL) {
    config.model = process.env.ANTHROPIC_MODEL
  }

  return config
}

// ─── 引擎会话封装 ───
interface SessionState {
  engine: QueryEngine
  messages: Array<{ id: string; role: 'user' | 'assistant' | 'tool' | 'thinking'; content?: string; toolName?: string; toolInput?: string; toolOutput?: string }>
  isProcessing: boolean
}

function createSession(config: DesktopConfig): SessionState {
  const engine = new QueryEngine({
    model: config.model,
    systemPrompt: 'You are Doge Code, a helpful AI programming assistant.',
  })

  return {
    engine,
    messages: [],
    isProcessing: false,
  }
}

// ─── 消息发送（简化版，直接调用引擎）───
async function sendMessage(
  session: SessionState,
  content: string,
): Promise<void> {
  if (session.isProcessing) return
  session.isProcessing = true

  // 添加用户消息
  const userMsg = {
    id: String(Date.now()),
    role: 'user' as const,
    content,
  }
  session.messages.push(userMsg)

  try {
    // 调用引擎
    const result = await session.engine.query(content)

    // 添加助手回复
    const assistantMsg = {
      id: String(Date.now() + 1),
      role: 'assistant' as const,
      content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
    }
    session.messages.push(assistantMsg)
  } catch (error) {
    session.messages.push({
      id: String(Date.now() + 1),
      role: 'assistant' as const,
      content: `错误: ${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    session.isProcessing = false
  }
}

// ─── 桌面模式主函数 ───
export async function DesktopMain(): Promise<void> {
  const config = loadDesktopConfig()
  const session = createSession(config)

  // 添加欢迎消息
  session.messages.push({
    id: 'welcome',
    role: 'assistant',
    content: `你好！我是 Doge Code 桌面版。\n\n当前配置：\n- 提供商: ${config.provider}\n- 模型: ${config.model}\n- 工作目录: ${config.workingDir}\n\n有什么我可以帮助你的吗？`,
  })

  // 创建 DOM 容器
  const container = document.createElement('div')
  container.id = 'desktop-root'
  document.body.appendChild(container)

  // 渲染四栏 UI
  const root = createRoot(container)

  // 封装发送函数，暴露给 UI
  const send = async (content: string) => {
    await sendMessage(session, content)
    // 触发重新渲染
    root.render(
      <DesktopFourPane
        config={config}
        activeConversation="1"
        messages={session.messages}
        onSend={send}
        isProcessing={session.isProcessing}
      />
    )
  }

  root.render(
    <DesktopFourPane
      config={config}
      activeConversation="1"
      messages={session.messages}
      onSend={send}
      isProcessing={session.isProcessing}
    />
  )
}
