import type { Command } from '../commands.js'

const ALLOWED_TOOLS = [
  'Bash(*)',
  'FileRead(*)',
  'Grep(*)',
  'Glob(*)',
]

function getPromptContent(args: string): string {
  const target = args?.trim() || ''
  return `## 任务：诊断问题并给出修复方案

你是一个智能诊断引擎。你的任务是分析用户遇到的问题（编译错误、测试失败、运行时异常等），找出根因并给出修复方案。

### 目标
${target ? `诊断以下问题：\n\`${target}\`` : '分析最近一次构建/测试运行的错误输出'}

### 诊断步骤

1. **收集错误信息**：
   - 如果有具体的错误消息或堆栈跟踪，仔细分析它
   - 查找最近生成的错误日志文件
   - 检查 build/ 或 dist/ 目录的编译输出
   - 运行 \`git diff\` 查看最近的代码变更（如果知道问题是因为修改引起的）

2. **根因分析**：
   - 错误类型分类：
     * 🔴 编译错误（语法错误、类型不匹配、缺少依赖）
     * 🟡 测试失败（断言失败、超时、环境问题）
     * 🔵 运行时错误（崩溃、异常、性能问题）
     * ⚪ 配置错误（缺少配置、格式错误）
   - 推断可能的原因链（A 导致 B 导致 C）
   - 如果是编译/类型错误，提取具体文件和行号

3. **修复方案**：
   - 给出具体的修复步骤（可执行的命令）
   - 按优先级排列（快速修复方案在前）
   - 每个修复方案附带解释说明

### 输出格式

\`\`\`
🔍 诊断结果

🛑 错误类型: <类型>
📁 问题位置: <文件:行号（如果有）>
💢 错误信息: <提取的核心错误消息>

🔎 根因分析
<逐步推理出问题根源>

🛠 修复方案

方案 1（推荐）:
<具体修复步骤>
\`\`\`
\`\`\`bash
# 可执行的修复命令
\`\`\`

方案 2（备选）:
<另一个修复思路>

✅ 验证方法
<如何确认问题已修复>
\`\`\``
}

const command = {
  type: 'prompt',
  name: 'diagnose',
  description: '诊断编译/测试错误并给出修复方案',
  allowedTools: ALLOWED_TOOLS,
  contentLength: 0,
  progressMessage: '正在诊断问题',
  source: 'builtin',
  getPromptForCommand(args: string): string {
    return getPromptContent(args || '')
  },
} satisfies Command

export default command
