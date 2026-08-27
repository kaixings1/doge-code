#!/usr/bin/env node
/**
 * skill-activation-prompt.ts — UserPromptSubmit hook
 *
 * 读取用户的 prompt，从 .claude/skills/skill-rules.json 匹配触发规则，
 * 如果命中则输出建议激活的技能名称列表，供 Claude Code 在系统提示中参考。
 *
 * 触发方式（settings.json 中配置）:
 *   UserPromptSubmit 事件 → 执行此脚本
 *
 * 输出格式:
 *   SKILL_ACTIVATE: skill-name-1, skill-name-2
 *
 * 无匹配时输出空行（exit 0）。
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_RULES_PATH = join(process.cwd(), '.claude', 'hooks', 'skill-rules.json')
const MAX_KEYWORD_SCORE = 3
const MAX_INTENT_SCORE = 2
const ACTIVATION_THRESHOLD = 3

interface SkillRule {
  name: string
  description: string
  keywords?: string[]
  intentPatterns?: string[]
  fileTriggers?: { glob: string; weight?: number }[]
  enabled?: boolean
}

interface SkillRules {
  version: string
  description: string
  activationThreshold?: number
  skills: SkillRule[]
}

function loadRules(): SkillRules | null {
  if (!existsSync(SKILL_RULES_PATH)) return null
  try {
    const raw = readFileSync(SKILL_RULES_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function scoreRule(rule: SkillRule, prompt: string): number {
  const lower = prompt.toLowerCase()
  let score = 0

  // keyword matching
  if (rule.keywords) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += MAX_KEYWORD_SCORE
      }
    }
  }

  // intent pattern matching (simple substring)
  if (rule.intentPatterns) {
    for (const pattern of rule.intentPatterns) {
      if (lower.includes(pattern.toLowerCase())) {
        score += MAX_INTENT_SCORE
      }
    }
  }

  // file trigger matching (check if any matching files exist)
  if (rule.fileTriggers) {
    // Note: file existence check is expensive; skip in hook for performance.
    // File triggers are handled separately by the dev-docs integration if needed.
  }

  return score
}

function main(): void {
  const prompt = process.argv[2] || ''
  if (!prompt.trim()) {
    process.exit(0)
  }

  const rules = loadRules()
  if (!rules || !rules.skills) {
    process.exit(0)
  }

  const threshold = rules.activationThreshold ?? ACTIVATION_THRESHOLD
  const matched = rules.skills
    .filter(s => s.enabled !== false)
    .map(s => ({ name: s.name, score: scoreRule(s, prompt) }))
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(s => s.name)

  if (matched.length > 0) {
    console.log(`SKILL_ACTIVATE: ${matched.join(', ')}`)
  }
}

main()
