export const call = async (onDone, context, args) => {
    const parts = args?.trim().split(/\s+/) || [];
    const command = parts[0]?.toLowerCase() || 'help';
    if (command === 'help' || command === '') {
        return {
            type: 'jsx',
            render: () => [
                '📦 依赖分析工具',
                '',
                '项目依赖分析与可视化工具。',
                '',
                '命令:',
                ' /dependency-analyzer overview - 项目概览',
                ' /dependency-analyzer stats - 依赖统计',
                ' /dependency-analyzer large - 大型依赖',
                ' /dependency-analyzer issues - 潜在问题',
                ' /dependency-analyzer help - 显示帮助',
                '',
                '示例:',
                ' /dependency-analyzer overview',
                ' /dependency-analyzer large',
                '',
                '分析内容:',
                ' • 依赖数量统计',
                ' • 大型依赖识别',
                ' • 潜在问题检测',
                ' • 优化建议'
            ].join('\n')
        };
    }
    if (command === 'overview') {
        return {
            type: 'jsx',
            render: () => [
                '📊 依赖分析概览',
                '',
                '这是一个占位实现。完整功能包括:',
                '',
                '1. package.json依赖分析',
                '2. 依赖关系可视化',
                '3. 未使用依赖检测',
                '4. 版本冲突检查',
                '',
                '当前命令:',
                command
            ].join('\n')
        };
    }
    return {
        type: 'jsx',
        render: () => `dependency-analyzer 功能开发中。当前命令: ${command}`
    };
};
