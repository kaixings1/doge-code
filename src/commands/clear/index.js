const clear = {
    type: 'local',
    name: 'clear',
    description: '清除对话历史并释放上下文',
    aliases: ['reset', 'new'],
    supportsNonInteractive: false, // Should just create a new session
    load: () => import('./clear.ts'),
};
export default clear;
//# sourceMappingURL=index.js.map