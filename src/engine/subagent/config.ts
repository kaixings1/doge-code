/**
 * engine/subagent/config.ts — 子代理配置（文档 02 §10.3）
 *
 * 对齐 OpenCode agent 配置格式，支持更丰富的 Agent 元数据。
 */
export interface SubAgentConfig {
  name: string;
  description: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  allowedTools?: string[];
  maxIterations?: number;
  timeout?: number;
  accessParentContext?: boolean;
  /** OpenCode 特性吸收: Agent 工具使用权限级别 */
  toolPermission?: 'read' | 'write' | 'full';
  /** OpenCode 特性吸收: 是否允许 Agent 创建子代理 */
  canSpawnSubagents?: boolean;
  /** OpenCode 特性吸收: Agent 模式标识（plan / build / explore） */
  mode?: 'plan' | 'build' | 'explore';
}

export const predefinedAgents: Record<string, SubAgentConfig> = {
  "code-reviewer": {
    name: "code-reviewer",
    description: "审查代码中的缺陷、安全问题及最佳实践",
    systemPrompt:
      "你是一位资深代码审查员。使用多角度审查法：逐行扫描 diff，检查 null/undefined 解引用、条件反转、off-by-one、缺失 await、错误被 catch 吞掉、未转义正则元字符。对每个变更的函数，审查其未变更行中是否存在被重新暴露的 bug。关注安全漏洞、并发问题、资源泄漏。给出具体行号、问题描述和修复建议。",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read", "grep", "glob", "bash"],
    maxTokens: 8000,
    maxIterations: 10,
    mode: "explore",
  },
  "test-generator": {
    name: "test-generator",
    description: "为代码生成单元测试",
    systemPrompt:
      "你是一位测试工程师。分析目标代码的函数签名、边界条件和副作用。生成覆盖以下场景的测试：正常路径、边界值（0、空、极大值）、错误输入、状态转换。使用项目已有的测试框架。测试应独立、可重复、有明确断言。",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read", "file_write", "bash", "grep"],
    maxTokens: 6000,
  },
  "doc-generator": {
    name: "doc-generator",
    description: "为代码生成文档",
    systemPrompt:
      "你是一位技术文档工程师。分析代码的公共接口、类型定义和业务逻辑。生成包含以下内容的文档：函数/类用途说明、参数和返回值描述、使用示例、异常说明。优先使用 JSDoc/TSDoc 格式，内联到源码中。",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read", "file_write", "grep"],
    maxTokens: 4000,
  },
  refactorer: {
    name: "refactorer",
    description: "重构代码以提升质量",
    systemPrompt:
      "你是一位代码重构专家。识别重复代码、过长函数、深层嵌套、魔法值等问题。应用适当的重构模式：提取函数、提取类、引入参数对象、替换条件分支为策略模式。每次只做一个变更，保持行为不变。解释每次重构的原因。",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read", "file_write", "bash", "grep"],
    maxTokens: 8000,
    mode: "build",
  },
  "explore-agent": {
    name: "explore-agent",
    description: "只读搜索：在代码库中定位文件、符号和模式",
    systemPrompt:
      "你是一位代码库搜索专家。使用 glob 按模式查找文件，使用 grep 搜索符号和关键词，使用 Read 查看文件内容。根据搜索广度调整策略：quick（单一定位）、medium（适度探索）、very thorough（多位置/多命名约定搜索）。只读模式，不修改任何文件。",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read", "grep", "glob", "bash"],
    maxTokens: 4000,
    mode: "explore",
    accessParentContext: false,
  },
  summarizer: {
    name: "summarizer",
    description: "生成对话摘要和上下文压缩",
    systemPrompt:
      "你是一位会话摘要专家。分析对话历史，提取关键信息：已完成的工作、当前进展、待办事项、涉及的文件、下一步计划。生成简洁但信息完整的摘要，保留后续对话所需的上下文。区分事实（已完成的工作）和状态（当前状态）。",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read"],
    maxTokens: 4000,
  },
};
