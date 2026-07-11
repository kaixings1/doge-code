const changelog = {
    type: 'local-jsx',
    name: 'changelog',
    description: '查看 Claude Code 最新的更新和变更',
    load: () => import('./changelog.js'),
};
export default changelog;
