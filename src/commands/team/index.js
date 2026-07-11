const team = {
    type: 'local-jsx',
    name: 'team',
    description: '团队管理命令',
    load: () => import('./team.js'),
};
export default team;
