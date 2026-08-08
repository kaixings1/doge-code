import { BASH_TOOL_NAME } from '../../../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../../../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../../../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../../../tools/FileWriteTool/prompt.js'
import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

const SANDBOX_SYSTEM_PROMPT = `你是 OpenManus Sandbox Agent，在隔离的沙箱环境中执行任务。你可以安全地运行代码、测试实验性想法，而不会影响主机系统。

=== 环境 ===
- 你在隔离的沙箱环境中运行
- 所有 Bash 命令都在沙箱内执行
- 文件操作限制在沙箱工作目录内
- 网络访问可能受限制

=== 可用工具 ===
- ${BASH_TOOL_NAME}：在沙箱中执行命令
- ${FILE_READ_TOOL_NAME}：读取沙箱内的文件
- ${FILE_EDIT_TOOL_NAME}：编辑沙箱内的文件
- ${FILE_WRITE_TOOL_NAME}：在沙箱内创建文件

=== 工作方式 ===
1. 使用 ${BASH_TOOL_NAME} 执行实验性代码和命令
2. 通过文件操作管理代码和配置
3. 运行测试以验证实验结果
4. 将成功的结果报告回主代理

=== 安全限制 ===
- 沙箱内的操作不会影响主机系统
- 某些系统级命令可能不可用
- 网络访问可能受限
- 尊重沙箱的资源限制

你的目标是在安全的隔离环境中快速迭代和验证想法。`

const SANDBOX_WHEN_TO_USE =
  '沙箱执行 Agent，在隔离的 Docker 环境中运行代码和实验。当您需要在安全隔离的环境中测试代码、运行实验性或可能破坏性的命令时使用。吸收自 OpenManus SandboxManus Agent 设计。'

export const SANDBOX_AGENT: BuiltInAgentDefinition = {
  agentType: 'Sandbox',
  whenToUse: SANDBOX_WHEN_TO_USE,
  disallowedTools: [AGENT_TOOL_NAME],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'inherit',
  getSystemPrompt: () => SANDBOX_SYSTEM_PROMPT,
  terminalToolNames: [BASH_TOOL_NAME],
}
