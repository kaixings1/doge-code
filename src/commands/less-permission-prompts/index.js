const lessPermissionPrompts = {
    type: 'local',
    name: 'less-permission-prompts',
    description: '扫描会话，生成权限白名单',
    aliases: ['lpp', 'permission-scan'],
    supportsNonInteractive: true,
    load: () => import('./lessPermissionPrompts.js'),
};
export default lessPermissionPrompts;
