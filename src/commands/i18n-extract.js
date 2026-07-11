const ALLOWED_TOOLS = [
    'Bash(*)',
    'FileRead(*)',
    'FileEdit(*)',
    'FileWrite(*)',
    'Glob(*)',
    'Grep(*)',
];
function getPromptContent(args) {
    const firstArg = (args || '').trim().split(/\s+/)[0] || '';
    const rest = (args || '').trim().split(/\s+/).slice(1).join(' ');
    const initMode = firstArg === 'init';
    const extractMode = firstArg === 'extract';
    const syncMode = firstArg === 'sync';
    let modeGuide = '';
    if (initMode) {
        modeGuide = `初始化国际化框架
1. 检测项目类型（TS/Node/Python/Rust/Go）
2. 推荐框架：
   - TS/Node: i18next + Bun runtime
   - Python: gettext + Babel
   - Go: go-i18n
   - Rust: fluent
3. 创建 locales/zh-CN/common.json 等翻译文件
4. 安装依赖并初始化入口
5. 提供使用示例代码`;
    }
    else if (syncMode) {
        modeGuide = `同步翻译文件
1. 读取 locales/ 目录下的所有翻译文件
2. 检查缺失的 key 和未使用的 key
3. 合并重复的字符串
4. 生成翻译进度报告（中文翻译完成度）`;
    }
    else if (extractMode || !firstArg) {
        const target = rest || '.claude/skills';
        modeGuide = `提取硬编码字符串
目标目录: ${target}
1. 搜索 UI 字符串（<Text>xxx</Text>、title/label/placeholder 等）
2. 生成唯一 key（module.section.description）
3. 写入 locales/zh-CN/common.json（追加模式）
4. 替换代码中的字符串为 i18n 调用（t('key')/_('key')）
5. 保留字符串中的模板变量（{name}、%s 等）`;
    }
    else {
        modeGuide = `可用命令:
- /i18n init         - 初始化国际化框架
- /i18n extract [目录] - 提取硬编码字符串（默认 .claude/skills）
- /i18n sync         - 同步检查翻译文件
- /i18n extract <文件> - 提取特定文件

示例:
- /i18n init                    # 初始化全栈项目 i18n
- /i18n extract src/components   # 提取 React 组件字符串
- /i18n extract . --dry-run      # 预览模式不修改文件`;
    }
    return `## 任务：国际化/本地化

你是一个 i18n 国际化专家。从代码中提取硬编码字符串，生成翻译文件，替换引用。

### 工作模式
${modeGuide}

### 重要规则
- 只替换 UI 展示字符串，不修改代码逻辑
- key 命名要有意义（模块.区域.描述），不用数字 ID
- 上下文相似的字符串合并为一个 key
- 保留字符串中的模板变量（{name}、%s 等）
- Bun 环境优先使用 bun 原生 i18n 方案
- 翻译文件格式务必保持 JSON 格式正确

### 输出格式
\`\`\`
📋 国际化报告
- 扫描文件数: <N>
- 提取字符串数: <N>
- 新增 key 数: <N>
- 覆盖率: <百分比>
\`\`\``;
}
const command = {
    type: 'prompt',
    name: 'i18n',
    aliases: ['i18n-extract'],
    description: '国际化支持：提取硬编码字符串，生成翻译文件',
    allowedTools: ALLOWED_TOOLS,
    contentLength: 0,
    progressMessage: '正在分析国际化字符串',
    source: 'builtin',
    getPromptForCommand(args) {
        return getPromptContent(args || '');
    },
};
export default command;
