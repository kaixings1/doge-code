import { getIsNonInteractiveSession } from '../../bootstrap/state.js';
const call = async (args) => {
    const feedback = args.trim();
    if (!feedback) {
        return {
            type: 'text',
            value: [
                '👍 发送正面反馈',
                '',
                '你的正面反馈能帮助 Claude 变得更好！',
                '',
                '用法:',
                ' /good-claude <反馈内容>',
                ' 例如: /good-claude 今天的代码建议很实用',
                '',
                '反馈将用于:',
                '• 改进模型的回答质量',
                '• 优化代码生成能力',
                '• 调整交互体验',
                '',
                '感谢你的贡献！',
            ].join('\n'),
        };
    }
    return {
        type: 'text',
        value: [
            '✅ 感谢你的正面反馈！',
            '',
            `反馈内容: "${feedback}"`,
            '',
            '你的反馈已被记录，将帮助我们改进 Claude 的能力。',
            '每一次正面的评价都是我们进步的动力！🚀',
        ].join('\n'),
    };
};
const goodClaude = {
    type: 'local',
    name: 'good-claude',
    description: '给 Claude 发送正面反馈，帮助改进 AI 能力',
    isEnabled: () => !getIsNonInteractiveSession(),
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
export default goodClaude;
//# sourceMappingURL=index.js.map