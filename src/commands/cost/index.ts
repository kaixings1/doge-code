/**
 * 成本命令 — 显示当前会话成本信息。
 *
 * 用法:
 *   /cost                   — 显示总费用（向后兼容）
 *   /cost --by-model        — 按模型维度显示费用明细
 *   /cost --by-type         — 按 token 类型显示费用分布
 *   /cost --trend [N]       — 显示最近 N 次 API 调用的费用趋势（默认 10）
 *   /cost --export <file>   — 导出成本数据为 JSON 文件
 */
import type { Command } from '../../commands.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'
import { call } from './cost.js'

const cost = {
  type: 'local',
  name: 'cost',
  description: '显示当前会话的成本和持续时间（支持 --by-model / --by-type / --trend / --export）',
  get isHidden() {
    if (process.env.USER_TYPE === 'ant') {
      return false
    }
    return isClaudeAISubscriber()
  },
  supportsNonInteractive: true,
  arguments: [
    {
      name: '--by-model',
      description: '按模型维度显示费用明细',
      required: false,
    },
    {
      name: '--by-type',
      description: '按 token 类型显示费用分布（input/output/cache_read/cache_create）',
      required: false,
    },
    {
      name: '--trend',
      description: '显示最近 N 次 API 调用的费用趋势柱状图（默认 10）',
      required: false,
    },
    {
      name: '--export',
      description: '导出成本数据到 JSON 文件',
      required: false,
    },
  ],
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default cost
