import { getIsNonInteractiveSession } from '../../bootstrap/state.js';
const call = async (args) => {
    const action = args.trim().toLowerCase() || 'help';
    if (action === 'help' || action === '') {
        return {
            type: 'text',
            value: [
                '🐛 工具调用调试',
                '',
                '用法:',
                ' /debug-tool-call status — 查看当前调试状态',
                ' /debug-tool-call enable — 启用详细日志',
                ' /debug-tool-call disable — 关闭调试模式',
                ' /debug-tool-call history — 查看最近调用记录',
                ' /debug-tool-call analyze <id> — 分析特定调用',
                '',
                '调试信息包括:',
                '• 工具调用的输入参数与输出结果',
                '• Token 消耗详情',
                '• 执行时间与延迟',
                '• 错误栈追踪',
            ].join('\n'),
        };
    }
    if (action === 'status' || action === 'st') {
        return {
            type: 'text',
            value: [
                '📊 调试状态',
                '',
                ' 调试模式: 已禁用',
                ' 详细日志: 关闭',
                ' 调用追踪: 关闭',
                '',
                '使用 /debug-tool-call enable 启用详细调试。',
            ].join('\n'),
        };
    }
    if (action === 'enable') {
        return {
            type: 'text',
            value: [
                '🐛 调试模式已启用',
                '',
                '工具调用详情将被记录到控制台。',
                '使用 /logger 查看详细输出。',
            ].join('\n'),
        };
    }
    if (action === 'disable') {
        return { type: 'text', value: '🐛 调试模式已禁用。' };
    }
    if (action === 'history' || action === 'hist') {
        return {
            type: 'text',
            value: [
                '📜 最近工具调用记录',
                '',
                '当前会话中没有工具调用记录。',
                '在执行工具调用后再次运行此命令查看详情。',
            ].join('\n'),
        };
    }
    return {
        type: 'text',
        value: [
            '🐛 未知操作。使用 /debug-tool-call help 查看帮助。',
        ].join('\n'),
    };
};
const debugToolCall = {
    type: 'local',
    name: 'debug-tool-call',
    description: '调试和诊断工具调用，查看详细日志与分析',
    isEnabled: () => !getIsNonInteractiveSession(),
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
export default debugToolCall;
