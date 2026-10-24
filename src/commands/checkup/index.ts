import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

/**
 * /checkup（对齐官方 v2.1.283，亦可用 `/doctor prompt-audit`）
 *
 * 审查 CLAUDE.md / 技能 / 代理里的**提示词写法问题**——不是检查拼写，
 * 而是找那些会让模型行为变差的模式：
 *   - 形容词堆积（"好的、专业的、高质量的"）→ 不可证伪，等于没写
 *   - 空泛指令（"注意代码质量"）→ 模型无法据此改变行为
 *   - 缺失可执行约束（没有路径、阈值、格式）
 *   - CLAUDE.md 过长（挤占上下文）
 *   - 重复段落（同一件事说多遍，稀释权重）
 *
 * 输出**只诊断不改文件**——修改是用户的决定。
 */

type Finding = {
  file: string
  severity: 'high' | 'medium' | 'low'
  message: string
}

// 不可证伪的形容词：出现在指令里通常意味着"这条不会改变任何行为"
const VAGUE_ADJECTIVES = [
  '高质量的', '专业的', '优雅的', '完美的', '优秀的', '良好的',
  'robust', 'comprehensive', 'professional', 'elegant', 'high-quality',
]

// 空泛指令模式：没有给出任何可执行判据
const VAGUE_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  { re: /注意(代码)?质量/, hint: '"注意代码质量"不可执行，请写成具体判据（如"提交前必须通过 tsc"）' },
  { re: /(尽量|尽可能)(写)?(好|完善|优化)/, hint: '"尽量优化"没有阈值，请给出可验证的标准' },
  { re: /遵循最佳实践/, hint: '未指明是哪条实践，列出具体规则才有约束力' },
  { re: /(适当|合理)(地|的)?(处理|使用)/, hint: '"适当"由谁判定？给出具体条件' },
]

function auditText(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    for (const adj of VAGUE_ADJECTIVES) {
      if (line.toLowerCase().includes(adj.toLowerCase())) {
        findings.push({
          file,
          severity: 'medium',
          message: `第 ${i + 1} 行含不可证伪的形容词「${adj}」——删除后若行为不变，即属噪音`,
        })
      }
    }
    for (const p of VAGUE_PATTERNS) {
      if (p.re.test(line)) {
        findings.push({
          file,
          severity: 'high',
          message: `第 ${i + 1} 行：${p.hint}`,
        })
      }
    }
  }

  // 长度：CLAUDE.md 每轮都进上下文，过长会挤占预算
  const approxTokens = Math.ceil(text.length / 4)
  if (approxTokens > 2000) {
    findings.push({
      file,
      severity: 'medium',
      message: `约 ${approxTokens} tokens，偏长（建议 < 2000）——每轮都会占用上下文预算`,
    })
  }

  // 重复行：完全相同的非空行出现多次
  const seen = new Map<string, number>()
  for (const line of lines) {
    const t = line.trim()
    if (t.length < 12) continue
    seen.set(t, (seen.get(t) ?? 0) + 1)
  }
  for (const [line, count] of seen) {
    if (count > 1) {
      findings.push({
        file,
        severity: 'low',
        message: `重复 ${count} 次：「${line.slice(0, 40)}…」`,
      })
    }
  }

  return findings
}

export const call: LocalCommandCall = async (args): Promise<LocalCommandResult> => {
  const scope = (args ?? '').trim() || 'prompt-audit'
  if (scope !== 'prompt-audit' && scope !== '') {
    return {
      type: 'text',
      value: `未知的检查项「${scope}」。可用：prompt-audit（默认）`,
    }
  }

  const findings: Finding[] = []
  const audited: string[] = []

  // 1) CLAUDE.md 等记忆文件
  try {
    const { getMemoryFiles } = await import('../../utils/claudemd.js')
    const files = await getMemoryFiles()
    for (const f of files) {
      const content = (f as { content?: string }).content
      const path = (f as { path?: string }).path ?? 'CLAUDE.md'
      if (typeof content !== 'string' || !content.trim()) continue
      audited.push(path)
      findings.push(...auditText(path, content))
    }
  } catch {
    // 记忆文件不可用时跳过，不阻断其余检查
  }

  // 2) 已加载技能的描述（description/whenToUse 也会进上下文）
  try {
    const { getSkillToolCommands } = await import('../../commands.js')
    const { getCwd } = await import('../../utils/cwd.js')
    const skills = await getSkillToolCommands(getCwd())
    for (const s of skills) {
      const text = [s.name, s.description, (s as { whenToUse?: string }).whenToUse]
        .filter(Boolean)
        .join('\n')
      audited.push(`技能 ${s.name}`)
      findings.push(...auditText(`技能 ${s.name}`, text))
    }
  } catch {
    // 技能列表不可用时跳过
  }

  if (audited.length === 0) {
    return { type: 'text', value: '未找到可审查的 CLAUDE.md 或技能提示词。' }
  }

  if (findings.length === 0) {
    return {
      type: 'text',
      value: `已审查 ${audited.length} 项（${audited.slice(0, 5).join('、')}${audited.length > 5 ? ' 等' : ''}），未发现问题。`,
    }
  }

  const order = { high: 0, medium: 1, low: 2 } as const
  findings.sort((a, b) => order[a.severity] - order[b.severity])

  const lines = [
    `提示词审查：检查 ${audited.length} 项，发现 ${findings.length} 个问题。`,
    '',
  ]
  for (const f of findings) {
    const tag = f.severity === 'high' ? '[高]' : f.severity === 'medium' ? '[中]' : '[低]'
    lines.push(`${tag} ${f.file}：${f.message}`)
  }
  lines.push('', '本命令只诊断、不修改文件。')

  return { type: 'text', value: lines.join('\n') }
}

const checkup: Command = {
  type: 'local' as const,
  name: 'checkup',
  description: '审查 CLAUDE.md / 技能 / 代理的提示词写法问题（亦可用 /doctor prompt-audit）',
  aliases: ['prompt-audit'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default checkup
