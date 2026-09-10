// 本地技能搜索（EXPERIMENTAL_SKILL_SEARCH）。
// 当前阶段为功能封闭的占位实现：技能索引尚未落地，搜索直接返回空结果；
// 同时暴露 clearSkillIndexCache 供命令/MCP 侧反订阅缓存失效调用（no-op）。
export async function localSkillSearch() {
  // 索引尚未实现，返回空结果并留痕
  console.warn('[localSkillSearch] 技能索引未实现，返回空结果')
  return []
}

/**
 * 使技能搜索索引的 memoization 缓存失效。
 * 索引机制尚未实现，缓存本身为空，此函数为安全 no-op，
 * 但保留签名以适配 feature 门控后的调用方（commands.ts / useManageMCPConnections.ts）。
 */
export function clearSkillIndexCache() {
  // 占位：真实缓存实现接入后可在此清空技能索引。
}