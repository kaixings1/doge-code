const rstk = {
    type: 'local',
    name: 'rstk',
    description: '重置 token 统计数据（清空所有已累计的 token 数值）',
    aliases: ['reset-tokens', 'rst'],
    supportsNonInteractive: true,
    load: () => import('./rstk.js'),
};
export default rstk;
//# sourceMappingURL=index.js.map