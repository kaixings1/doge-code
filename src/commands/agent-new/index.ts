import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'

// ============================================================================
// Types
// ============================================================================

interface AgentConfig {
  name: string
  description: string
  systemPrompt: string
  tools: string[]
  model: string
  temperature: number
  maxTokens: number
  variables: Record<string, string>
  createdAt: string
  updatedAt: string
  template?: string
}

interface AgentTemplate {
  name: string
  description: string
  systemPrompt: string
  tools: string[]
  model: string
  temperature: number
  maxTokens: number
  variables: Record<string, string>
}

// ============================================================================
// Constants
// ============================================================================

const AGENTS_DIR = join(homedir(), '.doge', 'agents')

const BUILTIN_TEMPLATES: Record<string, AgentTemplate> = {
  'code-reviewer': {
    name: 'code-reviewer',
    description: '代码审查专家 - 深度分析代码质量、安全性和最佳实践',
    systemPrompt: `你是一个资深代码审查专家。你的任务是审查代码变更，发现以下问题：

1. **代码异味**：重复代码、过长函数、过度耦合
2. **安全漏洞**：SQL注入、XSS、命令注入、硬编码密钥
3. **性能问题**：N+1查询、内存泄漏、不必要的重渲染
4. **最佳实践**：错误处理、日志记录、类型安全
5. **可维护性**：命名规范、测试覆盖、文档完整性

审查时遵循以下原则：
- 提供具体的修复建议，而非仅指出问题
- 区分"必须修复"和"建议改进"
- 关注变更文件，不扩大范围

## 输入
{code}

## 上下文
{context}

## 输出格式
以结构化格式输出审查结果，包含严重程度分级。`,
    tools: ['Read', 'Glob', 'Grep', 'Bash'],
    model: 'claude-sonnet-4-6',
    temperature: 0.3,
    maxTokens: 4096,
    variables: {
      code: '待审查的代码或 diff',
      context: '代码库的上下文信息',
    },
  },
  'test-generator': {
    name: 'test-generator',
    description: '测试生成专家 - 为代码生成全面的单元测试和集成测试',
    systemPrompt: `你是一个自动化测试工程师。你的任务是为指定代码生成全面的测试用例。

## 测试策略
1. **正常路径测试**：验证核心功能正确性
2. **边界条件测试**：空值、极值、特殊字符
3. **错误路径测试**：异常输入、错误处理
4. **Mock策略**：外部依赖（数据库、API、文件系统）
5. **覆盖率目标**：语句覆盖 > 80%，分支覆盖 > 70%

## 输入
{code}

## 测试框架
根据项目自动检测：TS/JS用vitest，Python用pytest，Go用go test，Rust用cargo test

## 规则
- 不删除已有测试
- 测试文件放在同目录，命名规则：*.test.ts / test_*.py / *_test.go
- 使用合理的Mock隔离外部依赖
- 测试应独立运行，无执行顺序依赖`,
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'Write'],
    model: 'claude-sonnet-4-6',
    temperature: 0.4,
    maxTokens: 4096,
    variables: {
      code: '待测试的源代码',
      file: '目标文件路径',
    },
  },
  'doc-writer': {
    name: 'doc-writer',
    description: '文档编写专家 - 生成API文档、README、技术设计文档',
    systemPrompt: `你是一个技术文档专家。你的任务是编写清晰、准确、结构化的技术文档。

## 文档类型
1. **API文档**：接口签名、参数说明、返回值、错误码、示例
2. **README**：项目简介、安装、使用示例、贡献指南
3. **设计文档**：架构图、数据流、技术选型理由、权衡分析
4. **变更日志**：版本号、变更类型、迁移指南

## 写作原则
- 目标读者明确（初学者/经验开发者/架构师）
- 代码示例可直接运行
- 结构清晰，层次分明
- 中英文混合时保持一致性

## 输入
{code}

## 上下文
{context}

## 输出格式
Markdown格式，包含必要的代码块、表格和图示。`,
    tools: ['Read', 'Glob', 'Grep'],
    model: 'claude-sonnet-4-6',
    temperature: 0.6,
    maxTokens: 4096,
    variables: {
      code: '需要文档化的代码',
      context: '项目背景和架构信息',
    },
  },
  'refactor-expert': {
    name: 'refactor-expert',
    description: '重构专家 - 安全地重构代码，改善设计而不改变行为',
    systemPrompt: `你是一个代码重构专家。你的任务是安全地重构代码，改善内部结构而不改变外部行为。

## 重构手法
1. **提取函数**：将过长函数拆分为小函数
2. **内联临时变量**：消除不必要的中间变量
3. **移动函数**：将函数移到更合适的类/模块
4. **替换算法**：用更清晰的实现替换复杂逻辑
5. **引入参数对象**：将参数组封装为对象

## 安全规则
- 重构前确保有测试覆盖
- 每次只做一个小步骤
- 重构后立即运行测试
- 不改变公共API签名（除非必要）
- 保留原有注释和文档

## 输入
{code}

## 重构目标
{goal}

## 输出
展示重构前后的代码对比，说明每个步骤的理由。`,
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'Edit'],
    model: 'claude-sonnet-4-6',
    temperature: 0.3,
    maxTokens: 4096,
    variables: {
      code: '待重构的代码',
      goal: '重构目标（如：降低复杂度、提高可测试性）',
    },
  },
  'security-auditor': {
    name: 'security-auditor',
    description: '安全审计专家 - 发现安全漏洞、OWASP Top 10 风险',
    systemPrompt: `你是一个安全审计专家，专注于发现代码中的安全漏洞。

## 检查范围（OWASP Top 10）
1. **注入攻击**：SQL注入、命令注入、LDAP注入
2. **身份认证**：弱密码策略、会话固定、凭证泄露
3. **敏感数据**：明文传输、弱加密、日志泄露
4. **XXE**：XML外部实体注入
5. **访问控制**：越权访问、目录遍历
6. **安全配置**：默认配置、暴露堆栈信息
7. **XSS**：反射型、存储型、DOM型
8. **反序列化**：不安全的反序列化
9. **已知漏洞**：依赖组件的CVE
10. **日志监控**：缺少审计日志

## 输入
{code}

## 上下文
{context}

## 输出格式
按严重程度分级：Critical / High / Medium / Low
每个漏洞包含：描述、影响、修复建议、代码示例`,
    tools: ['Read', 'Glob', 'Grep', 'Bash'],
    model: 'claude-sonnet-4-6',
    temperature: 0.2,
    maxTokens: 4096,
    variables: {
      code: '待审计的代码',
      context: '应用的部署环境和架构',
    },
  },
  'debug-specialist': {
    name: 'debug-specialist',
    description: '调试专家 - 系统性诊断和修复Bug',
    systemPrompt: `你是一个高级调试专家。你的任务是系统性诊断和修复软件缺陷。

## 调试方法论
1. **复现问题**：确认Bug的触发条件
2. **缩小范围**：二分法排查、排除无关代码
3. **根因分析**：5 Whys、鱼骨图
4. **制定修复方案**：最小化变更、避免引入新问题
5. **验证修复**：确认修复有效且不破坏已有功能

## 常见Bug类型
- 逻辑错误：条件判断错误、循环边界、运算符优先级
- 数据错误：类型转换、精度丢失、编码问题
- 时序错误：竞态条件、死锁、活锁
- 资源错误：内存泄漏、文件句柄泄漏、连接池耗尽
- 配置错误：环境变量、路径、权限

## 输入
{error_message}

## 相关代码
{code}

## 输出
根因分析 + 修复方案 + 预防措施`,
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'Edit'],
    model: 'claude-sonnet-4-6',
    temperature: 0.3,
    maxTokens: 4096,
    variables: {
      error_message: '错误信息或堆栈追踪',
      code: '出错的代码段',
    },
  },
}

