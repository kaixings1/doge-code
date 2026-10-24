// 本地技能搜索（EXPERIMENTAL_SKILL_SEARCH）。
//
// 历史：早期是占位实现——localSkillSearch() 直接 return [] 且打 warn，
// clearSkillIndexCache() 是 no-op（TASK.md #25：确为桩）。
//
// 现落地为**本地关键词/前缀索引**，不引入任何 embedding / 云端服务
// （大陆不可达 Anthropic 云端，见 TASK.md P5.0 排除项）。
//
// 索引对象：技能名称 + 描述 + 别名（来自 getBundledSkills / getSkillDirCommands /
// getPluginSkills），与 discover_skills 复用同一套发现逻辑。

import { getBundledSkills } from '../../skills/bundledSkills.js'
import { getSkillDirCommands } from '../../skills/loadSkillsDir.js'
import { getPluginSkills } from '../../utils/plugins/loadPluginCommands.js'
import type { Command } from '../../types/command.js'

interface IndexedSkill {
  name: string
  description: string
  aliases: string[]
  source: string
  keywords: string[]
}

// 进程内索引缓存（memoization）；clearSkillIndexCache 使其失效。
// 缓存 Promise 本身以支持 buildIndex 的异步来源（插件/目录）。
let cachedIndex: Promise<IndexedSkill[]> | null = null

export function tokenize(text: string): string[] {
  if (!text) return []
  // 中文按字符切、英文按词切，统一小写
  const asciiWords = text
    .toLowerCase()
    .match(/[a-z0-9_]+/g)
  const cjkChars = text.match(/[一-鿿]/g)
  return [...(asciiWords ?? []), ...(cjkChars ?? [])]
}

async function buildIndex(): Promise<IndexedSkill[]> {
  const index: IndexedSkill[] = []

  const push = (cmd: Command, source: string) => {
    if (cmd.userInvocable === false) return
    const text = `${cmd.name} ${cmd.description ?? ''} ${(cmd.aliases ?? []).join(' ')}`
    index.push({
      name: cmd.name,
      description: cmd.description ?? '',
      aliases: cmd.aliases ?? [],
      source,
      keywords: tokenize(text),
    })
  }

  try {
    for (const cmd of getBundledSkills()) push(cmd as never, 'bundled')
  } catch {
    // 忽略
  }
  try {
    for (const cmd of (await getPluginSkills()) as Command[]) push(cmd, 'plugin')
  } catch {
    // 忽略
  }
  // 磁盘目录型需要 cwd；此处先以 process.cwd() 兜底，发现函数内部有容错
  try {
    for (const cmd of (await getSkillDirCommands(process.cwd())) as Command[]) push(cmd, 'dir')
  } catch {
    // 忽略
  }

  return index
}

function getIndex(): Promise<IndexedSkill[]> {
  if (cachedIndex === null) cachedIndex = buildIndex()
  return cachedIndex
}

/**
 * 本地关键词技能搜索。
 *
 * @param query 搜索词（支持中文子串 / 英文前缀匹配）
 * @returns 命中的技能摘要数组；无索引内容时返回空（与旧行为一致，不抛错）
 */
export async function localSkillSearch(query: string): Promise<
  Array<{ name: string; description: string; aliases: string[]; source: string }>
> {
  if (!query || !query.trim()) return []
  const q = query.trim().toLowerCase()

  const index = await getIndex()
  const results: Array<{ name: string; description: string; aliases: string[]; source: string; score: number }> = []

  for (const skill of index) {
    let score = 0
    // 名称精确 / 前缀命中权重最高
    if (skill.name.toLowerCase() === q) score += 10
    else if (skill.name.toLowerCase().startsWith(q)) score += 6
    else if (skill.name.toLowerCase().includes(q)) score += 3

    // 别名等同名称处理
    for (const alias of skill.aliases) {
      const a = alias.toLowerCase()
      if (a === q) score += 8
      else if (a.startsWith(q)) score += 4
    }

    // 关键词（中文单字 / 英文词）命中：前缀 / 全等双向，不做子串包含，
    // 避免单字母关键词（如 'a'）与查询中的偶然子串误匹配（如 zzz-nomatch 含 'a'）。
    // 中文用例：查「调试」→ 单字关键词「调」满足 q.startsWith('调')；
    //          查「调」→ 多字关键词「调试」满足 kw.startsWith('调')。
    for (const kw of skill.keywords) {
      if (kw === q) score += 2
      else if (kw.startsWith(q) || q.startsWith(kw)) score += 1
    }

    if (score > 0) {
      results.push({ name: skill.name, description: skill.description, aliases: skill.aliases, source: skill.source, score })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.map(({ score: _score, ...rest }) => rest)
}

/**
 * 使技能搜索索引的 memoization 缓存失效。
 * 索引机制已落地，此函数为真实失效（下次搜索重建索引）。
 */
export function clearSkillIndexCache(): void {
  cachedIndex = null
}
