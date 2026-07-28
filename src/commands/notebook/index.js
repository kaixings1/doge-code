// ====== 命令定义（local-jsx 类型） ======
const notebook = {
    type: 'local-jsx',
    name: 'notebook',
    description: '记事本 - 创建、查看、搜索和管理笔记',
    argumentHint: '[create|list|view|edit|delete|pin|search|tags|export]',
    load: () => import('./notebook-ui.js'),
};
export default notebook;
//# sourceMappingURL=index.js.map