const AVAILABLE_TOOLS = [
  'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Agent',
  'WebFetch', 'WebSearch', 'Browser', 'NotebookEdit',
  'TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate',
  'MemoryRead', 'MemoryWrite',
]

// ============================================================================
// Helpers
// ============================================================================

function ensureAgentsDir(): void {
  if (!existsSync(AGENTS_DIR)) {
    mkdirSync(AGENTS_DIR, { recursive: true })
  }
}

function getAgentPath(name: string): string {
  return join(AGENTS_DIR, `${name}.json`)
}

function loadAgent(name: string): AgentConfig | null {
  const path = getAgentPath(name)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as AgentConfig
  } catch {
    return null
  }
}

function saveAgent(config: AgentConfig): void {
  ensureAgentsDir()
  const path = getAgentPath(config.name)
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8')
}

function listAgents(): AgentConfig[] {
  ensureAgentsDir()
  const files = readdirSync(AGENTS_DIR)
  const agents: AgentConfig[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const content = readFileSync(join(AGENTS_DIR, file), 'utf-8')
      agents.push(JSON.parse(content) as AgentConfig)
    } catch { /* skip invalid */ }
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name))
}

function deleteAgent(name: string): boolean {
  const path = getAgentPath(name)
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}

function getTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

// ============================================================================
// Interactive Prompt (simulated via readline)
// ============================================================================

