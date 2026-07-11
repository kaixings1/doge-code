const ALLOWED_TOOLS = [
    'Bash(*)',
    'FileRead(*)',
    'FileEdit(*)',
    'FileWrite(*)',
    'MultiFileEdit(*)',
    'Glob(*)',
    'Grep(*)',
];
function getPromptContent(args) {
    const firstArg = (args || '').trim().split(/\s+/)[0] || '';
    const rest = (args || '').trim().split(/\s+/).slice(1).join(' ');
    const extractMode = firstArg === 'extract';
    const renameMode = firstArg === 'rename';
    const extractFileMode = firstArg === 'extract-file';
    const optimizeMode = firstArg === 'optimize';
    let modeGuide = '';
    if (extractMode) {
        modeGuide = '提取重构：从代码中提取函数/类/模块\n目标: ' + (rest || '需要指定') + '\n1.识别要提取的代码块 2.创建新文件 3.用调用替换原代码 4.更新所有引用 5.运行编译检查';
    }
    else if (renameMode) {
        modeGuide = '重命名重构：重命名符号并更新所有引用\n目标: ' + (rest || '需要指定 old -> new') + '\n1.grep搜索所有引用 2.MultiFileEdit同时更新 3.运行编译检查';
    }
    else if (extractFileMode) {
        modeGuide = '提取文件：将大文件拆分为多个小文件\n目标: ' + (rest || '需要指定文件') + '\n1.分析导出项 2.按职责分组 3.创建新文件维护import链 4.源文件改为re-export';
    }
    else if (optimizeMode) {
        modeGuide = '性能优化：分析代码性能瓶颈\n检查: 循环嵌套、重复计算、大对象拷贝、N+1查询\n目标: ' + (rest || '需要指定文件');
    }
    else {
        modeGuide = '可用操作:\n- extract <源文件> <新函数> - 提取函数/类\n- rename <旧名> -> <新名> - 重命名符号\n- extract-file <文件> - 拆分大文件\n- optimize <文件> - 性能优化\n- <自由描述> - 自定义需求';
    }
    return `## 任务：代码重构

你是一个代码重构专家。分析并重构代码，提高代码质量、可维护性和性能，保持功能不变。

### 重构类型
${modeGuide}

### 通用重构步骤
1. 分析代码：读取目标文件，理解结构和功能
2. 制定计划：列出需要做的变更和受影响的文件
3. 执行重构：保持代码语义不变
4. 验证：运行编译检查和已有测试

### 重要原则
- 重构不改变外部行为
- 保持向后兼容
- 每次只做一种重构
- 完成后清除旧的/冗余的代码`;
}
const command = {
    type: 'prompt',
    name: 'refactor',
    description: '智能代码重构：提取/重命名/拆分/性能优化',
    allowedTools: ALLOWED_TOOLS,
    contentLength: 0,
    progressMessage: '正在分析重构方案',
    source: 'builtin',
    getPromptForCommand(args) {
        return getPromptContent(args || '');
    },
};
export default command;
