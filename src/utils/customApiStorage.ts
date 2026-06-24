import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfigFromEnv } from './providerEnv.ts'

import { logForDebugging } from './debug.js'

/** Token 统计数据类型 */
export type PresetTokenData = {
  sent: number      // 累计发送（输入）token 数（来自 API usage）
  received: number  // 累计接收（输出）token 数（来自 API usage）
  current: number   // 当前进程累计 token 数（会话内累计）
  sessionTotal: number  // 会话总 token 数
  currentSessionTotal: number  // 兼容旧字段名
  /** JSON 请求体字节数（发送端统计，含 overhead） */
  jsonSentBytes?: number
  /** JSON 响应体字节数（接收端统计） */
  jsonReceivedBytes?: number
}

export type CustomApiStorageData = {
  provider?: 'anthropic' | 'openai'
  baseURL?: string
  apiKey?: string
  model?: string
  savedModels?: string[]
  /** 当前 BaseURL 下已保存的多个 API Key 的集合（方便在同 BaseURL 下切换） */
  savedApiKeys?: string[]
  tokens?: PresetTokenData
}

type ProjectStorage = {
  activePreset?: string
  presets: Record<string, CustomApiStorageData>
}

type GlobalStorage = {
  presets: Record<string, CustomApiStorageData>
}

// ---------- 路径 ----------
function getGlobalConfigPath(): string {
  return path.join(os.homedir(), '.doge', 'providers.json')
}

function getProjectConfigPath(): string {
  // 优先使用环境变量 DOGE_API_JSON 指定自定义配置路径
  // 可用于实现进程间配置隔离：每个进程使用不同的 api.json
  const envPath = process.env.DOGE_API_JSON
  if (envPath && typeof envPath === 'string' && envPath.trim()) {
    return path.resolve(envPath.trim())
  }
  return path.join(process.cwd(), '.doge', 'api.json')
}

// 记录上次读取的项目配置文件修改时间（用于跨进程变化检测）
let lastProjectMtime: number | null = null

/**
 * 检查项目配置文件是否被其他进程修改
 * 返回 true 表示文件已被修改过，需要重新读取
 */
export function checkProjectConfigChanged(): boolean {
  try {
    const p = getProjectConfigPath()
    if (!fs.existsSync(p)) return false
    const stat = fs.statSync(p)
    const currentMtime = stat.mtimeMs
    if (lastProjectMtime !== null && currentMtime !== lastProjectMtime) {
      lastProjectMtime = currentMtime
      return true
    }
    // 首次调用时初始化 mtime
    if (lastProjectMtime === null) {
      lastProjectMtime = currentMtime
    }
    return false
  } catch {
    return false
  }
}

// ---------- 内部读写 ----------
function readGlobalStorage(): GlobalStorage {
  try {
    const p = getGlobalConfigPath()
    if (!fs.existsSync(p)) return { presets: {} }
    const raw = fs.readFileSync(p, 'utf-8')
    const data = JSON.parse(raw)
    if (data && typeof data === 'object') {
      return {
        presets: (data.presets as Record<string, unknown>) ?? {},
      }
    }
    return { presets: {} }
  } catch {
    return { presets: {} }
  }
}

function readProjectStorage(): ProjectStorage {
  try {
    const p = getProjectConfigPath()
    if (!fs.existsSync(p)) return { presets: {} }
    const raw = fs.readFileSync(p, 'utf-8')
    const data = JSON.parse(raw)
    // 更新修改时间，用于跨进程检测
    try {
      const stat = fs.statSync(p)
      lastProjectMtime = stat.mtimeMs
    } catch {}
    if (data && typeof data === 'object') {
      const value = data as Record<string, unknown>
      // 老格式升级
      if ('provider' in value || 'baseURL' in value || 'apiKey' in value) {
        return {
          activePreset: 'default',
          presets: { default: readOldConfig(value) },
        }
      }
      // 新格式
      return {
        activePreset: typeof value.activePreset === 'string' ? value.activePreset : undefined,
        presets: (value.presets as Record<string, unknown>) ?? {},
      }
    }
    return { presets: {} }
  } catch {
    return { presets: {} }
  }
}

