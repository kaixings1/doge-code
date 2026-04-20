import {
  getModelStrings as getModelStringsState,
  setModelStrings as setModelStringsState,
} from '../../bootstrap/state.js'
import { logError } from '../log.js'
import { sequential } from '../sequential.js'
import { getInitialSettings } from '../settings/settings.js'
import { findFirstMatch, getBedrockInferenceProfiles } from './bedrock.js'
import {
  ALL_MODEL_CONFIGS,
  CANONICAL_ID_TO_KEY,
  type CanonicalModelId,
  type ModelKey,
} from './configs.js'
import { type APIProvider, getAPIProvider } from './providers.js'

/**
 * 将各模型版本映射到其对应提供方的模型 ID 字符串。
 * 派生自 ALL_MODEL_CONFIGS —— 在该处新增模型会自动扩展此类型。
 */
export type ModelStrings = Record<ModelKey, string>

const MODEL_KEYS = Object.keys(ALL_MODEL_CONFIGS) as ModelKey[]

/**
 * 获取指定 API 提供方的内置模型字符串映射。
 */
function getBuiltinModelStrings(provider: APIProvider): ModelStrings {
  const out = {} as ModelStrings
  for (const key of MODEL_KEYS) {
    out[key] = ALL_MODEL_CONFIGS[key][provider]
  }
  return out
}

/**
 * 获取 Bedrock 提供方对应的模型字符串映射。
 * 通过查询用户可用的推理配置文件列表，将配置中的第一方 ID 作为子串进行匹配。
 * 若查询失败或未匹配到，则回退至内置的 Bedrock 默认值。
 */
async function getBedrockModelStrings(): Promise<ModelStrings> {
  const fallback = getBuiltinModelStrings('bedrock')
  let profiles: string[] | undefined
  try {
    profiles = await getBedrockInferenceProfiles()
  } catch (error) {
    logError(error as Error)
    return fallback
  }
  if (!profiles?.length) {
    return fallback
  }
  // 每个配置的 firstParty ID 作为标准子串，用于在用户的推理配置文件列表中搜索。
  // 例如 "claude-opus-4-6" 可匹配 "eu.anthropic.claude-opus-4-6-v1"。
  // 若未找到匹配的配置文件，则回退至硬编码的 Bedrock ID。
  const out = {} as ModelStrings
  for (const key of MODEL_KEYS) {
    const needle = ALL_MODEL_CONFIGS[key].firstParty
    out[key] = findFirstMatch(profiles, needle) || fallback[key]
  }
  return out
}

/**
 * 将用户配置的 modelOverrides（来自 settings.json）叠加到提供方派生的模型字符串上。
 * 覆盖项以标准第一方模型 ID（如 "claude-opus-4-6"）为键，映射到任意提供方特定字符串
 * —— 通常是 Bedrock 推理配置文件的 ARN。
 */
function applyModelOverrides(ms: ModelStrings): ModelStrings {
  const overrides = getInitialSettings().modelOverrides
  if (!overrides) {
    return ms
  }
  const out = { ...ms }
  for (const [canonicalId, override] of Object.entries(overrides)) {
    const key = CANONICAL_ID_TO_KEY[canonicalId as CanonicalModelId]
    if (key && override) {
      out[key] = override
    }
  }
  return out
}

/**
 * 将被覆盖的模型 ID（例如 Bedrock ARN）反向解析回其标准第一方模型 ID。
 * 若输入未匹配到任何当前覆盖值，则原样返回。
 * 该函数可在模块初始化期间安全调用（若设置尚未加载则直接返回原值）。
 */
export function resolveOverriddenModel(modelId: string): string {
  let overrides: Record<string, string> | undefined
  try {
    overrides = getInitialSettings().modelOverrides
  } catch {
    return modelId
  }
  if (!overrides) {
    return modelId
  }
  for (const [canonicalId, override] of Object.entries(overrides)) {
    if (override === modelId) {
      return canonicalId
    }
  }
  return modelId
}

/**
 * 串行化更新 Bedrock 模型字符串。
 * 若状态中已存在有效数据则直接返回，避免重复 API 调用。
 * 配合 sequential 使用，允许测试套件在用例间重置状态，同时防止生产环境多次请求。
 */
const updateBedrockModelStrings = sequential(async () => {
  if (getModelStringsState() !== null) {
    // 已初始化。此处在检查与 sequential 结合，
    // 可使测试套件在用例间重置状态，同时防止生产环境多次调用 API。
    return
  }
  try {
    const ms = await getBedrockModelStrings()
    setModelStringsState(ms)
  } catch (error) {
    logError(error as Error)
  }
})

/**
 * 初始化模型字符串状态。
 * 对于非 Bedrock 提供方，同步设置内置默认值。
 * 对于 Bedrock 用户，在后台异步获取推理配置文件列表，不阻塞当前调用。
 */
function initModelStrings(): void {
  const ms = getModelStringsState()
  if (ms !== null) {
    // 已初始化
    return
  }
  // 非 Bedrock 提供方：使用内置默认值
  if (getAPIProvider() !== 'bedrock') {
    setModelStringsState(getBuiltinModelStrings(getAPIProvider()))
    return
  }
  // Bedrock 环境：后台更新模型字符串，不阻塞。
  // 此处不设置状态，以便利用 sequential 管理 updateBedrockModelStrings，
  // 并在多次调用时检查已有状态。
  void updateBedrockModelStrings()
}

/**
 * 获取当前有效的模型字符串映射。
 * 若状态未初始化，则触发初始化流程。对于 Bedrock 用户，在后台查询期间会返回带有覆盖项的临时默认值。
 */
export function getModelStrings(): ModelStrings {
  const ms = getModelStringsState()
  if (ms === null) {
    initModelStrings()
    // Bedrock 路径在此处穿透，同时后台仍在获取配置文件 —— 但仍会在临时默认值上应用覆盖项。
    return applyModelOverrides(getBuiltinModelStrings(getAPIProvider()))
  }
  return applyModelOverrides(ms)
}

/**
 * 确保模型字符串已完全初始化。
 * 对于 Bedrock 用户，会等待配置文件获取完成后再返回。
 * 在生成模型选项前调用此方法，可确保获得正确的区域字符串。
 */
export async function ensureModelStringsInitialized(): Promise<void> {
  const ms = getModelStringsState()
  if (ms !== null) {
    return
  }

  // 非 Bedrock 环境：同步初始化
  if (getAPIProvider() !== 'bedrock') {
    setModelStringsState(getBuiltinModelStrings(getAPIProvider()))
    return
  }

  // Bedrock 环境：等待配置文件拉取完成
  await updateBedrockModelStrings()
}