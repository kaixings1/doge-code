import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

/**
 * /reload-skills（对齐官方 v2.1.304）
 *
 * 重新扫描技能目录并把**完整技能列表**重新告知模型。
 *
 * 与磁盘监听（skillChangeDetector）的区别：那条路径会在文件变化时自动触发，
 * 但用户手动改完技能、或想让模型在压缩后重新看到全部技能时，需要一个显式入口。
 * 官方在同一版本里把语义明确成「把完整技能列表再发给模型」，这里照此实现。
 *
 * 清理顺序对应 skillChangeDetector 的做法：
 *   clearSkillCaches()      → 丢弃磁盘扫描结果
 *   clearCommandsCache()    → 丢弃命令/技能索引的多层 memoization
 *   resetSentSkillNames()   → 让下一轮重新注入技能清单（而非只发增量）
 */
export const call: LocalCommandCall = async (): Promise<LocalCommandResult> => {
  const { clearCommandsCache, getCommands } = await import('../../commands.js')
  const { clearSkillCaches } = await import('../../skills/loadSkillsDir.js')
  const { resetSentSkillNames } = await import('../../utils/attachments.js')
  const { getCwd } = await import('../../utils/cwd.js')
  const cwd = getCwd()

  // 先记下重载前的数量，用于给用户一个可核对的差异。
  const before = await getCommands(cwd)

  clearSkillCaches()
  clearCommandsCache()
  resetSentSkillNames()

  const after = await getCommands(cwd)
  const beforeNames = new Set(before.map(c => c.name))
  const afterNames = new Set(after.map(c => c.name))
  const added = [...afterNames].filter(n => !beforeNames.has(n))
  const removed = [...beforeNames].filter(n => !afterNames.has(n))

  const lines = [
    `技能已重载：共 ${afterNames.size} 项（重载前 ${beforeNames.size} 项）。`,
    '下一轮对话会把完整技能列表重新发送给模型。',
  ]
  if (added.length) lines.push(`新增 ${added.length}：${added.join('、')}`)
  if (removed.length) lines.push(`移除 ${removed.length}：${removed.join('、')}`)
  if (!added.length && !removed.length) lines.push('（技能集合无变化）')

  return { type: 'text', value: lines.join('\n') }
}

const reloadSkills: Command = {
  type: 'local' as const,
  name: 'reload-skills',
  description: '重新扫描技能目录，并把完整技能列表重新告知模型',
  supportsNonInteractive: false,
  load: () => Promise.resolve({ call }),
}

export default reloadSkills
