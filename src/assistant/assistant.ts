// 自动生成的存根 — 替换为真实实现
import type React from 'react';
import type { Command } from '../commands.js'
import { getAssistantSystemPromptAddendum } from './index.js'

/**
 * 助手模式命令
 * 
 * 允许用户与助手模式进行交互，包括：
 * - 查看助手模式状态
 * - 切换助手模式
 * - 获取助手相关的帮助信息
 */
const call: Command['call'] = async (args, context) => {
  const arg = args.trim().toLowerCase()

  if (!arg) {
    // 显示当前状态
    const isEnabled = context.getAppState().kairosEnabled
    const isForced = (await import('./index.js')).isAssistantForced()
    
    return {
      type: 'text',
      value: `助手模式: ${isEnabled ? '已启用' : '未启用'}${
        isForced ? ' (强制)' : ''
      }\n\n使用 /assistant help 查看更多信息`
    }
  }

  if (arg === 'help' || arg === 'h') {
    return {
      type: 'text',
      value: `助手模式命令:\n\n` +
        `/assistant - 查看当前状态\n` +
        `/assistant help - 显示此帮助信息\n` +
        `/assistant on - 启用助手模式（如果可用）\n` +
        `/assistant off - 禁用助手模式\n` +
        `/assistant status - 显示详细状态信息\n\n` +
        `助手模式提供更智能的代码分析和工具使用建议。`
    }
  }

  if (arg === 'status' || arg === 'info') {
    const isEnabled = context.getAppState().kairosEnabled
    const isForced = (await import('./index.js')).isAssistantForced()
    const promptAddendum = getAssistantSystemPromptAddendum()
    
    return {
      type: 'text',
      value: `助手模式状态:\n\n` +
        `启用状态: ${isEnabled ? '✅ 已启用' : '❌ 未启用'}\n` +
        `强制模式: ${isForced ? '✅ 是' : '否'}\n` +
        `系统提示: ${promptAddendum ? '✅ 已配置' : '❌ 未配置'}\n\n` +
        `GrowthBook 门控 (tengu_kairos): ${isEnabled ? '✅ 通过' : '❌ 未通过'}\n` +
        `信任状态: ${isEnabled ? '✅ 已接受' : '❌ 未接受'}`
    }
  }

  if (arg === 'on' || arg === 'enable') {
    // 注意：助手模式的启用通常需要 GrowthBook 门控和信任检查
    // 这里只能显示信息，不能强制启用
    const isEnabled = context.getAppState().kairosEnabled
    
    if (isEnabled) {
      return {
        type: 'text',
        value: '助手模式已经启用。'
      }
    }
    
    return {
      type: 'text',
      value: `无法启用助手模式。\n\n` +
        `助手模式需要满足以下条件:\n` +
        `1. GrowthBook 门控 (tengu_kairos) 启用\n` +
        `2. 已接受信任对话框\n` +
        `3. 目录可信\n\n` +
        `如需启用，请确保满足以上条件或使用 --assistant 标志启动。`
    }
  }

  if (arg === 'off' || arg === 'disable') {
    // 助手模式通常由系统控制，用户不能直接禁用
    return {
      type: 'text',
      value: `助手模式由系统控制，不能通过命令禁用。\n\n` +
        `要禁用助手模式，请:\n` +
        `1. 移除 --assistant 启动标志\n` +
        `2. 在设置中关闭相关选项\n` +
        `3. 等待 GrowthBook 门控过期`
    }
  }

  // 未知命令
  return {
    type: 'text',
    value: `未知的助手命令: ${arg}\n\n` +
      `使用 /assistant help 查看可用命令。`
  }
}

const assistant: Command = {
  type: 'local',
  name: 'assistant',
  description: '助手模式控制',
  argumentHint: '[help|status|on|off]',
  isEnabled: () => true,
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call })
} satisfies Command

export default assistant

export const NewInstallWizard: React.FC<{
  defaultDir: string;
  onInstalled: (dir: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}> = (() => null);
export const computeDefaultInstallDir: () => Promise<string> = (() => Promise.resolve(''));


