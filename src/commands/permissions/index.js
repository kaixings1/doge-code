const permissions = {
    type: 'local-jsx',
    name: 'permissions',
    aliases: ['allowed-tools'],
    description: '管理允许和拒绝工具权限规则',
    load: () => import('./permissions.js'),
};
export default permissions;
//# sourceMappingURL=index.js.map