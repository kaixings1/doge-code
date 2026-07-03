// Mock limits - simulate API rate limits for testing
import type { Command, LocalCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

const CONFIG_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge', 'mock-limits.json')

interface MockLimitsConfig {
 enabled: boolean
 dailyTokens: number
 perMinuteRequests: number
 concurrentSessions: number
 lastUpdated: string
}

const DEFAULT_CONFIG: MockLimitsConfig = {
 enabled: false,
 dailyTokens: 100000,
 perMinuteRequests: 60,
 concurrentSessions: 5,
 lastUpdated: new Date().toISOString(),
}

function loadConfig(): MockLimitsConfig {
 try {
 if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG }
 const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
 return JSON.parse(raw) as MockLimitsConfig
 } catch { return { ...DEFAULT_CONFIG } }
}

function saveConfig(cfg: MockLimitsConfig): void {
 cfg.lastUpdated = new Date().toISOString()
 try {
 const dir = path.dirname(CONFIG_FILE)
 if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
 fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
 } catch {}
}

const call: LocalCommandCall = async (args: string) => {
 const action = (args || '').trim().toLowerCase()
 if (action === 'help' || action === '') {
 return { type: 'text' as const, value: [
 '⚙️ 模拟限制模式', '',
 '用法:',
 ' /mock-limits — 显示当前状态',
 ' /mock-limits enable — 启用模拟限制',
 ' /mock-limits disable — 禁用模拟限制',
 ' /mock-limits set <tokens> — 设置每日 token 限额',
 ' /mock-limits rpm <n> — 设置每分钟请求数',
 ' /mock-limits sessions <n> — 设置并发会话数',
 ' /mock-limits preset <name> — 使用预设配置',
 ' /mock-limits reset — 重置为默认值',
 ].join(\n) }
 }
 if (action === 'enable') return enableMock()
 if (action === 'disable') return disableMock()
 if (action === 'status' || action === 'st') return showStatus()
 if (action === 'reset') return resetConfig()
 if (action === 'preset') return showPresets()
 if (action.startsWith('preset ')) {
 const preset = action.replace(/^preset\s+/, '').trim()
 return applyPreset(preset)
 }
 if (action.startsWith('set ')) {
 const tokens = parseInt(action.replace(/^set\s+/, '').trim())
 if (!isNaN(tokens) && tokens > 0) return setDailyTokens(tokens)
 }
 if (action.startsWith('rpm ')) {
 const rpm = parseInt(action.replace(/^rpm\s+/, '').trim())
 if (!isNaN(rpm) && rpm > 0) return setPerMinute(rpm)
 }
 if (action.startsWith('sessions ')) {
 const n = parseInt(action.replace(/^sessions\s+/, '').trim())
 if (!isNaN(n) && n > 0) return setConcurrentSessions(n)
 }
 return showStatus()
}
function enableMock(): ReturnType<typeof call> {
 const cfg = loadConfig()
 cfg.enabled = true
 saveConfig(cfg)
 return { type: 'text' as const, value: [
 '🟢 模拟限制模式已启用', '',
 `${ 每日 token: '${cfg.dailyTokens.toLocaleString()}`,
 `${ 每分钟请求: '${cfg.perMinuteRequests}`,
 `${ 并发会话: '${cfg.concurrentSessions}`,
 '',
 '所有 API 调用将使用模拟计数而非实际配额。',
 ].join(\n) }
}

function disableMock(): ReturnType<typeof call> {
 const cfg = loadConfig()
 cfg.enabled = false
 saveConfig(cfg)
 return { type: 'text' as const, value: '🔴 模拟限制模式已禁用，恢复正常 API 调用。' }
}

function showStatus(): ReturnType<typeof call> {
 const cfg = loadConfig()
 if (!cfg.enabled) return { type: 'text' as const, value: '⚙️ 模拟限制模式未启用。//n使用 /mock-limits enable 启用。' }
 return { type: 'text' as const, value: [
 '📊 模拟限制状态', '',
 `${ 模拟模式: 已启用}`,
 `${ 每日 token: '${cfg.dailyTokens.toLocaleString()}`,
 `${ 每分钟请求: '${cfg.perMinuteRequests}`,
 `${ 并发会话: '${cfg.concurrentSessions}`,
 `${ 最后更新: '${cfg.lastUpdated}`,
 ].join(\n) }
}

function setDailyTokens(tokens: number): ReturnType<typeof call> {
 const cfg = loadConfig()
 cfg.dailyTokens = tokens
 saveConfig(cfg)
 return { type: 'text' as const, value: `${已设置每日 token 限额为 '${tokens.toLocaleString()}。}' }
}

function setPerMinute(rpm: number): ReturnType<typeof call> {
 const cfg = loadConfig()
 cfg.perMinuteRequests = rpm
 saveConfig(cfg)
 return { type: 'text' as const, value: `${已设置每分钟请求数为 '${rpm}。}' }
}

function setConcurrentSessions(n: number): ReturnType<typeof call> {
 const cfg = loadConfig()
 cfg.concurrentSessions = n
 saveConfig(cfg)
 return { type: 'text' as const, value: `${已设置并发会话数为 '${n}。}' }
}

function resetConfig(): ReturnType<typeof call> {
 saveConfig({ ...DEFAULT_CONFIG })
 return { type: 'text' as const, value: '🔄 已重置为默认配置。' }
}

function showPresets(): ReturnType<typeof call> {
 return { type: 'text' as const, value: [
 '📦 预设配置', '',
 ' fast — 快速开发 (10000 tokens/min)',
 ' balanced — 均衡模式 (100000 tokens, 60 rpm)',
 ' slow — 慢速模式 (1000 tokens, 10 rpm)',
 ' unlimited — 无限制模式',
 '',
 '使用 /mock-limits preset <name> 应用预设。',
 ].join(\n) }
}

function applyPreset(name: string): ReturnType<typeof call> {
 const presets: Record<string, Partial<MockLimitsConfig>> = {
 'fast': { dailyTokens: 10000, perMinuteRequests: 100, concurrentSessions: 10 },
 'balanced': { dailyTokens: 100000, perMinuteRequests: 60, concurrentSessions: 5 },
 'slow': { dailyTokens: 1000, perMinuteRequests: 10, concurrentSessions: 2 },
 'unlimited': { dailyTokens: 999999999, perMinuteRequests: 9999, concurrentSessions: 999 },
 }
 const preset = presets[name]
 if (!preset) return { type: 'text' as const, value: `${未知预设: '${name}. 使用 /mock-limits preset 查看。}' }
 const cfg = loadConfig()
 Object.assign(cfg, preset)
 cfg.enabled = true
 saveConfig(cfg)
 return { type: 'text' as const, value: `${已应用预设 '${name}。}' }
}

const mockLimits = {
 type: 'local', name: 'mock-limits',
 description: '模拟 API 速率限制，用于开发与测试',
 isHidden: true,
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default mockLimits