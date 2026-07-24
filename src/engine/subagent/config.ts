/**
 * engine/subagent/config.ts — 子代理配置（文档 02 §10.3）
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
}

export const predefinedAgents: Record<string, SubAgentConfig> = {
  "code-reviewer": {
    name: "code-reviewer",
    description: "Review code for bugs, security issues, and best practices",
    systemPrompt:
      "You are a code reviewer. Identify bugs, security vulnerabilities, suggest improvements, ensure best practices.",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read", "grep", "glob"],
    maxTokens: 4000,
  },
  "test-generator": {
    name: "test-generator",
    description: "Generate unit tests for code",
    systemPrompt: "You are a test generator. Analyze code, generate comprehensive tests, cover edge cases.",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read", "file_write", "bash"],
    maxTokens: 6000,
  },
  "doc-generator": {
    name: "doc-generator",
    description: "Generate documentation for code",
    systemPrompt: "You are a documentation generator. Analyze structure, generate clear docs with examples.",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read", "file_write", "grep"],
    maxTokens: 4000,
  },
  refactorer: {
    name: "refactorer",
    description: "Refactor code for better quality",
    systemPrompt: "You are a code refactorer. Identify improvements, apply patterns, preserve functionality.",
    model: "claude-3-5-sonnet-20241022",
    allowedTools: ["file_read", "file_write", "bash", "grep"],
    maxTokens: 8000,
  },
};