function createInterface() {
  return {
    question(prompt: string): Promise<string> {
      return new Promise((resolve) => {
        process.stdout.write(prompt)
        let buf = ''
        const onData = (chunk: Buffer) => {
          buf += chunk.toString()
          if (buf.includes('\n')) {
            process.stdin.removeListener('data', onData)
            process.stdin.pause()
            resolve(buf.trim())
          }
        }
        process.stdin.setRawMode?.(false)
        process.stdin.resume()
        process.stdin.on('data', onData)
      })
    },
    close() { /* noop */ },
  }
}

// ============================================================================
// Sub-command Handlers
// ============================================================================

async function handleCreate(args: string): Promise<string> {
  const name = args.trim()

  if (!name) {
    return `❌ 请指定 Agent 名称\n\n用法: /agent-new create <名称>\n示例: /agent-new create my-reviewer`
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return `❌ 名称只能包含字母、数字、连字符和下划线: "${name}"`
  }

  if (loadAgent(name)) {
    return `❌ Agent "${name}" 已存在\n\n使用 \`/agent-new edit ${name}\` 编辑，或先 \`/agent-new delete ${name}\` 删除`
  }

  const lines: string[] = []
  lines.push(`🤖 创建新 Agent: ${name}`)
  lines.push(``)
  lines.push(`是否从模板创建？可选模板:`)
  lines.push(``)

  const templateKeys = Object.keys(BUILTIN_TEMPLATES)
  for (let i = 0; i < templateKeys.length; i++) {
    const t = BUILTIN_TEMPLATES[templateKeys[i]]
    lines.push(`  ${i + 1}. ${t.name} - ${t.description}`)
  }
  lines.push(`  0. 从零开始创建`)
  lines.push(``)
  lines.push(`请输入编号 (0-${templateKeys.length}): `)

  // In interactive mode, ask for template selection
  // For non-interactive, create from first template or empty
  const isNonInteractive = process.env['CLAUDE_CODE_NON_INTERACTIVE'] === '1' || !process.stdin.isTTY

  if (isNonInteractive) {
    // Non-interactive: create a basic agent
    const config: AgentConfig = {
      name,
      description: `自定义 Agent: ${name}`,
      systemPrompt: `你是 ${name}。请根据用户指令完成任务。`,
      tools: ['Read', 'Glob', 'Grep', 'Bash'],
      model: 'claude-sonnet-4-6',
      temperature: 0.5,
      maxTokens: 4096,
      variables: {},
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    }
    saveAgent(config)
    lines.push(`(非交互模式 - 创建基础 Agent)`)
    lines.push(``)
    lines.push(formatAgentCard(config))
    lines.push(``)
    lines.push(`✅ Agent "${name}" 已创建: ${getAgentPath(name)}`)
    lines.push(`💡 使用 \`/agent-new edit ${name}\` 自定义配置`)
    return lines.join('\n')
  }

  // Interactive mode
  const rl = createInterface()
  const answer = await rl.question('')
  rl.close()

  const choice = parseInt(answer, 10)
  let template: AgentTemplate | null = null

  if (choice >= 1 && choice <= templateKeys.length) {
    template = BUILTIN_TEMPLATES[templateKeys[choice - 1]]
  }

  if (template) {
    const config: AgentConfig = {
      ...template,
      name,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
      template: template.name,
    }
    saveAgent(config)
    lines.push(``)
    lines.push(`📋 基于模板: ${template.name}`)
    lines.push(``)
    lines.push(formatAgentCard(config))
    lines.push(``)
    lines.push(`✅ Agent "${name}" 已创建: ${getAgentPath(name)}`)
    return lines.join('\n')
  }

  // Create from scratch
  const config: AgentConfig = {
    name,
    description: '',
    systemPrompt: '',
    tools: ['Read', 'Glob', 'Grep'],
    model: 'claude-sonnet-4-6',
    temperature: 0.5,
    maxTokens: 4096,
    variables: {},
    createdAt: getTimestamp(),
    updatedAt: getTimestamp(),
  }

  // Prompt for description
  lines.push(``)
  process.stdout.write('请输入描述: ')
  const descRl = createInterface()
  config.description = await descRl.question('')
  descRl.close()

  // Prompt for system prompt
  process.stdout.write('请输入系统提示词 (输入 END 结束): ')
  const sysRl = createInterface()
  const sysAnswer = await sysRl.question('')
  sysRl.close()
  config.systemPrompt = sysAnswer === 'END' ? '' : sysAnswer

  saveAgent(config)
  lines.push(``)
  lines.push(formatAgentCard(config))
  lines.push(``)
  lines.push(`✅ Agent "${name}" 已创建: ${getAgentPath(name)}`)
  return lines.join('\n')
}

