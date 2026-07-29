import { getIsNonInteractiveSession } from '../../bootstrap/state.js';
export const context = {
    name: 'context',
    description: '以彩色网格可视化当前上下文使用情况',
    isEnabled: () => !getIsNonInteractiveSession(),
    type: 'local-jsx',
    load: () => import('./context.tsx'),
};
export const contextNonInteractive = {
    type: 'local',
    name: 'context',
    supportsNonInteractive: true,
    description: '显示当前上下文使用情况',
    get isHidden() {
        return !getIsNonInteractiveSession();
    },
    isEnabled() {
        return getIsNonInteractiveSession();
    },
    load: () => import('./context-noninteractive.ts'),
};
//# sourceMappingURL=index.js.map