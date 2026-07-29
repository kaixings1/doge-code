const copy = {
    type: 'local-jsx',
    name: 'copy',
    description: '将 Claude 的最后一次响应复制到剪贴板（或 /copy N 复制第 N 条最新响应）',
    load: () => import('./copy.tsx'),
};
export default copy;
//# sourceMappingURL=index.js.map