function handleList(args: string): string {
  const agents = listAgents()
  const json = args.includes('--json')
  const nameFilter = args.replace('--json', '').trim()

  if (json) {
    return JSON.stringify(agents, null, 2)
  }

  const filtered = nameFilter
    ? agents.filter(a => a.name.includes(nameFilter) || a.description.includes(nameFilter))
    : agents

  if (filtered.length === 0) {
    return `📭 暂无自定义 Agent\n\n💡 创建 Agent: /agent-new create <名称>\n💡 查看模板: /agent-new templates`
  }

  const lines: string[] = []
  lines.push(`🤖 自定义 Agent 列表 (${filtered.length} 个)`)
  lines.push(``)

  for (const agent of filtered) {
    lines.push(formatAgentCard(agent))
    lines.push(``)
  }

  lines.push(`📂 存储位置: ${AGENTS_DIR}`)
  lines.push(`💡 操作: /agent-new edit <名称> | /agent-new delete <名称> | /agent-new use <名称>`)
  return lines.join('\n')
}

function handleEdit(args: string): string {
  const name = args.trim()

  if (!name) {
    return `❌ 请指定要编辑的 Agent 名称\n\n用法: /agent-new edit <名称>`
  }

  const agent = loadAgent(name)
  if (!agent) {
    return `❌ Agent "${name}" 不存在\n\n💡 查看列表: /agent-new list`
  }

  // Edit specific field
  const lines: string[] = []
  lines.push(`✏️ 编辑 Agent: ${name}`)
  lines.push(``)
  lines.push(`当前配置:`)
  lines.push(formatAgentCard(agent))
  lines.push(``)
  lines.push(`📂 配置文件: ${getAgentPath(name)}`)
  lines.push(`💡 直接编辑 JSON 文件以修改详细配置`)
  lines.push(``)
  lines.push(`🔧 快速操作:`)
  lines.push(`  /agent-new use ${name} <任务>  使用此 Agent 执行任务`)
  lines.push(`  /agent-new export ${name}     导出配置`)

  return lines.join('\n')
}

