import type { Command, LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { getSessionMemoryContent } from '../../services/SessionMemory/sessionMemoryUtils.js'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// ============================================================================
// Types
// ============================================================================

interface SessionPattern {
  description: string
  userMessages: string[]
  toolCalls: string[]
  repeatedActions: string[]
  triggers: string[]
}

// ============================================================================
// Help
// ============================================================================

function renderHelp(): string {
  return [
    '# /skill create-from-session',
    '',
    '从当前会话中提取可重复的工作流，创建为可复用技能。',
    '',
    '## 用法',
    '',
    '```',
    '/skill create-from-session [描述]',
    '```',
    '',
    '## 示例',
    '',
    '```',
    '/skill create-from-session 创建 PR 后自动审查',
    '/skill create-from-session 重构模式提取',
    '```',
    '',
    '## 说明',
    '',
    '此命令会：',
    '- 1. 分析当前会话的用户消息和工具调用',
    '- 2. 识别可重复的工作流模式',
    '- 3. 提取触发条件和执行步骤',
    '- 4. 生成技能文件到 `.doge/skills/<name>/SKILL.md`',
  ].join('\n')
}

// ============================================================================
// Analysis
// ============================================================================

function analyzeSessionPatterns(messages: string[]): SessionPattern {
  const userMessages: string[] = []
  const toolCalls: string[] = []
  const repeatedActions: string[] = []
  const triggers: string[] = []

  // 提取用户消息
  for (const msg of messages) {
    if (msg.startsWith('User:') || msg.startsWith('user:')) {
      const text = msg.replace(/^(User|user):\s*/, '').trim()
      if (text.length > 10 && text.length < 500) {
        userMessages.push(text)
      }
    }
  }

  // 提取触发词（用户消息中的动词短语）
  const actionVerbs = ['创建', '生成', '修复', '重构', '审查', '分析', '添加', '删除', '更新', '修改', '查找', '搜索', '部署', '测试']
  for (const msg of userMessages) {
    for (const verb of actionVerbs) {
      if (msg.includes(verb) && !triggers.includes(verb)) {
        triggers.push(verb)
      }
    }
  }

  // 提取重复出现的工具调用模式
  const toolPatterns = [
    { pattern: /Read\(([^)]+)\)/g, name: '读取文件' },
    { pattern: /Edit\(([^)]+)\)/g, name: '编辑文件' },
    { pattern: /Bash\(([^)]+)\)/g, name: '执行命令' },
    { pattern: /Grep\(([^)]+)\)/g, name: '搜索代码' },
    { pattern: /Write\(([^)]+)\)/g, name: '写入文件' },
  ]

  for (const { pattern, name } of toolPatterns) {
    const matches = messages.join('\n').match(pattern)
    if (matches && matches.length >= 2) {
      repeatedActions.push(name)
      toolCalls.push(`${name} (${matches.length} 次)`)
    }
  }

  // 构建技能描述
  const description = userMessages.length > 0
    ? userMessages.slice(0, 3).join('; ')
    : '从会话中提取的工作流'

  return {
    description: description.slice(0, 200),
    userMessages: userMessages.slice(0, 10),
    toolCalls,
    repeatedActions,
    triggers: triggers.slice(0, 10),
  }
}

function generateSkillMarkdown(pattern: SessionPattern, skillName: string, description: string): string {
  const now = new Date().toISOString().split('T')[0]

  return `---
name: ${skillName}
description: ${description}
when_to_use: 当用户提到 ${pattern.triggers.length > 0 ? pattern.triggers.slice(0, 3).join('、') : '相关操作'} 时自动触发
argument-hint: "[可选参数]"
allowed-tools: Read, Edit, Bash, Grep, Glob
---

# ${skillName}

${description}

## 来源

- 从会话自动提取（${now}）
- 触发词：${pattern.triggers.length > 0 ? pattern.triggers.join('、') : '待补充'}
- 涉及操作：${pattern.repeatedActions.length > 0 ? pattern.repeatedActions.join('、') : '待补充'}

## 执行步骤

### 1. 分析上下文

理解当前任务的具体要求和约束。

### 2. 执行核心操作

根据用户输入执行主要工作流。

### 3. 验证结果

确认输出符合预期，必要时进行修正。

## 注意事项

- 这是一个从会话自动生成的技能
- 建议根据实际使用情况手动优化步骤描述
- 可以编辑此文件来改进技能定义

## 示例

\`\`\`
/${skillName} [参数示例]
\`\`\`
`
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args, _context): Promise<LocalCommandResult> => {
  const skillDescription = (args || '').trim()

  if (!skillDescription) {
    return {
      type: 'text',
      value: renderHelp(),
    }
  }

  // 1. 获取会话记忆
  let sessionContent = ''
  try {
    sessionContent = await getSessionMemoryContent()
  } catch {
    // 无会话记忆
  }

  // 2. 分析会话模式
  const messages = sessionContent.split('\n').filter(line => line.trim())
  const pattern = analyzeSessionPatterns(messages)

  if (pattern.repeatedActions.length === 0 && pattern.triggers.length === 0) {
    return {
      type: 'text',
      value: [
        '# /skill create-from-session',
        '',
        '无法从当前会话中提取明确的工作流模式。',
        '',
        '可能原因：',
        '- 会话尚未开始或刚刚开始',
        '- 对话内容不足以识别重复模式',
        '- 请先执行一些操作后再运行此命令',
        '',
        '提示：尝试执行一些相关操作（如代码审查、重构等），然后再次运行此命令。',
      ].join('\n'),
    }
  }

  // 3. 生成技能名称
  const timestamp = Date.now().toString(36)
  const skillName = `session-${timestamp}`

  // 4. 生成技能内容
  const skillContent = generateSkillMarkdown(pattern, skillName, skillDescription)

  // 5. 写入技能文件
  const cwd = getOriginalCwd()
  const skillDir = join(cwd, '.doge', 'skills', skillName)

  try {
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), skillContent, 'utf-8')
  } catch (error) {
    return {
      type: 'text',
      value: `❌ 创建技能失败：${error}`,
    }
  }

  // 6. 返回结果
  const resultLines = [
    '# 技能创建成功',
    '',
    '## 技能信息',
    `- 名称：${skillName}`,
    `- 描述：${skillDescription}`,
    `- 路径：${skillDir}/SKILL.md`,
    '',
    '## 提取的模式',
    `- 触发词：${pattern.triggers.length > 0 ? pattern.triggers.join('、') : '无'}`,
    `- 涉及操作：${pattern.repeatedActions.length > 0 ? pattern.repeatedActions.join('、') : '无'}`,
    `- 工具调用：${pattern.toolCalls.length > 0 ? pattern.toolCalls.join('\n  ') : '无'}`,
    '',
    '## 下一步',
    `- 编辑 \`${skillDir}/SKILL.md\` 来优化技能定义`,
    '- 调整 `when_to_use` 触发条件',
    '- 补充 `argument-hint` 参数说明',
    `- 测试：\`/${skillName} [参数]\``,
  ]

  return {
    type: 'text',
    value: resultLines.join('\n'),
  }
}

const skillCreateFromSession: Command = {
  type: 'local',
  name: 'skill-create-from-session',
  description: '从当前会话中提取可重复的工作流，创建为可复用技能',
  aliases: ['skill-from-session'],
  isEnabled: () => {
    const { getIsNonInteractiveSession } = require('../../bootstrap/state.js')
    return !getIsNonInteractiveSession()
  },
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default skillCreateFromSession
