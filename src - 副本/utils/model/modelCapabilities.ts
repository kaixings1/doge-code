import { readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import isEqual from 'lodash-es/isEqual.js'
import memoize from 'lodash-es/memoize.js'
import { join } from 'path'
import { z } from 'zod/v4'
import { OAUTH_BETA_HEADER } from '../../constants/oauth.js'
import { getAnthropicClient } from '../../services/api/client.js'
import { isClaudeAISubscriber } from '../auth.js'
import { logForDebugging } from '../debug.js'
import { getClaudeConfigHomeDir } from '../envUtils.js'
import { safeParseJSON } from '../json.js'
import { lazySchema } from '../lazySchema.js'
import { isEssentialTrafficOnly } from '../privacyLevel.js'
import { jsonStringify } from '../slowOperations.js'
import { getAPIProvider, isFirstPartyAnthropicBaseUrl } from './providers.js'

/**
 * 模型能力校验模式
 * .strip() —— 不将内部专用字段（如 mycro_deployments）持久化到磁盘
 */
const ModelCapabilitySchema = lazySchema(() =>
  z
    .object({
      id: z.string(),
      max_input_tokens: z.number().optional(),
      max_tokens: z.number().optional(),
    })
    .strip(),
)

/** 缓存文件格式校验 */
const CacheFileSchema = lazySchema(() =>
  z.object({
    models: z.array(ModelCapabilitySchema()),
    timestamp: z.number(),
  }),
)

/** 模型能力类型定义 */
export type ModelCapability = z.infer<ReturnType<typeof ModelCapabilitySchema>>

/** 获取缓存目录路径 */
function getCacheDir(): string {
  return join(getClaudeConfigHomeDir(), 'cache')
}

/** 获取缓存文件完整路径 */
function getCachePath(): string {
  return join(getCacheDir(), 'model-capabilities.json')
}

/** 判断当前环境是否允许拉取并缓存模型能力信息 */
function isModelCapabilitiesEligible(): boolean {
  if (process.env.USER_TYPE !== 'ant') return false        // 仅内部员工
  if (getAPIProvider() !== 'firstParty') return false      // 仅第一方 API
  if (!isFirstPartyAnthropicBaseUrl()) return false        // 仅官方 API 地址
  return true
}

/**
 * 按 ID 长度降序排序，以便在模糊匹配时优先使用更具体的模型 ID。
 * 次要排序键为 ID 字符串，保证 isEqual 比较时结果稳定。
 */
function sortForMatching(models: ModelCapability[]): ModelCapability[] {
  return [...models].sort(
    (a, b) => b.id.length - a.id.length || a.id.localeCompare(b.id),
  )
}

/**
 * 从磁盘加载模型能力缓存。
 * 使用 memoize 并基于缓存文件路径作为缓存键，使测试中修改 CLAUDE_CONFIG_DIR 时能重新读取。
 */
const loadCache = memoize(
  (path: string): ModelCapability[] | null => {
    try {
      // eslint-disable-next-line custom-rules/no-sync-fs -- 已 memoized，从同步 getContextWindowForModel 调用
      const raw = readFileSync(path, 'utf-8')
      const parsed = CacheFileSchema().safeParse(safeParseJSON(raw, false))
      return parsed.success ? parsed.data.models : null
    } catch {
      return null
    }
  },
  path => path,
)

/**
 * 根据模型名称获取其能力信息（最大输入/输出 token 数）。
 * 优先精确匹配，其次按 ID 长度降序进行子串匹配。
 */
export function getModelCapability(model: string): ModelCapability | undefined {
  if (!isModelCapabilitiesEligible()) return undefined
  const cached = loadCache(getCachePath())
  if (!cached || cached.length === 0) return undefined
  const m = model.toLowerCase()
  const exact = cached.find(c => c.id.toLowerCase() === m)
  if (exact) return exact
  return cached.find(c => m.includes(c.id.toLowerCase()))
}

/**
 * 从第一方 API 拉取最新模型列表并更新磁盘缓存。
 * 仅当环境符合条件且非仅必要流量模式时执行。
 */
export async function refreshModelCapabilities(): Promise<void> {
  if (!isModelCapabilitiesEligible()) return
  if (isEssentialTrafficOnly()) return

  try {
    const anthropic = await getAnthropicClient({ maxRetries: 1 })
    const betas = isClaudeAISubscriber() ? [OAUTH_BETA_HEADER] : undefined
    const parsed: ModelCapability[] = []
    for await (const entry of anthropic.models.list({ betas })) {
      const result = ModelCapabilitySchema().safeParse(entry)
      if (result.success) parsed.push(result.data)
    }
    if (parsed.length === 0) return

    const path = getCachePath()
    const models = sortForMatching(parsed)
    // 若内存缓存与待写入内容一致，跳过磁盘写入
    if (isEqual(loadCache(path), models)) {
      logForDebugging('[modelCapabilities] 缓存未变化，跳过写入')
      return
    }

    await mkdir(getCacheDir(), { recursive: true })
    await writeFile(path, jsonStringify({ models, timestamp: Date.now() }), {
      encoding: 'utf-8',
      mode: 0o600,
    })
    // 删除旧缓存条目，下次调用时将重新读取磁盘
    loadCache.cache.delete(path)
    logForDebugging(`[modelCapabilities] 已缓存 ${models.length} 个模型`)
  } catch (error) {
    logForDebugging(
      `[modelCapabilities] 拉取失败: ${error instanceof Error ? error.message : '未知错误'}`,
    )
  }
}