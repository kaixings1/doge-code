// ============================================================================
// Loop Dashboard Command - Loop V2 Web 监控面板
// ============================================================================

import type { Command, LocalCommandCall, LocalCommandResult } from '../commands.js'
import {
  startLoopDashboardServer,
  stopLoopDashboardServer,
  getLoopDashboardPort,
  isLoopDashboardRunning,
} from '../../services/loop-dashboard/index.js'
import { openBrowser } from '../../utils/browser.js'

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args): Promise<LocalCommandResult> => {
  const s = (args ?? '').trim()

  if (s.includes('--help') || s === 'help') {
    return {
      type: 'text',
      value: [
        '# 🔄 /loop-dashboard — Loop V2 Web 监控面板',
        '',
        '## 用法',
        '  /loop-dashboard             启动监控面板',
        '  /loop-dashboard --port 8080 指定端口',
        '  /loop-dashboard --open      自动打开浏览器',
        '  /loop-dashboard stop        停止服务',
        '',
        '## 面板内容',
        '- 📊 指标总览（总循环数、成功率、Token 消耗、成本）',
        '- 📈 模式分布（各循环模式执行次数）',
        '- 🔄 活跃循环（当前运行的循环状态）',
        '- 📜 最近循环（最近 20 条历史记录）',
        '- ⚠️ 死信队列（失败任务列表）',
        '- 🖥️ 系统健康（CPU/内存/磁盘/锁状态）',
        '',
        '## 默认端口',
        '  3711',
      ].join('\n'),
    }
  }

  // 停止服务
  if (s === 'stop') {
    stopLoopDashboardServer()
    return { type: 'text', value: '✅ Loop Dashboard 已停止。' }
  }

  // 解析端口
  const portMatch = s.match(/--port\s+(\d+)/)
  const port = portMatch ? parseInt(portMatch[1]!) : 3711
  const openBrowser = s.includes('--open')

  try {
    if (isLoopDashboardRunning()) {
      const currentPort = getLoopDashboardPort()
      const url = `http://127.0.0.1:${currentPort}`
      return {
        type: 'text',
        value: `📊 Loop Dashboard 已在运行中！\n\n🌐 浏览器访问: ${url}\n\n使用 /loop-dashboard stop 停止服务。`,
      }
    }

    const actualPort = await startLoopDashboardServer(port)
    const url = `http://127.0.0.1:${actualPort}`

    if (openBrowser) {
      await openBrowser(url)
    }

    return {
      type: 'text',
      value: `📊 Loop Dashboard 已启动！\n\n🌐 浏览器访问: ${url}\n📋 API 地址: ${url}/api/loop-dashboard\n\n使用 /loop-dashboard stop 停止服务。`,
    }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 启动 Loop Dashboard 失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

const loopDashboard: Command = {
  type: 'local',
  name: 'loop-dashboard',
  description: '🔄 Loop V2 Web 监控面板 — 可视化展示循环状态、指标、死信队列',
  aliases: ['/loop-dashboard', '/loop-dash'],
  argumentHint: '[--port PORT] [--open] [stop]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default loopDashboard
