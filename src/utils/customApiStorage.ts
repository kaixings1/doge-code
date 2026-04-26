import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { loadConfigFromEnv } from './providerEnv.ts'

import { logForDebugging } from './debug.js'
export type CustomApiStorageData = {
  provider?: 'anthropic' | 'openai'
  baseURL?: string
  apiKey?: string
  model?: string
  savedModels?: string[]
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
  return path.join(process.cwd(), '.doge', 'api.json')
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
  if (next.baseURL) {
    next.baseURL = next.baseURL.replace(/\/v1\/messages\/?$/, '').replace(/\/+$/, '');
  }

  // 2. 只有在 provider 未提供或非法时才推断，绝不覆盖已明确的值
  if (!next.provider || (next.provider !== 'openai' && next.provider !== 'anthropic')) {
    if (next.baseURL?.includes('/v1/chat/completions')) {
		
      next.provider = 'openai';   // 默认 openai（包括无 baseURL 的情况）
    } else {
		
      next.provider = 'anthropic';
    }
  }
  else
	  next.provider = 'anthropic';
  // 如果已经明确为 'openai' 或 'anthropic'，跳过上述改写

  const name = (presetName && presetName.trim()) || 'default';
  const project = readProjectStorage();
  project.presets[name] = next;
  project.activePreset = name;
  try {
    writeProjectStorage(project);
    logForDebugging('[Storage] Saved preset: ' + name, { level: 'debug' });
  } catch (e) {
    logForDebugging('[Storage] Failed to write: ' + e, { level: 'error' });
  }
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
    process.env.ANTHROPIC_BASE_URL = config.baseURL || ''
    process.env.DOGE_API_KEY = config.apiKey || ''
    process.env.ANTHROPIC_MODEL = config.model || ''
    process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER = config.provider || 'openai'

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