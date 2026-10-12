import type { Command } from '../../commands.js'

/**
 * /goal — 目标自治运行时
 *
 * 给会话设置一个"成功条件"，由 Stop hook 每轮评估，未达成则反馈主模型继续，
 * 直到达成 / 判定不可能 / 预算耗尽。状态持久化到 .claude/goals/active.json，
 * /clear 后可恢复。
 *
 * 实现说明见 goal.md。
 */
const goal: Command = {
  type: 'local-jsx',
  name: 'goal',
  description: '设置目标并由裁判循环推进直到达成（/goal status 查看进度）',
  aliases: ['gol'],
  isEnabled: () => true,
  isHidden: false,
  load: () => import('./goal.js'),
}

export default goal
