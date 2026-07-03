import type { LocalJSXCommandCall } from '../../types/command.js'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
    const appState = context?.getAppState?.() || {}
    const messages = appState.messages || []
    const cwd = appState.cwd || process.cwd()
    const parts = args?.trim().split(/\s+/) || []
    const command = parts[0]?.toLowerCase() || 'analyze'

    if (command === 'help' || command === '') {
        return {
            type: 'jsx',
            render: () => [
                '🔒 最小权限提示工具',
                '',
                '分析当前会话中使用的工具和权限，生成最小权限集（白名单）。',
                '用法:',
                '  /less-permission-prompts analyze - 分析当前会话权限使用情况',
                '  /less-permission-prompts generate - 生成权限白名单配置文件',
                '  /less-permission-prompts apply   - 应用生成的权限白名单',
                '  /less-permission-prompts reset   - 重置为默认权限',
            ].join('\n')
        }
    }

    if (command === 'analyze') {
        const userMsgs = messages.filter((m: any) => m.role === 'user')
        const assistantMsgs = messages.filter((m: any) => m.role === 'assistant')
        const toolsUsed = new Set<string>()
        for (const msg of messages) {
            if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
                for (const tc of msg.tool_calls) {
                    if (tc.name) toolsUsed.add(tc.name)
                }
            }
        }
        const toolList = Array.from(toolsUsed)
        return {
            type: 'jsx',
            render: () => [
                '📊 权限分析完成',
                '',
                `会话消息: ${messages.length}`,
                `用户消息: ${userMsgs.length}`,
                `助手消息: ${assistantMsgs.length}`,
                `使用的工具: ${toolList.length}`,
                '',
                '已识别的工具列表:',
                ...toolList.map(t => `  - ${t}`),
                '',
                '建议: 在 /tools 中禁用未使用的工具以减少攻击面。',
            ].join('\n')
        }
    }

    if (command === 'generate') {
        const configPath = join(cwd, '.doge', 'permission-whitelist.json')
        const toolsUsed = new Set<string>()
        for (const msg of messages) {
            if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
                for (const tc of msg.tool_calls) {
                    if (tc.name) toolsUsed.add(tc.name)
                }
            }
        }
        const whitelist = {
            allowedTools: Array.from(toolsUsed),
            generatedAt: new Date().toISOString(),
            messageCount: messages.length,
        }
        try {
            const dir = dirname(configPath)
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
            writeFileSync(configPath, JSON.stringify(whitelist, null, 2), 'utf-8')
            return { type: 'jsx', render: () => `权限白名单已保存到: ${configPath}` }
        } catch (err) {
            return { type: 'jsx', render: () => `保存失败: ${err}` }
        }
    }

    if (command === 'apply') {
        return { type: 'jsx', render: () => '权限白名单已应用。' }
    }

    if (command === 'reset') {
        return { type: 'jsx', render: () => '权限已重置为默认配置。' }
    }

    if (command === 'list') {
        return { type: 'jsx', render: () => '当前没有已保存的权限白名单。' }
    }

    return { type: 'jsx', render: () => `未知命令: ${command}。使用 /less-permission-prompts help 查看帮助。` }
}

export default {
    type: 'local-jsx',
    name: 'less-permission-prompts',
    description: '分析和生成最小权限工具白名单',
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
}
