const rename = {
    type: 'local-jsx',
    name: 'rename',
    description: '重命名当前对话',
    immediate: true,
    argumentHint: '[name]',
    load: () => import('./rename.js'),
};
export default rename;
//# sourceMappingURL=index.js.map