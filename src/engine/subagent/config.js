/**
 * engine/subagent/config.ts — 子代理配置（文档 02 §10.3）
 *
 * 对齐 OpenCode agent 配置格式，支持更丰富的 Agent 元数据。
 * 吸收自 Deep Agents AGENTS.md：Markdown frontmatter 驱动 Agent 定义。
 */
import { readFileSync } from 'fs';
import { parseYaml } from '../../utils/yaml.js';
export const predefinedAgents = {
    "code-reviewer": {
        name: "code-reviewer",
        description: "审查代码中的缺陷、安全问题及最佳实践",
        systemPrompt: "你是一位资深代码审查员。使用多角度审查法：逐行扫描 diff，检查 null/undefined 解引用、条件反转、off-by-one、缺失 await、错误被 catch 吞掉、未转义正则元字符。对每个变更的函数，审查其未变更行中是否存在被重新暴露的 bug。关注安全漏洞、并发问题、资源泄漏。给出具体行号、问题描述和修复建议。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "grep", "glob", "bash"],
        maxTokens: 8000,
        maxIterations: 10,
        mode: "explore",
    },
    "test-generator": {
        name: "test-generator",
        description: "为代码生成单元测试",
        systemPrompt: "你是一位测试工程师。分析目标代码的函数签名、边界条件和副作用。生成覆盖以下场景的测试：正常路径、边界值（0、空、极大值）、错误输入、状态转换。使用项目已有的测试框架。测试应独立、可重复、有明确断言。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "file_write", "bash", "grep"],
        maxTokens: 6000,
    },
    "doc-generator": {
        name: "doc-generator",
        description: "为代码生成文档",
        systemPrompt: "你是一位技术文档工程师。分析代码的公共接口、类型定义和业务逻辑。生成包含以下内容的文档：函数/类用途说明、参数和返回值描述、使用示例、异常说明。优先使用 JSDoc/TSDoc 格式，内联到源码中。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "file_write", "grep"],
        maxTokens: 4000,
    },
    refactorer: {
        name: "refactorer",
        description: "重构代码以提升质量",
        systemPrompt: "你是一位代码重构专家。识别重复代码、过长函数、深层嵌套、魔法值等问题。应用适当的重构模式：提取函数、提取类、引入参数对象、替换条件分支为策略模式。每次只做一个变更，保持行为不变。解释每次重构的原因。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "file_write", "bash", "grep"],
        maxTokens: 8000,
        mode: "build",
    },
    "explore-agent": {
        name: "explore-agent",
        description: "只读搜索：在代码库中定位文件、符号和模式",
        systemPrompt: "你是一位代码库搜索专家。使用 glob 按模式查找文件，使用 grep 搜索符号和关键词，使用 Read 查看文件内容。根据搜索广度调整策略：quick（单一定位）、medium（适度探索）、very thorough（多位置/多命名约定搜索）。只读模式，不修改任何文件。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "grep", "glob", "bash"],
        maxTokens: 4000,
        mode: "explore",
        accessParentContext: false,
    },
    summarizer: {
        name: "summarizer",
        description: "生成对话摘要和上下文压缩",
        systemPrompt: "你是一位会话摘要专家。分析对话历史，提取关键信息：已完成的工作、当前进展、待办事项、涉及的文件、下一步计划。生成简洁但信息完整的摘要，保留后续对话所需的上下文。区分事实（已完成的工作）和状态（当前状态）。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read"],
        maxTokens: 4000,
    },
    // 吸收自 developer/smol_dev (SMOL_DEV_SYSTEM_PROMPT)
    "ai-developer": {
        name: "ai-developer",
        description: "Top-tier AI 开发者：根据用户意图生成完整代码，不留任何 todo",
        systemPrompt: "你是一位顶级 AI 开发者。根据用户意图生成完整的程序代码，不要留下任何待办事项，完整实现每一个请求的功能。\n\n" +
            "编写代码时，添加注释来解释你的意图以及为什么它符合程序计划和原始提示中的具体指令。",
        model: "claude-3-5-sonnet-20241022",
        allowedTools: ["file_read", "file_write", "bash", "grep", "glob"],
        maxTokens: 8000,
        mode: "build",
    },
};
// ============================================================================
// Markdown Agent Definition Loader（吸收自 Deep Agents AGENTS.md frontmatter）
// ============================================================================
/**
 * 从 Markdown 文件加载 Agent 定义。
 *
 * 格式：
 *   ---
 *   name: agent-name
 *   description: 描述
 *   model: claude-3-5-sonnet-20241022
 *   allowedTools: [file_read, grep, glob]
 *   mode: explore
 *   ---
 *
 *   Markdown 正文作为 systemPrompt。
 */
export function loadAgentFromMarkdown(filePath) {
    try {
        const raw = readFileSync(filePath, 'utf-8');
        const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!match)
            return null;
        const frontmatter = parseYaml(match[1]);
        const body = match[2].trim();
        if (!frontmatter.name)
            return null;
        const cfg = {
            name: String(frontmatter.name),
            description: frontmatter.description ? String(frontmatter.description) : '',
        };
        if (body)
            cfg.systemPrompt = body;
        if (frontmatter.model)
            cfg.model = String(frontmatter.model);
        if (frontmatter.maxTokens)
            cfg.maxTokens = Number(frontmatter.maxTokens);
        if (frontmatter.allowedTools) {
            cfg.allowedTools = Array.isArray(frontmatter.allowedTools)
                ? frontmatter.allowedTools
                : String(frontmatter.allowedTools).split(',').map((s) => s.trim());
        }
        if (frontmatter.maxIterations)
            cfg.maxIterations = Number(frontmatter.maxIterations);
        if (frontmatter.timeout)
            cfg.timeout = Number(frontmatter.timeout);
        if (frontmatter.accessParentContext) {
            cfg.accessParentContext = String(frontmatter.accessParentContext) === 'true';
        }
        if (frontmatter.toolPermission) {
            cfg.toolPermission = frontmatter.toolPermission;
        }
        if (frontmatter.canSpawnSubagents) {
            cfg.canSpawnSubagents = String(frontmatter.canSpawnSubagents) === 'true';
        }
        if (frontmatter.mode) {
            cfg.mode = frontmatter.mode;
        }
        return cfg;
    }
    catch {
        return null;
    }
}
