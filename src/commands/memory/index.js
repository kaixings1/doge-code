const memory = {
    type: 'local-jsx',
    name: 'memory',
    description: '编辑 Claude 记忆文件',
    load: () => import('./memory.tsx'),
};
export default memory;