function writeProjectStorage(project: ProjectStorage): void {
  const p = getProjectConfigPath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(p, JSON.stringify(project, null, 2), 'utf-8')
  // 更新 mtime 避免自己写完后立刻检测到变化
  try {
    const stat = fs.statSync(p)
    lastProjectMtime = stat.mtimeMs
  } catch {}
}

function readOldConfig(value: Record<string, unknown>): CustomApiStorageData {
  return {
    provider:
      value.provider === 'openai' || value.provider === 'anthropic'
        ? value.provider
        : undefined,
    baseURL: typeof value.baseURL === 'string' ? value.baseURL : undefined,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    savedModels: Array.isArray(value.savedModels)
      ? value.savedModels.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

// ---------- 对外 API ----------

/**
 * 读取配置。
 * @param skipEnv 是否跳过环境变量检测（启动时使用，避免读到假凭证）
 * @param presetName 可选，指定预设名，否则使用项目激活预设
 */
export function readCustomApiStorage(presetName?: string): CustomApiStorageData {
  const project = readProjectStorage();
  // 关键：跳过空字符串
  const rawName = presetName ?? project.activePreset;
  const activeName = (typeof rawName === 'string' && rawName.trim()) ? rawName.trim() : undefined;
  
  logForDebugging('[readCustomApiStorage] activeName: ' + activeName, { level: 'debug' });
  
  if (activeName) {
    if (project.presets[activeName]) {
      logForDebugging('[readCustomApiStorage] ✅ using project preset: ' + activeName, { level: 'debug' });
      return { ...project.presets[activeName] };
    }
    const global = readGlobalStorage();
    if (global.presets[activeName]) {
      logForDebugging('[readCustomApiStorage] ✅ using global preset: ' + activeName, { level: 'debug' });
      return { ...global.presets[activeName] };
    }
  }

  const envConfig = loadConfigFromEnv(activeName);
  if (envConfig.baseURL || envConfig.apiKey) {
    logForDebugging('[readCustomApiStorage] ⚠️ using env fallback', { level: 'debug' });
    return { provider: 'openai', baseURL: envConfig.baseURL, apiKey: envConfig.apiKey, model: envConfig.model };
  }

  logForDebugging('[readCustomApiStorage] ❌ returning empty', { level: 'debug' });
  return {};
}
/**
 * 保存配置到项目文件（同时更新激活预设）。
 */
export function writeCustomApiStorage(
  next: CustomApiStorageData,
  presetName?: string,
): void {
  // 1. 清理 baseURL 后缀
  // 根据 provider 类型决定清理策略：
  // - openai: 保存完整 URL（包括 /v1/chat/completions），不要清理
  // - anthropic: 仅清理 /v1/messages，因为 SDK 会自动拼接此路径
  if (next.baseURL) {
    if (next.provider !== 'openai') {
      // 仅对 Anthropic 兼容节点清理 /v1/messages
      next.baseURL = next.baseURL.replace(/\/v1\/messages\/?$/, '').replace(/\/+$/, '');
    }
    // OpenAI 兼容节点保持完整 URL 不变
  }

  // 2. 只有在 provider 未提供或非法时才推断，绝不覆盖已明确的值
  if (!next.provider || (next.provider !== 'openai' && next.provider !== 'anthropic')) {
    if (next.baseURL?.includes('/chat/completions')) {
		
      next.provider = 'openai';   // 默认 openai（包括无 baseURL 的情况）
    } else {
		
      next.provider = 'anthropic';
    }
  }
  // 如果已经明确为 'openai' 或 'anthropic'，跳过上述改写

  // 自动将 apiKey 纳入 savedApiKeys（去重）
  if (next.apiKey) {
    const existing = next.savedApiKeys ?? []
    if (!existing.includes(next.apiKey)) {
      next.savedApiKeys = [...existing, next.apiKey]
    }
  }

  const name = (presetName && presetName.trim()) || 'default';  // 关键保底
  const project = readProjectStorage();
  // 如果该 preset 已有数据，合并 savedApiKeys（保留之前所有 key）
  if (project.presets[name]) {
    const oldKeys = project.presets[name].savedApiKeys ?? []
    if (next.savedApiKeys) {
      // 合并新旧 key 列表，去重
      const merged = [...new Set([...oldKeys, ...next.savedApiKeys])]
      next.savedApiKeys = merged
    } else if (oldKeys.length > 0) {
      // 如果新的没提供但旧的有，保留旧的
      next.savedApiKeys = oldKeys
    }
  }
  project.presets[name] = next;
  project.activePreset = name;
  try {
    writeProjectStorage(project);
    logForDebugging('[Storage] Saved preset: ' + name, { level: 'debug' });
  } catch (e) {
    logForDebugging('[Storage] Failed to write: ' + e, { level: 'error' });
  }

  // 同步环境变量，确保下一次 queryModel() 能立即读到新配置
  process.env.ANTHROPIC_BASE_URL = next.baseURL || ''
  process.env.DOGE_API_KEY = next.apiKey || ''
  process.env.ANTHROPIC_MODEL = next.model || ''
  process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = next.provider || 'openai'
  // 通知 queryModel 刷新缓存
  ;(process as any)._dogeConfigChanged = true
}
/**
 * 切换激活预设，并立即同步环境变量。
 */
export function switchActivePreset(presetName: string): boolean {
  const project = readProjectStorage()
  if (project.presets[presetName]) {
    project.activePreset = presetName
    writeProjectStorage(project)

    const config = project.presets[presetName]
    logForDebugging('[switchActivePreset] set active to: ' + presetName + ' config: ' + JSON.stringify(config), { level: 'debug' })

    // 同步环境变量（这是关键，只有这里做了，界面才能立刻变）
    // 注意：这里需要覆盖之前的 dummy 值，因为它们是在启动时设置的
    process.env.ANTHROPIC_BASE_URL = config.baseURL || ''
    process.env.DOGE_API_KEY = config.apiKey || ''
    process.env.ANTHROPIC_MODEL = config.model || ''
    process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = config.provider || 'openai'

    // 通过设置标志通知 queryModel 刷新缓存
    ;(process as any)._dogeConfigChanged = true

    return true
  }
  return false
}

/**
 * 列出所有已知预设（合并全局 + 项目，项目覆盖）。
 */
export function listSavedPresets(): { name: string; config: CustomApiStorageData }[] {
  const global = readGlobalStorage()
  const project = readProjectStorage()
  const merged = { ...global.presets, ...project.presets }
  return Object.entries(merged).map(([name, config]) => ({ name, config }))
}

/** 清除当前项目的配置文件 */
export function clearCustomApiStorage(): void {
  const p = getProjectConfigPath()
  try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch {}
}
/**
 * 为当前活跃预设累加 token 计数，并持久化到 api.json。
 * 每次 API 请求完成后调用，确保跨会话 token 累计准确。
 */
export function addPresetTokens(
  newSent: number,
  newReceived: number,
  jsonSentBytes?: number,
  jsonReceivedBytes?: number,
): void {
  try {
    const p = getProjectConfigPath()
    if (!fs.existsSync(p)) return

    const raw = fs.readFileSync(p, 'utf-8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return

    const project = data as ProjectStorage
    const activeName = typeof project.activePreset === 'string' && project.activePreset.trim()
      ? project.activePreset.trim()
      : undefined

    if (!activeName || !project.presets || !project.presets[activeName]) return

    const preset = project.presets[activeName]
    const t = preset.tokens || {
      sent: 0,
      received: 0,
      current: 0,
      sessionTotal: 0,
      currentSessionTotal: 0,
      jsonSentBytes: 0,
      jsonReceivedBytes: 0,
    }
    t.sent = Math.round((t.sent || 0) + newSent)
    t.received = Math.round((t.received || 0) + newReceived)
    t.currentSessionTotal = Math.round((t.currentSessionTotal || 0) + newSent + newReceived)
    if (typeof jsonSentBytes === 'number') {
      t.jsonSentBytes = Math.round((t.jsonSentBytes || 0) + jsonSentBytes)
    }
    if (typeof jsonReceivedBytes === 'number') {
      t.jsonReceivedBytes = Math.round((t.jsonReceivedBytes || 0) + jsonReceivedBytes)
    }
    preset.tokens = t

    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    logForDebugging('[addPresetTokens] Failed: ' + e, { level: 'error' })
  }
}
