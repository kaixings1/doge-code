import { getSettings_DEPRECATED } from '../settings/settings.js'
import { isModelAlias, isModelFamilyAlias } from './aliases.js'
import { parseUserSpecifiedModel } from './model.js'
import { resolveOverriddenModel } from './modelStrings.js'

/**
 * 检查模型是否属于指定的模型族，通过检查模型名称（或解析后的名称）是否包含族标识符。
 */
function modelBelongsToFamily(model: string, family: string): boolean {
  if (model.includes(family)) {
    return true
  }
  // 解析像 "best" 这样的别名，得到 "claude-opus-4-6"，以判断是否属于该族
  if (isModelAlias(model)) {
    const resolved = parseUserSpecifiedModel(model).toLowerCase()
    return resolved.includes(family)
  }
  return false
}

/**
 * 检查模型名称是否以指定前缀开头，且前缀必须在分段边界处结束。
 * 前缀必须匹配到名称末尾或遇到 "-" 分隔符。
 * 例如："claude-opus-4-5" 可匹配 "claude-opus-4-5-20251101"，但不会匹配 "claude-opus-4-50"。
 */
function prefixMatchesModel(modelName: string, prefix: string): boolean {
  if (!modelName.startsWith(prefix)) {
    return false
  }
  return modelName.length === prefix.length || modelName[prefix.length] === '-'
}

/**
 * 检查模型是否与允许列表中的版本前缀条目匹配。
 * 支持简写形式，如 "opus-4-5"（映射为 "claude-opus-4-5"），以及完整前缀如 "claude-opus-4-5"。
 * 在匹配前会解析输入的别名。
 */
function modelMatchesVersionPrefix(model: string, entry: string): boolean {
  // 如果输入模型是别名，则解析为完整名称
  const resolvedModel = isModelAlias(model)
    ? parseUserSpecifiedModel(model).toLowerCase()
    : model

  // 尝试直接使用条目匹配（如 "claude-opus-4-5"）
  if (prefixMatchesModel(resolvedModel, entry)) {
    return true
  }
  // 尝试添加 "claude-" 前缀（如 "opus-4-5" → "claude-opus-4-5"）
  if (
    !entry.startsWith('claude-') &&
    prefixMatchesModel(resolvedModel, `claude-${entry}`)
  ) {
    return true
  }
  return false
}

/**
 * 检查某个族别名是否被允许列表中更具体的条目所限制。
 * 当允许列表同时包含 "opus" 和 "opus-4-5" 时，具体条目优先——
 * 单独的 "opus" 原本是通配符，但 "opus-4-5" 将其限定为仅该版本。
 */
function familyHasSpecificEntries(
  family: string,
  allowlist: string[],
): boolean {
  for (const entry of allowlist) {
    if (isModelFamilyAlias(entry)) {
      continue
    }
    // 检查条目是否为该族的带版本限定变体
    // 例如，对于 "opus" 族，可能是 "opus-4-5" 或 "claude-opus-4-5-20251101"
    // 必须在分段边界处匹配（后跟 '-' 或结束），以避免 "opusplan" 误匹配 "opus"
    const idx = entry.indexOf(family)
    if (idx === -1) {
      continue
    }
    const afterFamily = idx + family.length
    if (afterFamily === entry.length || entry[afterFamily] === '-') {
      return true
    }
  }
  return false
}

/**
 * 检查模型是否被设置中的 availableModels 允许列表所允许。
 * 如果 availableModels 未设置，则所有模型均被允许。
 *
 * 匹配层级：
 * 1. 族别名（"opus"、"sonnet"、"haiku"）—— 整个族的通配符，
 *    除非该族也存在更具体的条目（如 "opus-4-5"）。
 *    此时，族通配符将被忽略，仅具体条目生效。
 * 2. 版本前缀（"opus-4-5"、"claude-opus-4-5"）—— 该版本的任何构建版本
 * 3. 完整模型 ID（"claude-opus-4-5-20251101"）—— 仅精确匹配
 */
export function isModelAllowed(model: string): boolean {
  const settings = getSettings_DEPRECATED() || {}
  const { availableModels } = settings
  if (!availableModels) {
    return true // 无限制
  }
  if (availableModels.length === 0) {
    return false // 空白允许列表将阻止所有用户指定的模型
  }

  const resolvedModel = resolveOverriddenModel(model)
  const normalizedModel = resolvedModel.trim().toLowerCase()
  const normalizedAllowlist = availableModels.map(m => m.trim().toLowerCase())

  // 直接匹配（别名对别名，或完整名称对完整名称）
  // 跳过那些被更具体条目限制的族别名——
  // 例如，["opus", "opus-4-5"] 中的 "opus" 不应直接匹配，因为管理员意图是仅限 opus 4.5。
  if (normalizedAllowlist.includes(normalizedModel)) {
    if (
      !isModelFamilyAlias(normalizedModel) ||
      !familyHasSpecificEntries(normalizedModel, normalizedAllowlist)
    ) {
      return true
    }
  }

  // 允许列表中的族级别别名可匹配该族内的任意模型，
  // 但仅当该族不存在更具体的条目时才生效。
  // 例如，["opus"] 允许所有 opus，但 ["opus", "opus-4-5"] 仅允许 opus 4.5。
  for (const entry of normalizedAllowlist) {
    if (
      isModelFamilyAlias(entry) &&
      !familyHasSpecificEntries(entry, normalizedAllowlist) &&
      modelBelongsToFamily(normalizedModel, entry)
    ) {
      return true
    }
  }

  // 对于非族条目，进行双向别名解析
  // 如果模型是别名，则解析它，并检查解析后的名称是否在列表中
  if (isModelAlias(normalizedModel)) {
    const resolved = parseUserSpecifiedModel(normalizedModel).toLowerCase()
    if (normalizedAllowlist.includes(resolved)) {
      return true
    }
  }

  // 如果允许列表中的任何非族别名解析后等于输入模型
  for (const entry of normalizedAllowlist) {
    if (!isModelFamilyAlias(entry) && isModelAlias(entry)) {
      const resolved = parseUserSpecifiedModel(entry).toLowerCase()
      if (resolved === normalizedModel) {
        return true
      }
    }
  }

  // 版本前缀匹配："opus-4-5" 或 "claude-opus-4-5" 可在分段边界匹配 "claude-opus-4-5-20251101"
  for (const entry of normalizedAllowlist) {
    if (!isModelFamilyAlias(entry) && !isModelAlias(entry)) {
      if (modelMatchesVersionPrefix(normalizedModel, entry)) {
        return true
      }
    }
  }

  return false
}