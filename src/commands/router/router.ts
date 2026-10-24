import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { LocalCommandCall } from '../../types/command.js'
import { getCwd } from '../../utils/cwd.js'
import { TIERS, classify, estimateTiers, type RouteTier } from '../../utils/modelRouter.js'
import { decideDowngrade } from '../../utils/routerDowngrade.js'
import { getBestModel } from '../../utils/model/model.js'

/**
 * /router — 分层模型路由建议 + 成本估算（纯本地，无网络）。
 *
 * 用法：
 *   /router                 — 展示三层模型、当前项目规模与分层收益估算
 *   /router <任务描述>       — 判定该任务应走哪一层，并说明理由
 *   /router --json [任务]    — 机器可读输出（便于脚本/工具链消费）
 */

const MAX_SCAN = 4000

function scanProjectSize(dir: string): { files: number; bytes: number; truncated: boolean } {
  let files = 0
  let bytes = 0
  let truncated = false
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.doge', 'temp', 'vendor'])
  const stack = [dir]
  while (stack.length > 0) {
    const cur = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(cur)
    } catch {
      continue
    }
    for (const name of entries) {
      if (skip.has(name)) continue
      const full = join(cur, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        stack.push(full)
      } else {
        files++
        bytes += st.size
        if (files >= MAX_SCAN) {
          truncated = true
          return { files, bytes, truncated }
        }
      }
    }
  }
  return { files, bytes, truncated }
}

function tierLine(t: RouteTier): string {
  const spec = TIERS[t]
  return `${t.padEnd(9)} ${spec.label.padEnd(18)} 成本×${spec.costFactor.toFixed(2)}  例: ${spec.examples.join(' / ')}`
}

const call: LocalCommandCall = async (args, _context) => {
  const raw = args.trim()
  const wantJson = /^--json\b/.test(raw)
  const task = wantJson ? raw.replace(/^--json\s*/, '').trim() : raw

  if (task) {
    const result = classify({ text: task })
    // 模拟一次真实决策，让用户看到「如果开启会自动降级到哪个模型」
    const simulated = decideDowngrade({ model: getBestModel(), taskText: task })
    if (wantJson) {
      return {
        type: 'text',
        value: JSON.stringify(
          { task, ...result, spec: TIERS[result.tier], downgrade: simulated },
          null,
          2,
        ),
      }
    }
    return {
      type: 'text',
      value: [
        `任务: ${task}`,
        `建议层级: ${result.tier} — ${TIERS[result.tier].label}`,
        `评分: ${result.score}`,
        `依据: ${result.reasons.length > 0 ? result.reasons.join('；') : '无强特征，按最省处理'}`,
        '',
        '若开启自动降级（CLAUDE_CODE_ROUTER_AUTO=1）:',
        simulated.downgraded
          ? `  强模型 → ${simulated.model}（降一级）`
          : `  不降级：${simulated.reason ?? '无'}`,
        '',
        '各层定义:',
        ...(Object.keys(TIERS) as RouteTier[]).map(tierLine),
      ].join('\n'),
    }
  }

  const size = scanProjectSize(getCwd())
  const estimate = estimateTiers({ requests: 1, currentCostUSD: undefined })
  const kb = Math.round(size.bytes / 1024)

  const payload = {
    project: { ...size, sizeKB: kb },
    tiers: TIERS,
    relativeCost: Object.fromEntries(estimate.map(r => [r.tier, Number(r.estimatedCostUSD.toFixed(3))])),
  }

  if (wantJson) {
    return { type: 'text', value: JSON.stringify(payload, null, 2) }
  }

  return {
    type: 'text',
    value: [
      '分层模型路由（本地策略，无网络）',
      '',
      ...(Object.keys(TIERS) as RouteTier[]).map(tierLine),
      '',
      `当前项目: ${size.files} 个文件 / ${kb} KB${size.truncated ? '（已截断扫描）' : ''}`,
      '',
      '相对成本（以强模型为 1.00）:',
      ...estimate.map(r => `  ${r.tier.padEnd(9)} ${r.estimatedCostUSD.toFixed(2)}`),
      '',
      '自动降级状态:',
      `  CLAUDE_CODE_ROUTER_AUTO      = ${process.env.CLAUDE_CODE_ROUTER_AUTO ?? '(未设置，默认关闭)'}`,
      `  CLAUDE_CODE_ROUTER_DRY_RUN   = ${process.env.CLAUDE_CODE_ROUTER_DRY_RUN ?? '(未设置)'}`,
      `  CLAUDE_CODE_ROUTER_CHEAP_MODEL    = ${process.env.CLAUDE_CODE_ROUTER_CHEAP_MODEL ?? '(用默认 Haiku)'}`,
      `  CLAUDE_CODE_ROUTER_STANDARD_MODEL = ${process.env.CLAUDE_CODE_ROUTER_STANDARD_MODEL ?? '(用默认 Sonnet)'}`,
      '',
      '自动降级规则：只降一级、只降不升；计划模式 / 含图片 / 上下文过大 / 自定义模型名 均不降。',
      '',
      '用法: /router <任务描述> 判定层级；/router --json 输出 JSON。',
    ].join('\n'),
  }
}

export { call, scanProjectSize }