function handleDelete(args: string): string {
  const name = args.trim()

  if (!name) {
    return `❌ 请指定要删除的 Agent 名称\n\n用法: /agent-new delete <名称>`
  }

  const agent = loadAgent(name)
  if (!agent) {
    return `❌ Agent "${name}" 不存在`
  }

  const success = deleteAgent(name)
  if (success) {
    return `🗑️ Agent "${name}" 已删除\n\n📋 已删除配置:\n   名称: ${agent.name}\n   描述: ${agent.description}\n   文件: ${getAgentPath(name)}`
  }
  return `❌ 删除失败: ${name}`
}

function handleUse(args: string): string {
  const parts = args.trim().split(/\s+/)
  const name = parts[0]
  const task = parts.slice(1).join(' ')

  if (!name) {
    return `❌ 请指定要使用的 Agent 名称\n\n用法: /agent-new use <名称> [任务描述]`
  }

  const agent = loadAgent(name)
  if (!agent) {
    return `❌ Agent "${name}" 不存在\n\n💡 查看列表: /agent-new list`
  }

  const lines: string[] = []
  lines.push(`🚀 使用 Agent: ${name}`)
  lines.push(``)
  lines.push(formatAgentCard(agent))
  lines.push(``)

  if (!task) {
    lines.push(`💡 请提供任务描述:\n   /agent-new use ${name} <任务描述>`)
    return lines.join('\n')
  }

  // Build the prompt with variable substitution
  let prompt = agent.systemPrompt
  prompt = prompt.replace(/\{code\}/g, task)
  prompt = prompt.replace(/\{file\}/g, task)
  prompt = prompt.replace(/\{context\}/g, `当前工作目录: ${process.cwd()}`)
  prompt = prompt.replace(/\{goal\}/g, task)
  lines.push(`📝 任务: ${task}`)
  lines.push(``)
  lines.push(`📋 处理后提示词预览 (前200字符):`)
  lines.push(`   ${prompt.slice(0, 200)}${prompt.length > 200 ? '...' : ''}`)
  lines.push(``)
  lines.push(`🤖 模型: ${agent.model}`)
  lines.push(`🌡️ 温度: ${agent.temperature}`)
  lines.push(`🔧 工具: ${agent.tools.join(', ')}`)
  lines.push(``)
  lines.push(`💡 提示: 此 Agent 的配置已准备好，模型将使用以上系统提示词执行任务`)
  lines.push(`  在实际运行中，Agent 会以 ${agent.model} 模型和指定工具执行: ${task}`)

  return lines.join('\n')
}

