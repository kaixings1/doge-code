const ide = {
    type: 'local-jsx',
    name: 'ide',
    description: '管理 IDE 集成并显示状态',
    argumentHint: '[open]',
    load: () => import('./ide.tsx'),
};
export default ide;
