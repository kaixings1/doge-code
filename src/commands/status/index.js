const status = {
    type: 'local-jsx',
    name: 'status',
    description: '显示 Claude Code 状态，包括版本、模型、账户、API 连接性和工具状态',
    immediate: true,
    load: () => import('./status.tsx'),
};
export default status;
//# sourceMappingURL=index.js.map