function handleExport(args: string): string {
  const name = args.trim()

  if (!name) {
    return `❌ 请指定要导出的 Agent 名称\n\n用法: /agent-new export <名称>`
  }

  const agent = loadAgent(name)
  if (!agent) {
    return `❌ Agent "${name}" 不存在`
  }

  const exportJson = JSON.stringify(agent, null, 2)
  const exportPath = resolve(process.cwd(), `${name}-agent.json`)

  try {
    writeFileSync(exportPath, exportJson, 'utf-8')
    return [
      `📦 Agent "${name}" 已导出`,
      ``,
      `📂 导出文件: ${exportPath}`,
      ``,
      `配置内容:`,
      '```json',
      exportJson,
      '```',
      ``,
      `💡 导入: /agent-new import ${exportPath}`,
    ].join('\n')
  } catch (err) {
    return `❌ 导出失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

function handleImport(args: string): string {
  const filePath = args.trim()

  if (!filePath) {
    return `❌ 请指定要导入的文件路径\n\n用法: /agent-new import <文件路径>`
  }

  const absPath = resolve(process.cwd(), filePath)

  if (!existsSync(absPath)) {
    return `❌ 文件不存在: ${absPath}`
  }

  let imported: AgentConfig
  try {
    const content = readFileSync(absPath, 'utf-8')
    imported = JSON.parse(content) as AgentConfig
  } catch (err) {
    return `❌ 解析失败: ${err instanceof Error ? err.message : String(err)}`
  }

  // Validate required fields
  if (!imported.name || !imported.systemPrompt) {
    return `❌ 无效的 Agent 配置: 缺少必填字段 (name, systemPrompt)`
  }

  // Check if already exists
  if (loadAgent(imported.name)) {
    return `⚠️ Agent "${imported.name}" 已存在\n\n使用 \`/agent-new delete ${imported.name}\` 先删除，或重命名后导入`
  }

  // Ensure tools is an array
  if (!imported.tools) imported.tools = []
  if (!imported.variables) imported.variables = {}
  if (!imported.model) imported.model = 'claude-sonnet-4-6'
  if (imported.temperature === undefined) imported.temperature = 0.5
  if (!imported.maxTokens) imported.maxTokens = 4096
  if (!imported.createdAt) imported.createdAt = getTimestamp()
  imported.updatedAt = getTimestamp()

  saveAgent(imported)

  return [
    `📥 Agent "${imported.name}" 已导入`,
    ``,
    formatAgentCard(imported),
    ``,
    `📂 存储位置: ${getAgentPath(imported.name)}`,
    `💡 使用: /agent-new use ${imported.name} <任务>`,
  ].join('\n')
}

function handleTemplates(): string {
  const lines: string[] = []
  lines.push(`📋 内置 Agent 模板 (${Object.keys(BUILTIN_TEMPLATES).length} 个)`)
  lines.push(``)

  for (const [key, template] of Object.entries(BUILTIN_TEMPLATES)) {
    lines.push(`  ┌─ ${template.name} ─────────────────────────────`)
    lines.push(`  │ ${template.description}`)
    lines.push(`  │ 🤖 模型: ${template.model} | 🌡️ 温度: ${template.temperature}`)
    lines.push(`  │ 🔧 工具: ${template.tools.join(', ')}`)
    lines.push(`  │ 📐 变量: ${Object.keys(template.variables).map(v => `{${v}}`).join(', ') || '无'}`)
    lines.push(`  └─────────────────────────────────────────────────`)
    lines.push(``)
  }

  lines.push(`💡 基于模板创建: /agent-new create <名称>`)
  lines.push(`  创建时会提示选择模板编号`)

  return lines.join('\n')
}

// ============================================================================
// Formatter
// ============================================================================

function formatAgentCard(agent: AgentConfig): string {
  const lines: string[] = []
  lines.push(`  ┌─ 🤖 ${agent.name} ─────────────────────────────`)
  if (agent.description) {
    lines.push(`  │ 📝 ${agent.description}`)
  }
  if (agent.template) {
    lines.push(`  │ 📋 模板: ${agent.template}`)
  }
  lines.push(`  │ 🤖 模型: ${agent.model}`)
  lines.push(`  │ 🌡️ 温度: ${agent.temperature} | 📊 最大Token: ${agent.maxTokens}`)
  lines.push(`  │ 🔧 工具: ${agent.tools.join(', ') || '无'}`)
  const varKeys = Object.keys(agent.variables)
  if (varKeys.length > 0) {
    lines.push(`  │ 📐 变量: ${varKeys.map(v => `{${v}}`).join(', ')}`)
  }
  lines.push(`  │ 🕐 创建: ${agent.createdAt}`)
  lines.push(`  │ 🕐 更新: ${agent.updatedAt}`)
  lines.push(`  └─────────────────────────────────────────────────`)
  return lines.join('\n')
}

