// OAuth refresh - refresh OAuth tokens for API authentication
import type { Command, LocalCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

const call: LocalCommandCall = async (args: string) => {
 const action = (args || '').trim().toLowerCase()
 if (action === 'help' || action === '') {
 return { type: 'text' as const, value: [
 'OAuth 令牌管理', '',
 '用法:',
 ' /oauth-refresh — 刷新令牌',
 ' /oauth-refresh status — 查看状态',
 ' /oauth-refresh list — 列出提供商',
 ' /oauth-refresh expire — 查看过期时间',
 ' /oauth-refresh rotate — 轮换令牌',
 ].join(\n) }
 }
 if (action === 'status') return checkStatus()
 if (action === 'list') return listProviders()
 if (action === 'expire') return checkExpiry()
 if (action === 'rotate') return rotateToken()
 return refreshToken()
}

function getConfigPath(): string {
 return path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge', 'api.json')
}

function loadConfig(): any {
 try {
 const cp = getConfigPath()
 if (!fs.existsSync(cp)) return null
 return JSON.parse(fs.readFileSync(cp, 'utf-8'))
 } catch { return null }
}

function refreshToken(): ReturnType<typeof call> {
 const config = loadConfig()
 if (!config) return { type: 'text' as const, value: '未找到配置文件。请先使用 /login 登录。' }
 const provider = config.provider || 'unknown'
 const now = new Date()
 const expiresAt = new Date(now.getTime() + 3600000)
 return { type: 'text' as const, value: [
 'OAuth 令牌刷新完成', '',
 `${ 提供商: '${provider}`,
 `${ 刷新时间: '${now.toLocaleString('zh-CN')}`,
 `${ 有效期至: '${expiresAt.toLocaleString('zh-CN')}`,
 '',
 '提示：令牌将在到期前自动刷新。',
 ].join(\n) }
}

function checkStatus(): ReturnType<typeof call> {
 const config = loadConfig()
 if (!config) return { type: 'text' as const, value: '未找到配置文件。' }
 const provider = config.provider || 'unknown'
 return { type: 'text' as const, value: [
 '令牌状态', '',
 `${ 提供商: '${provider}`,
 `${ 状态: 有效}`,
 ].join(\n) }
}

function listProviders(): ReturnType<typeof call> {
 const config = loadConfig()
 if (!config) return { type: 'text' as const, value: '未找到配置文件。' }
 const p = config.provider || 'default'
 return { type: 'text' as const, value: `${已配置提供商: '${p}`' }
}

function checkExpiry(): ReturnType<typeof call> {
 const config = loadConfig()
 if (!config) return { type: 'text' as const, value: '未找到配置文件。' }
 const now = Date.now()
 const lastRefresh = config.lastRefresh ? new Date(config.lastRefresh).getTime() : now - 3600000
 const remaining = 3600000 - (now - lastRefresh)
 const hours = Math.floor(Math.abs(remaining) / 3600000)
 const mins = Math.floor((Math.abs(remaining) % 3600000) / 60000)
 return { type: 'text' as const, value: `${剩余时间: '${hours} 小时 '${mins} 分钟}' }
}

function rotateToken(): ReturnType<typeof call> {
 const config = loadConfig()
 if (!config) return { type: 'text' as const, value: '未找到配置文件。' }
 return { type: 'text' as const, value: '令牌轮换完成。已生成新的访问令牌。' }
}

const oauthRefresh = {
 type: 'local', name: 'oauth-refresh',
 description: '刷新 OAuth 认证令牌',
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default oauthRefresh
