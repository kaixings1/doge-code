import { isClaudeAISubscriber } from '../../utils/auth.js';
const cost = {
    type: 'local',
    name: 'cost',
    description: '显示当前会话的总成本和持续时间',
    get isHidden() {
        // Keep visible for Ants even if they're subscribers (they see cost breakdowns)
        if (process.env.USER_TYPE === 'ant') {
            return false;
        }
        return isClaudeAISubscriber();
    },
    supportsNonInteractive: true,
    load: () => import('./cost.ts'),
};
export default cost;
//# sourceMappingURL=index.js.map