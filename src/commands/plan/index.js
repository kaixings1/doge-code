const plan = {
    type: 'local-jsx',
    name: 'plan',
    description: '启用计划模式或查看当前会话计划',
    argumentHint: '[open|<description>]',
    load: () => import('./plan.tsx'),
};
export default plan;
//# sourceMappingURL=index.js.map