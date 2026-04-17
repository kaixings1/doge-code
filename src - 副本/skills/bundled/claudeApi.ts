import { readdir } from 'fs/promises'
import { getCwd } from '../../utils/cwd.js'
import { registerBundledSkill } from '../bundledSkills.js'

// claudeApiContent.js 包含 247KB 的 .md 字符串内容。在 getPromptForCommand 内部延迟加载，
// 仅在调用 /claude-api 时才将其加载到内存中。
type SkillContent = typeof import('./claudeApiContent.js')

type DetectedLanguage =
  | 'python'
  | 'typescript'
  | 'java'
  | 'go'
  | 'ruby'
  | 'csharp'
  | 'php'
  | 'curl'

const LANGUAGE_INDICATORS: Record<DetectedLanguage, string[]> = {
  python: ['.py', 'requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
  typescript: ['.ts', '.tsx', 'tsconfig.json', 'package.json'],
  java: ['.java', 'pom.xml', 'build.gradle'],
  go: ['.go', 'go.mod'],
  ruby: ['.rb', 'Gemfile'],
  csharp: ['.cs', '.csproj'],
  php: ['.php', 'composer.json'],
  curl: [],
}

async function detectLanguage(): Promise<DetectedLanguage | null> {
  const cwd = getCwd()
  let entries: string[]
  try {
    entries = await readdir(cwd)
  } catch {
    return null
  }

  for (const [lang, indicators] of Object.entries(LANGUAGE_INDICATORS) as [
    DetectedLanguage,
    string[],
  ][]) {
    if (indicators.length === 0) continue
    for (const indicator of indicators) {
      if (indicator.startsWith('.')) {
        if (entries.some(e => e.endsWith(indicator))) return lang
      } else {
        if (entries.includes(indicator)) return lang
      }
    }
  }
  return null
}

function getFilesForLanguage(
  lang: DetectedLanguage,
  content: SkillContent,
): string[] {
  return Object.keys(content.SKILL_FILES).filter(
    path => path.startsWith(`${lang}/`) || path.startsWith('shared/'),
  )
}

function processContent(md: string, content: SkillContent): string {
  // 去除 HTML 注释。循环处理嵌套注释。
  let out = md
  let prev
  do {
    prev = out
    out = out.replace(/<!--[\s\S]*?-->\n?/g, '')
  } while (out !== prev)

  out = out.replace(
    /\{\{(\w+)\}\}/g,
    (match, key: string) =>
      (content.SKILL_MODEL_VARS as Record<string, string>)[key] ?? match,
  )
  return out
}

function buildInlineReference(
  filePaths: string[],
  content: SkillContent,
): string {
  const sections: string[] = []
  for (const filePath of filePaths.sort()) {
    const md = content.SKILL_FILES[filePath]
    if (!md) continue
    sections.push(
      `<doc path="${filePath}">\n${processContent(md, content).trim()}\n</doc>`,
    )
  }
  return sections.join('\n\n')
}

const INLINE_READING_GUIDE = `## 参考文档

检测到您使用的编程语言的相关文档已包含在下方的 \`<doc>\` 标签中。每个标签具有 \`path\` 属性，指示其原始文件路径。请根据该路径查找所需章节：

### 快速任务索引

**单次文本分类 / 摘要 / 信息提取 / 问答：**
→ 参考 \`{lang}/claude-api/README.md\`

**聊天 UI 或实时响应显示：**
→ 参考 \`{lang}/claude-api/README.md\` 和 \`{lang}/claude-api/streaming.md\`

**长对话（可能超出上下文窗口）：**
→ 参考 \`{lang}/claude-api/README.md\` 中的“对话压缩”章节

**提示词缓存 / 优化缓存 / “为什么我的缓存命中率低”：**
→ 参考 \`shared/prompt-caching.md\` 和 \`{lang}/claude-api/README.md\` 中的“提示词缓存”章节

**函数调用 / 工具使用 / 代理：**
→ 参考 \`{lang}/claude-api/README.md\`、\`shared/tool-use-concepts.md\` 和 \`{lang}/claude-api/tool-use.md\`

**批量处理（对延迟不敏感的场景）：**
→ 参考 \`{lang}/claude-api/README.md\` 和 \`{lang}/claude-api/batches.md\`

**跨多个请求上传文件：**
→ 参考 \`{lang}/claude-api/README.md\` 和 \`{lang}/claude-api/files-api.md\`

**内置工具的代理（文件/网络/终端）（仅支持 Python 和 TypeScript）：**
→ 参考 \`{lang}/agent-sdk/README.md\` 和 \`{lang}/agent-sdk/patterns.md\`

**错误处理：**
→ 参考 \`shared/error-codes.md\`

**通过 WebFetch 获取最新文档：**
→ 参考 \`shared/live-sources.md\` 中的 URL`

function buildPrompt(
  lang: DetectedLanguage | null,
  args: string,
  content: SkillContent,
): string {
  // 提取 SKILL.md 中“阅读指南”部分之前的内容
  const cleanPrompt = processContent(content.SKILL_PROMPT, content)
  const readingGuideIdx = cleanPrompt.indexOf('## Reading Guide')
  const basePrompt =
    readingGuideIdx !== -1
      ? cleanPrompt.slice(0, readingGuideIdx).trimEnd()
      : cleanPrompt

  const parts: string[] = [basePrompt]

  if (lang) {
    const filePaths = getFilesForLanguage(lang, content)
    const readingGuide = INLINE_READING_GUIDE.replace(/\{lang\}/g, lang)
    parts.push(readingGuide)
    parts.push(
      '---\n\n## 包含的文档\n\n' +
        buildInlineReference(filePaths, content),
    )
  } else {
    // 未检测到语言 —— 包含全部文档并让模型询问用户
    parts.push(INLINE_READING_GUIDE.replace(/\{lang\}/g, 'unknown'))
    parts.push(
      '未自动检测到项目语言。请询问用户使用的是哪种编程语言，然后参考下方匹配的文档。',
    )
    parts.push(
      '---\n\n## 包含的文档\n\n' +
        buildInlineReference(Object.keys(content.SKILL_FILES), content),
    )
  }

  // 保留“何时使用 WebFetch”和“常见陷阱”章节
  const webFetchIdx = cleanPrompt.indexOf('## When to Use WebFetch')
  if (webFetchIdx !== -1) {
    parts.push(cleanPrompt.slice(webFetchIdx).trimEnd())
  }

  if (args) {
    parts.push(`## 用户请求\n\n${args}`)
  }

  return parts.join('\n\n')
}

export function registerClaudeApiSkill(): void {
  registerBundledSkill({
    name: 'claude-api',
    description:
      '使用 Claude API 或 Anthropic SDK 构建应用。\n' +
      '触发条件：代码中导入 `anthropic` / `@anthropic-ai/sdk` / `claude_agent_sdk`，或用户询问如何使用 Claude API、Anthropic SDK 或 Agent SDK。\n' +
      '不触发条件：代码导入 `openai` / 其他 AI SDK、通用编程问题、机器学习或数据科学任务。',
    allowedTools: ['Read', 'Grep', 'Glob', 'WebFetch'],
    userInvocable: true,
    async getPromptForCommand(args) {
      const content = await import('./claudeApiContent.js')
      const lang = await detectLanguage()
      const prompt = buildPrompt(lang, args, content)
      return [{ type: 'text', text: prompt }]
    },
  })
}