// ============================================================================
// Help
// ============================================================================

function renderHelp(): string {
  return [
    `🤖 Agent 管理命令 - /agent-new`,
    ``,
    `创建、管理和使用自定义 AI Agent。每个 Agent 是一个独立的配置文件，`,
    `包含系统提示词、工具列表和模型偏好。`,
    ``,
    `用法:`,
    `  /agent-new <子命令> [参数]`,
    ``,
    `子命令:`,
    `  create <名称>        交互式创建新 Agent（支持模板选择）`,
    `  list [--json]        列出所有自定义 Agent`,
    `  edit <名称>          查看和编辑 Agent 配置`,
    `  delete <名称>        删除 Agent`,
    `  use <名称> [任务]    使用指定 Agent 执行任务`,
    `  export <名称>        导出 Agent 配置到当前目录`,
    `  import <文件>        从 JSON 文件导入 Agent 配置`,
    `  templates            列出内置模板`,
    `  help                 显示帮助`,
    ``,
    `选项:`,
    `  --json               以 JSON 格式输出`,
    ``,
    `示例:`,
    `  /agent-new create my-reviewer          从头创建新 Agent`,
    `  /agent-new list                       列出所有 Agent`,
    `  /agent-new list --json                JSON 格式输出`,
    `  /agent-new edit my-reviewer           编辑 Agent 配置`,
    `  /agent-new use my-reviewer 审查此代码 执行任务`,
    `  /agent-new export my-reviewer         导出配置`,
    `  /agent-new import ./reviewer.json     导入配置`,
    ``,
    `模板:`,
    `  code-reviewer       代码审查专家`,
    `  test-generator      测试生成专家`,
    `  doc-writer          文档编写专家`,
    `  refactor-expert     重构专家`,
    `  security-auditor    安全审计专家`,
    `  debug-specialist    调试专家`,
    ``,
    `存储:`,
    `  Agent 配置存储在 ~/.doge/agents/ 目录`,
    `  每个 Agent 是一个独立的 JSON 文件`,
    ``,
    `变量替换:`,
    `  系统提示词中可使用以下变量:`,
    `  {code}      待处理的代码`,
    `  {file}      目标文件路径`,
    `  {context}   代码库上下文`,
    `  {goal}      任务目标`,
    `  {error_message}  错误信息`,
  ].join('\n')
}

// ============================================================================
// Main Command
// ============================================================================

export const call: LocalCommandCall = async (args, context) => {
  const s = (args ?? '').trim()
  const parts = s.match(/^(\S+)\s*([\s\S]*)$/)
  const subCommand = parts?.[1]?.toLowerCase() ?? ''
  const subArgs = parts?.[2] ?? ''

  switch (subCommand) {
    case 'create':
      return { type: 'text', value: await handleCreate(subArgs) }
    case 'list':
    case 'ls':
      return { type: 'text', value: handleList(subArgs) }
    case 'edit':
      return { type: 'text', value: handleEdit(subArgs) }
    case 'delete':
    case 'rm':
    case 'remove':
      return { type: 'text', value: handleDelete(subArgs) }
    case 'use':
      return { type: 'text', value: handleUse(subArgs) }
    case 'export':
      return { type: 'text', value: handleExport(subArgs) }
    case 'import':
      return { type: 'text', value: handleImport(subArgs) }
    case 'templates':
    case 'template':
    case 'tmpl':
      return { type: 'text', value: handleTemplates() }
    case 'help':
    case '--help':
    case '-h':
    case '':
    default:
      return { type: 'text', value: renderHelp() }
  }
}

// ============================================================================
// Command Definition
// ============================================================================

const command: Command = {
  type: 'local',
  name: 'agent-new',
  description: '自定义 Agent 管理 - 创建、编辑、删除、使用 Agent 配置',
  aliases: ['/agent-new', '/agent-new'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default command
