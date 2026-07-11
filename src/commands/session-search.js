const ALLOWED_TOOLS = [
    'Bash(grep:*)',
    'Bash(find:*)',
    'Bash(cat:*)',
    'Bash(ls:*)',
];
function getPromptContent(searchTerm) {
    return `## 任务：搜索历史会话

用户想要搜索包含以下关键词的历史会话：
\`${searchTerm}\`

请在会话存储目录中搜索包含此关键词的会话文件。

### 会话存储路径

会话文件存储在以下目录：
- \`~/.doge/sessions/\`（或 \`~/.claude/sessions/\`）
- 每个会话是一个 JSONL 文件，文件名格式为 \`<uuid>.jsonl\`

### 搜索步骤

1. 找到会话存储目录（检查 \`~/.doge/sessions/\` 和 \`~/.claude/sessions/\`）
2. 使用 grep 搜索包含关键词的会话文件
3. 对匹配的文件，读取文件头部获取会话标题和摘要信息
4. 以列表形式返回结果：会话标题、文件路径、匹配的片段

### 注意事项
- 会话文件可能很大，搜索时注意性能
- 返回找到的会话总数和前 10 个最相关的会话
- 对每个匹配会话，展示匹配的关键上下文片段（前后各 50 个字符）`;
}
const command = {
    type: 'prompt',
    name: 'session-search',
    description: '按内容关键词搜索历史会话',
    allowedTools: ALLOWED_TOOLS,
    contentLength: 0,
    progressMessage: '正在搜索历史会话',
    source: 'builtin',
    getPromptForCommand(args) {
        return getPromptContent(args || '');
    },
};
export default command;
