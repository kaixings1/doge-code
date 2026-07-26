export const predefinedAgents = {
    "code-reviewer": {
        name: "code-reviewer",
        description: "审查代码中的缺陷、安全问题及最佳实践",
        systemPrompt: "你是一位代码审查员。识别缺陷、安全漏洞，提出改进建议，确保遵循最佳实践。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "grep", "glob"],
        maxTokens: 4000,
    },
    "test-generator": {
        name: "test-generator",
        description: "为代码生成单元测试",
        systemPrompt: "你是一位测试生成器。分析代码，生成全面的测试，覆盖边界情况。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "file_write", "bash"],
        maxTokens: 6000,
    },
    "doc-generator": {
        name: "doc-generator",
        description: "为代码生成文档",
        systemPrompt: "你是一位文档生成器。分析结构，生成带示例的清晰文档。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "file_write", "grep"],
        maxTokens: 4000,
    },
    refactorer: {
        name: "refactorer",
        description: "重构代码以提升质量",
        systemPrompt: "你是一位代码重构师。识别改进点，应用设计模式，保持功能不变。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "file_write", "bash", "grep"],
        maxTokens: 8000,
    },
};
