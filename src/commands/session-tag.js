const ALLOWED_TOOLS = [
    'Bash(grep:*)',
    'Bash(cat:*)',
    'Bash(head:*)',
    'Bash(tail:*)',
    'Bash(wc:*)',
    'Bash(ls:*)',
    'Bash(find:*)',
];
function getPromptContent() {
    return `## 任务：分析当前会话并生成标签

你是一个会话分析工具。你的任务是基于当前对话内容，生成结构化的会话摘要和标签。

### 分析目标

1. **会话概述**：总结本次对话做了什么
2. **标签分类**：用 3-5 个标签描述会话内容，标签格式为：
   - \`type:功能\`（如 \`feat:auth\`、\`fix:perf\`、\`refactor:api\`）
   - 类型前缀：feat / fix / refactor / docs / test / chore / perf
3. **关键文件**：列出本次会话中修改/创建的核心文件（最多 10 个）
4. **技术栈**：检测使用的技术栈（框架、语言、工具）

### 输出格式

\`\`\`
📋 会话摘要
- 目的: <一句话描述>
- 标签: <tag1>, <tag2>, <tag3>
- 涉及文件: <file1>, <file2>, ...
- 技术栈: <lang1>, <framework1>, ...

📊 变更统计
- 修改文件数: <N>
- 新增文件数: <N>
- 主要变更类型: <feat/fix/refactor/...>
\`\`\``;
}
const command = {
    type: 'prompt',
    name: 'session-tag',
    description: '分析当前会话并生成标签和摘要',
    allowedTools: ALLOWED_TOOLS,
    contentLength: 0,
    progressMessage: '正在分析会话内容',
    source: 'builtin',
    getPromptForCommand(_args, _context) {
        return getPromptContent();
    },
};
export default command;
