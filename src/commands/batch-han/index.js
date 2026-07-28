const batchHan = {
    type: 'local',
    name: 'batch-han',
    description: '批量汉化 TypeScript 文件',
    aliases: ['bh'],
    supportsNonInteractive: true,
    load: () => import('./batch-han.js'),
};
export default batchHan;
//# sourceMappingURL=index.js.map