import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

/**
 * /skill-doctor（对齐官方 v2.1.261）
 *
 * 列出「已加载但本会话从未被调用」的技能，并估算它们在上下文里占用的 token。
 * 用途是让用户据此裁剪技能目录——技能描述每轮都会随系统提示发送，未使用的
 * 技能是纯粹的上下文成本。
 *
 * 判定依据：
 *   - 已加载技能 = getSkillToolCommands() 返回的模型可调用技能
 *   - 已使用     = 会话消息中出现过 Skill 工具调用，且 input.skill 命中技能名
 * 两者都无法 Static 获取，因此命令执行时才读取（而不是导入时）。
 */

/** 从会话消息里收集本会话实际调用过的技能名。 */
function collectUsedSkillNames(messages: ReadonlyArray<{ type?: string; message?: { content?: unknown } }>): Set<string> {
  const used = new Set<string>()
  for (const m of messages) {
    if (m?.type !== 'assistant') continue
    const content = m.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content as Array<{ type?: string; name?: string; input?: unknown }>) {
      if (block?.type !== 'tool_use') continue
      // Skill 工具的名字随构建可能变化，这里按 input 形状识别更稳：
      // 只要 input 里有 skill 字段且值像技能名，就记下来。
      const input = block.input as { skill?: unknown } | undefined
      if (input && typeof input.skill === 'string') used.add(input.skill)
    }
  }
  return used
}

export const call: LocalCommandCall = async (_args, context): Promise<LocalCommandResult> => {
  const { getSkillToolCommands } = await import('../../commands.js')
  const { estimateSkillFrontmatterTokens } = await import('../../skills/loadSkillsDir.js')
  const { getCwd } = await import('../../utils/cwd.js')

  const skills = await getSkillToolCommands(getCwd())
  if (skills.length === 0) {
    return { type: 'text', value: '没有已加载的技能。' }
  }

  const messages = (context?.messages ?? []) as ReadonlyArray<{
    type?: string
    message?: { content?: unknown }
  }>
  const used = collectUsedSkillNames(messages)

  const unused = skills.filter(s => !used.has(s.name))
  const totalTokens = skills.reduce((sum, s) => sum + estimateSkillFrontmatterTokens(s), 0)
  const unusedTokens = unused.reduce((sum, s) => sum + estimateSkillFrontmatterTokens(s), 0)

  const lines: string[] = [
    `技能诊断：已加载 ${skills.length} 个，本会话使用过 ${skills.length - unused.length} 个。`,
    `每轮上下文成本约 ${totalTokens} tokens，其中未使用的占用约 ${unusedTokens} tokens。`,
  ]

  if (unused.length === 0) {
    lines.push('所有已加载技能都在本会话中被调用过，无需裁剪。')
    return { type: 'text', value: lines.join('\n') }
  }

  lines.push('', `未被使用的技能（按 token 成本降序，共 ${unused.length} 个）：`)
  const rows = unused
    .map(s => ({ name: s.name, tokens: estimateSkillFrontmatterTokens(s) }))
    .sort((a, b) => b.tokens - a.tokens)
  for (const r of rows) {
    lines.push(`  ${r.name.padEnd(32)} ~${r.tokens} tokens`)
  }
  lines.push('', '如需减少上下文占用，可从技能目录中移除或将其 frontmatter 精简。')

  return { type: 'text', value: lines.join('\n') }
}

const skillDoctor: Command = {
  type: 'local' as const,
  name: 'skill-doctor',
  description: '列出本会话未使用的技能及其上下文 token 成本',
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
}

export default skillDoctor
