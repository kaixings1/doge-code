import type { PermissionMode } from '../permissions/PermissionMode.js'
import { getGlobalConfig } from '../config.js'
import { readCustomApiStorage } from '../customApiStorage.js'
import { capitalize } from '../stringUtils.js'
import { MODEL_ALIASES, type ModelAlias } from './aliases.js'
import { applyBedrockRegionPrefix, getBedrockRegionPrefix } from './bedrock.js'
import {
  getCanonicalName,
  getRuntimeMainLoopModel,
  parseUserSpecifiedModel,
} from './model.js'
import { getAPIProvider } from './providers.js'

export const AGENT_MODEL_OPTIONS = [...MODEL_ALIASES, 'inherit'] as const
export type AgentModelAlias = (typeof AGENT_MODEL_OPTIONS)[number]

export type AgentModelOption = {
  value: string
  label: string
  description: string
}

/**
 * 获取默认的子代理模型。返回 'inherit' 使得子代理从父线程继承模型。
 */
export function getDefaultSubagentModel(): string {
  return 'inherit'
}

/**
 * 获取代理实际使用的模型字符串。
 *
 * 对于 Bedrock，若父模型使用了跨区域推理前缀（如 "eu."、"us."），
 * 该前缀会被使用别名模型（如 "sonnet"、"haiku"、"opus"）的子代理继承。
 * 这确保了子代理与父模型使用相同的区域，当 IAM 权限限定于特定的跨区域推理配置文件时，这是必需的。
 */
export function getAgentModel(
  agentModel: string | undefined,
  parentModel: string,
  toolSpecifiedModel?: ModelAlias,
  permissionMode?: PermissionMode,
): string {
  if (process.env.CLAUDE_CODE_SUBAGENT_MODEL) {
    return parseUserSpecifiedModel(process.env.CLAUDE_CODE_SUBAGENT_MODEL)
  }

  // 从父模型中提取 Bedrock 区域前缀，以便子代理继承。
  // 这确保了子代理与父模型使用相同的跨区域推理配置文件（如 "eu."、"us."），
  // 当 IAM 权限仅允许特定区域时，这是必需的。
  const parentRegionPrefix = getBedrockRegionPrefix(parentModel)

  // 辅助函数：为 Bedrock 模型应用父区域前缀。
  // `originalSpec` 是解析前的原始模型字符串（别名或完整 ID）。
  // 如果用户显式指定了一个已携带自身区域前缀的完整模型 ID（如 "eu.anthropic.…"），
  // 则保留该前缀而非用父前缀覆盖。这避免了当代理配置有意固定在与父模型不同的区域时，
  // 悄然违反数据驻留要求的情况。
  const applyParentRegionPrefix = (
    resolvedModel: string,
    originalSpec: string,
  ): string => {
    if (parentRegionPrefix && getAPIProvider() === 'bedrock') {
      if (getBedrockRegionPrefix(originalSpec)) return resolvedModel
      return applyBedrockRegionPrefix(resolvedModel, parentRegionPrefix)
    }
    return resolvedModel
  }

  // 优先使用工具指定的模型（若提供）
  if (toolSpecifiedModel) {
    if (aliasMatchesParentTier(toolSpecifiedModel, parentModel)) {
      return parentModel
    }
    const model = parseUserSpecifiedModel(toolSpecifiedModel)
    return applyParentRegionPrefix(model, toolSpecifiedModel)
  }

  const agentModelWithExp = agentModel ?? getDefaultSubagentModel()

  if (agentModelWithExp === 'inherit') {
    // 对继承模式应用运行时模型解析，以获得实际生效的模型。
    // 这确保了在计划模式下使用 'inherit' 的代理能够正确将 opusplan 解析为 Opus。
    return getRuntimeMainLoopModel({
      permissionMode: permissionMode ?? 'default',
      mainLoopModel: parentModel,
      exceeds200kTokens: false,
    })
  }

  if (aliasMatchesParentTier(agentModelWithExp, parentModel)) {
    return parentModel
  }
  const model = parseUserSpecifiedModel(agentModelWithExp)
  return applyParentRegionPrefix(model, agentModelWithExp)
}

/**
 * 检查裸族系别名（opus/sonnet/haiku）是否与父模型的层级匹配。
 * 当匹配时，子代理继承父模型的精确模型字符串，而非将别名解析为提供商的默认值。
 *
 * 这可以避免令人意外的降级：一个通过 /model 使用 Opus 4.6 的 Vertex 用户，
 * 在生成带有 `model: opus` 的子代理时，应该得到 Opus 4.6，而不是 getDefaultOpusModel() 为第三方返回的任意模型。
 * 参见：https://github.com/anthropics/claude-code/issues/30815。
 *
 * 仅裸族系别名会匹配。`opus[1m]`、`best`、`opusplan` 将穿透，
 * 因为它们携带了超出“与父模型同层级”的额外语义。
 */
function aliasMatchesParentTier(alias: string, parentModel: string): boolean {
  const canonical = getCanonicalName(parentModel)
  switch (alias.toLowerCase()) {
    case 'opus':
      return canonical.includes('opus')
    case 'sonnet':
      return canonical.includes('sonnet')
    case 'haiku':
      return canonical.includes('haiku')
    default:
      return false
  }
}

export function getAgentModelDisplay(model: string | undefined): string {
  // 当模型省略时，getDefaultSubagentModel() 在运行时会返回 'inherit'
  if (!model) return '继承父模型（默认）'
  if (model === 'inherit') return '继承父模型'
  return capitalize(model)
}

/**
 * 获取代理可用的模型选项
 */
export function getAgentModelOptions(): AgentModelOption[] {
  const customModels = [
    ...(getGlobalConfig().customApiEndpoint?.savedModels ?? []),
    ...(readCustomApiStorage().savedModels ?? []),
  ]
    .map(model => model.trim())
    .filter(Boolean)

  const customApiProvider =
    readCustomApiStorage().provider ??
    getGlobalConfig().customApiEndpoint?.provider ??
    'anthropic'

  if (customApiProvider === 'openai' || customModels.length > 0) {
    return [
      ...[...new Set(customModels)].map(model => ({
        value: model,
        label: model,
        description: '自定义模型',
      })),
      {
        value: 'inherit',
        label: '继承父级',
        description: '使用与主对话相同的模型',
      },
    ]
  }

  return [
    {
      value: 'sonnet',
      label: 'Sonnet',
      description: '性能均衡 - 适合大多数代理',
    },
    {
      value: 'opus',
      label: 'Opus',
      description: '能力最强，适合复杂推理任务',
    },
    {
      value: 'haiku',
      label: 'Haiku',
      description: '快速高效，适合简单任务',
    },
    {
      value: 'inherit',
      label: '继承父模型',
      description: '使用与主对话相同的模型',
    },
  ]
}
