import { getIsNonInteractiveSession } from '../../bootstrap/state.js';
const call = async (_args, context) => {
    const { messages } = context || {};
    if (!messages || messages.length === 0) {
        return {
            type: 'text',
            value: [
                '📝 会话摘要',
                '',
                '当前会话为空，没有内容可总结。',
            ].join('\n'),
        };
    }
    const userMsgs = messages.filter((m) => m.role === 'user');
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    const toolCalls = messages.reduce((acc, m) => {
        if (m.tool_calls)
            return acc + m.tool_calls.length;
        return acc;
    }, 0);
    // Extract key topics from user messages
    const topics = [];
    const topicKeywords = ['代码', '函数', '类', 'API', '数据库', '部署', '测试', '重构', '优化', '架构'];
    for (const msg of userMsgs.slice(0, 10)) {
        const text = typeof msg.content === 'string' ? msg.content : '';
        for (const keyword of topicKeywords) {
            if (text.includes(keyword) && !topics.includes(keyword)) {
                topics.push(keyword);
            }
        }
    }
    return {
        type: 'text',
        value: [
            '📝 会话摘要',
            '━━━━━━━━━━━━━━━━',
            '',
            `消息总数: ${messages.length}`,
            `用户消息: ${userMsgs.length}`,
            `助手回复: ${assistantMsgs.length}`,
            `工具调用: ${toolCalls}`,
            '',
            `涉及主题: ${topics.length > 0 ? topics.join('、') : '无'}`,
            '',
            '────────────────',
            '💡 提示：使用 AI 生成更详细的会话摘要，',
            '可以运行: /compact "总结本次会话的关键决策和代码变更"',
        ].join('\n'),
    };
};
const summary = {
    type: 'local',
    name: 'summary',
    description: '总结当前会话内容和关键决策',
    isEnabled: () => !getIsNonInteractiveSession(),
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
export default summary;
